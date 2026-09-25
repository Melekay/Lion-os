import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * App-Katalog: lädt Vorlagen (lion-app.yaml + compose.yaml) und prüft sie gegen die Sicherheitsregeln.
 * Eine Vorlage, die eine Regel verletzt, wird nicht angeboten.
 */

const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const GEHEIMNIS = /^[A-Z][A-Z0-9_]{2,63}$/;

export const ManifestSchema = z.object({
  id: z.string().regex(ID),
  name: z.string().min(1).max(60),
  beschreibung: z.string().min(1).max(300),
  version: z.string().min(1).max(40),
  kategorie: z.string().min(1).max(40),
  sicherheitsstufe: z.enum(["normal", "sensibel", "vollzugriff"]),
  web: z.object({ dienst: z.string().min(1), port: z.number().int().min(1).max(65535) }),
  geheimnisse: z.array(z.string().regex(GEHEIMNIS)).default([]),
  ressourcen: z.object({ ram_min_mb: z.number().int().min(0) }).default({ ram_min_mb: 0 }),
  hinweise: z.array(z.string().max(300)).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type Vorlage = { manifest: Manifest; compose: string; verzeichnis: string };

const VERBOTENE_SCHLUESSEL = ["privileged", "devices", "cap_add", "pid", "ipc", "userns_mode", "cgroup_parent"] as const;

/** Prüft eine Compose-Datei gegen die Lion-OS-Regeln. Liefert eine Liste von Verstößen (leer = in Ordnung). */
export function pruefeCompose(composeText: string, manifest: Manifest): string[] {
  const fehler: string[] = [];
  if (/docker\.sock/.test(composeText)) fehler.push("Zugriff auf den Docker-Socket ist verboten.");

  let doc: unknown;
  try {
    doc = parse(composeText);
  } catch (e) {
    return [`compose.yaml ist kein gültiges YAML: ${(e as Error).message}`];
  }
  const services = (doc as { services?: Record<string, Record<string, unknown>> })?.services;
  if (!services || typeof services !== "object" || Object.keys(services).length === 0) {
    return ["compose.yaml enthält keine Dienste."];
  }
  if (!(manifest.web.dienst in services)) fehler.push(`Web-Dienst „${manifest.web.dienst}“ fehlt in compose.yaml.`);

  for (const [name, dienst] of Object.entries(services)) {
    const wo = `Dienst „${name}“`;
    const image = dienst.image;
    if (typeof image !== "string" || image.trim() === "") {
      fehler.push(`${wo}: Image fehlt (eigene Builds sind nicht erlaubt).`);
    } else {
      const ohneRegistry = image.split("/").pop() ?? image;
      if (!ohneRegistry.includes(":") && !image.includes("@sha256:")) fehler.push(`${wo}: Image ohne feste Version (${image}).`);
      if (/:latest$/.test(image)) fehler.push(`${wo}: „latest“ ist verboten (${image}).`);
    }
    for (const k of VERBOTENE_SCHLUESSEL) {
      if (k in dienst) fehler.push(`${wo}: „${k}“ ist verboten.`);
    }
    if ("network_mode" in dienst) fehler.push(`${wo}: „network_mode“ ist verboten.`);
    if ("build" in dienst) fehler.push(`${wo}: „build“ ist verboten.`);

    const ports = Array.isArray(dienst.ports) ? dienst.ports : dienst.ports === undefined ? [] : [dienst.ports];
    if (name === manifest.web.dienst) {
      const erwartet = `127.0.0.1:\${LION_APP_PORT}:${manifest.web.port}`;
      if (ports.length !== 1 || ports[0] !== erwartet) fehler.push(`${wo}: Genau ein Port „${erwartet}“ erwartet.`);
    } else if (ports.length > 0) {
      fehler.push(`${wo}: Nur der Web-Dienst darf Ports veröffentlichen.`);
    }
    if ("expose" in dienst && name !== manifest.web.dienst) {
      /* expose ist nur intern – erlaubt */
    }

    const volumes = Array.isArray(dienst.volumes) ? dienst.volumes : [];
    for (const v of volumes) {
      const quelle = typeof v === "string" ? v.split(":")[0] : (v as { source?: string; type?: string })?.source;
      const typ = typeof v === "string" ? undefined : (v as { type?: string })?.type;
      if (typeof quelle !== "string") {
        fehler.push(`${wo}: Ungültiger Volume-Eintrag.`);
        continue;
      }
      const istPfad = quelle.startsWith("/") || quelle.startsWith(".") || quelle.startsWith("~") || quelle.startsWith("$") || typ === "bind";
      if (istPfad && !/^\$\{LION_APP_DATA\}(\/[A-Za-z0-9._-]+)*$/.test(quelle)) {
        fehler.push(`${wo}: Host-Pfad „${quelle}“ nicht erlaubt – nur \${LION_APP_DATA}/…`);
      }
      if (quelle.includes("..")) fehler.push(`${wo}: „..“ in Pfaden ist verboten.`);
    }
  }

  // Nur bekannte Variablen verwenden.
  const erlaubt = new Set(["LION_APP_PORT", "LION_APP_DATA", ...manifest.geheimnisse]);
  for (const treffer of composeText.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!erlaubt.has(treffer[1]!)) fehler.push(`Unbekannte Variable \${${treffer[1]}} – als Geheimnis im Manifest eintragen.`);
  }
  return [...new Set(fehler)];
}

export async function ladeKatalog(verzeichnis: string): Promise<{ vorlagen: Vorlage[]; fehler: string[] }> {
  const vorlagen: Vorlage[] = [];
  const fehler: string[] = [];
  let eintraege: string[];
  try {
    eintraege = (await readdir(verzeichnis, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { vorlagen, fehler: [`App-Katalog nicht gefunden: ${verzeichnis}`] };
  }
  for (const ordner of eintraege.sort()) {
    const pfad = join(verzeichnis, ordner);
    try {
      const manifest = ManifestSchema.parse(parse(await readFile(join(pfad, "lion-app.yaml"), "utf8")));
      if (manifest.id !== ordner) throw new Error(`id „${manifest.id}“ passt nicht zum Ordnernamen`);
      const compose = await readFile(join(pfad, "compose.yaml"), "utf8");
      const verstoesse = pruefeCompose(compose, manifest);
      if (verstoesse.length) throw new Error(verstoesse.join(" "));
      vorlagen.push({ manifest, compose, verzeichnis: pfad });
    } catch (e) {
      const text = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
      fehler.push(`${ordner}: ${text}`);
    }
  }
  return { vorlagen, fehler };
}
