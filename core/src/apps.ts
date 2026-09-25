import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { protokolliere } from "./audit.js";
import type { CaddyVerwaltung } from "./caddy.js";
import type { Datenbank } from "./datenbank.js";
import { appDatenOrdner, type Vorlage } from "./katalog.js";
import type { AppStatus, Laufzeit } from "./laufzeit.js";

/**
 * App-Verwaltung: installieren, starten, stoppen, entfernen.
 * Lange Aktionen laufen im Hintergrund; der Status steht in der Datenbank.
 * Pro App läuft immer nur eine Aktion gleichzeitig.
 */

export const OEFFENTLICHER_BASISPORT = 8100;
export const LOKALER_BASISPORT = 18100;
export const MAX_APPS = 99;

export type GespeicherterStatus = "installiere" | "laeuft" | "gestoppt" | "fehler" | "entferne";

export type AppZeile = { id: string; nummer: number; status: GespeicherterStatus; meldung: string | null; installiert_am: string };

export type AppAnsicht = {
  id: string;
  name: string;
  beschreibung: string;
  kategorie: string;
  version: string;
  sicherheitsstufe: string;
  hinweise: string[];
  medien: "keine" | "lesen" | "schreiben";
  installiert: null | {
    status: GespeicherterStatus | AppStatus;
    meldung: string | null;
    adressen: string[];
    datenordner: string;
  };
};

export class AppFehler extends Error {
  constructor(
    message: string,
    readonly code: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export type AppVerwaltungOptionen = {
  db: Datenbank;
  vorlagen: Vorlage[];
  laufzeit: Laufzeit;
  caddy: CaddyVerwaltung;
  zustandsOrdner: string; // /var/lib/lion/apps
  datenOrdner: string; // /srv/lion/apps
  medienOrdner?: string; // /srv/lion/medien
};

const projektName = (id: string) => `lion-app-${id}`;
export const erzeugeGeheimnis = () => randomBytes(32).toString("hex");

export class AppVerwaltung {
  private aufgaben = new Map<string, Promise<void>>();

  constructor(private readonly o: AppVerwaltungOptionen) {}

  private vorlage(id: string): Vorlage {
    const v = this.o.vorlagen.find((x) => x.manifest.id === id);
    if (!v) throw new AppFehler(`Unbekannte App: ${id}`, 404);
    return v;
  }

  private zeile(id: string): AppZeile | undefined {
    return this.o.db.prepare("SELECT * FROM apps WHERE id = ?").get(id) as AppZeile | undefined;
  }

  private setzeStatus(id: string, status: GespeicherterStatus, meldung: string | null = null) {
    this.o.db.prepare("UPDATE apps SET status = ?, meldung = ? WHERE id = ?").run(status, meldung, id);
  }

  private verzeichnisse(id: string) {
    return { zustand: join(this.o.zustandsOrdner, id), daten: join(this.o.datenOrdner, id) };
  }

  static ports(nummer: number) {
    return { oeffentlich: OEFFENTLICHER_BASISPORT + nummer, lokal: LOKALER_BASISPORT + nummer };
  }

  private freieNummer(): number {
    const belegt = new Set((this.o.db.prepare("SELECT nummer FROM apps").all() as { nummer: number }[]).map((z) => z.nummer));
    for (let n = 1; n <= MAX_APPS; n++) if (!belegt.has(n)) return n;
    throw new AppFehler("Keine freien Ports mehr.", 409);
  }

  // ---- Für das Backup ----------------------------------------------------
  /** Apps, die laut Datenbank laufen und gerade keine andere Aktion haben. */
  laufendeApps(): string[] {
    return (this.o.db.prepare("SELECT id FROM apps WHERE status = 'laeuft' ORDER BY id").all() as { id: string }[])
      .map((z) => z.id)
      .filter((id) => !this.aufgaben.has(id));
  }

  /** Hält eine App an, ohne ihren gespeicherten Status zu ändern (sie gilt weiter als „läuft“). */
  async anhalten(id: string): Promise<void> {
    await this.o.laufzeit.stoppen(projektName(id), this.verzeichnisse(id).zustand);
  }

  async fortsetzen(id: string): Promise<void> {
    await this.o.laufzeit.starten(projektName(id), this.verzeichnisse(id).zustand);
  }

  istInstalliert(id: string): boolean {
    return this.zeile(id) !== undefined;
  }

    /** Startet eine Hintergrund-Aufgabe; wirft, wenn für die App schon eine läuft. */
  private starteAufgabe(id: string, arbeit: () => Promise<void>) {
    if (this.aufgaben.has(id)) throw new AppFehler("Für diese App läuft bereits eine Aktion.", 409);
    const p = arbeit().finally(() => this.aufgaben.delete(id));
    this.aufgaben.set(id, p.catch(() => undefined));
  }

  /** Für Tests und geordnetes Herunterfahren: wartet, bis die laufende Aktion fertig ist. */
  async warteAuf(id: string) {
    await this.aufgaben.get(id);
  }

  installieren(id: string, benutzer: string) {
    const v = this.vorlage(id);
    if (this.zeile(id)) throw new AppFehler(`${v.manifest.name} ist bereits installiert.`, 409);
    const nummer = this.freieNummer();
    this.o.db
      .prepare("INSERT INTO apps (id, nummer, status, meldung, installiert_am) VALUES (?, ?, 'installiere', NULL, ?)")
      .run(id, nummer, new Date().toISOString());

    this.starteAufgabe(id, async () => {
      const { zustand, daten } = this.verzeichnisse(id);
      const ports = AppVerwaltung.ports(nummer);
      try {
        await mkdir(zustand, { recursive: true, mode: 0o750 });
        await mkdir(daten, { recursive: true, mode: 0o750 });
        await legeDatenordnerAn(daten, appDatenOrdner(v.compose));
        await writeFile(join(zustand, "compose.yaml"), v.compose, { mode: 0o640 });
        const umgebung = [
          `LION_APP_PORT=${ports.lokal}`,
          `LION_APP_DATA=${daten}`,
          ...(v.manifest.medien !== "keine" ? [`LION_MEDIEN=${this.o.medienOrdner ?? "/srv/lion/medien"}`] : []),
          ...v.manifest.geheimnisse.map((g) => `${g}=${erzeugeGeheimnis()}`),
        ].join("\n");
        await writeFile(join(zustand, ".env"), `${umgebung}\n`, { mode: 0o600 });
        await this.o.laufzeit.hochfahren(projektName(id), zustand);
        await this.o.caddy.eintragSetzen(id, ports.oeffentlich, ports.lokal);
        this.setzeStatus(id, "laeuft");
        protokolliere(this.o.db, { benutzer, aktion: "app.installieren", ziel: id, ergebnis: "erfolg" });
      } catch (e) {
        const meldung = kurz(e);
        this.setzeStatus(id, "fehler", meldung);
        protokolliere(this.o.db, { benutzer, aktion: "app.installieren", ziel: id, ergebnis: "fehler", details: meldung });
      }
    });
  }

  starten(id: string, benutzer: string) {
    this.aktion(id, benutzer, "app.starten", async (z) => {
      await this.o.laufzeit.starten(projektName(id), z);
      this.setzeStatus(id, "laeuft");
    });
  }

  stoppen(id: string, benutzer: string) {
    this.aktion(id, benutzer, "app.stoppen", async (z) => {
      await this.o.laufzeit.stoppen(projektName(id), z);
      this.setzeStatus(id, "gestoppt");
    });
  }

  /** Entfernt Container, Caddy-Eintrag und Zustand. Die Daten bleiben bewusst erhalten. */
  entfernen(id: string, benutzer: string, bestaetigung: unknown) {
    if (bestaetigung !== id) throw new AppFehler(`Zum Entfernen bitte „${id}“ als Bestätigung angeben.`, 400);
    const zeile = this.zeile(id);
    if (!zeile) throw new AppFehler("Diese App ist nicht installiert.", 404);
    if (this.aufgaben.has(id)) throw new AppFehler("Für diese App läuft bereits eine Aktion.", 409);
    this.setzeStatus(id, "entferne");
    this.starteAufgabe(id, async () => {
      const { zustand } = this.verzeichnisse(id);
      try {
        await this.o.laufzeit.entfernen(projektName(id), zustand);
        await this.o.caddy.eintragEntfernen(id);
        await rm(zustand, { recursive: true, force: true });
        this.o.db.prepare("DELETE FROM apps WHERE id = ?").run(id);
        protokolliere(this.o.db, { benutzer, aktion: "app.entfernen", ziel: id, ergebnis: "erfolg", details: "Daten behalten" });
      } catch (e) {
        const meldung = kurz(e);
        this.setzeStatus(id, "fehler", meldung);
        protokolliere(this.o.db, { benutzer, aktion: "app.entfernen", ziel: id, ergebnis: "fehler", details: meldung });
      }
    });
  }

  private aktion(id: string, benutzer: string, name: string, arbeit: (zustand: string) => Promise<void>) {
    this.vorlage(id);
    const zeile = this.zeile(id);
    if (!zeile) throw new AppFehler("Diese App ist nicht installiert.", 404);
    if (zeile.status === "installiere" || zeile.status === "entferne") throw new AppFehler("Bitte warten, bis die laufende Aktion fertig ist.", 409);
    this.starteAufgabe(id, async () => {
      try {
        await arbeit(this.verzeichnisse(id).zustand);
        protokolliere(this.o.db, { benutzer, aktion: name, ziel: id, ergebnis: "erfolg" });
      } catch (e) {
        const meldung = kurz(e);
        this.setzeStatus(id, "fehler", meldung);
        protokolliere(this.o.db, { benutzer, aktion: name, ziel: id, ergebnis: "fehler", details: meldung });
      }
    });
  }

  /** Die letzten Zeilen aus dem Protokoll der App-Container (z. B. für ein Start-Passwort). */
  async protokoll(id: string): Promise<{ zeilen: string[] }> {
    this.vorlage(id);
    if (!this.zeile(id)) throw new AppFehler("Diese App ist nicht installiert.", 404);
    const text = await this.o.laufzeit.protokoll(projektName(id), this.verzeichnisse(id).zustand);
    return { zeilen: bereinigeProtokoll(text) };
  }

  async liste(): Promise<AppAnsicht[]> {
    const adressen = await this.o.caddy.adressen();
    return Promise.all(
      this.o.vorlagen.map(async ({ manifest: m }) => {
        const z = this.zeile(m.id);
        let installiert: AppAnsicht["installiert"] = null;
        if (z) {
          const { oeffentlich } = AppVerwaltung.ports(z.nummer);
          let status: GespeicherterStatus | AppStatus = z.status;
          if ((z.status === "laeuft" || z.status === "gestoppt") && !this.aufgaben.has(m.id)) {
            const live = await this.o.laufzeit.status(projektName(m.id), this.verzeichnisse(m.id).zustand);
            if (live !== "unbekannt") status = live;
          }
          installiert = {
            status,
            meldung: z.meldung,
            adressen: adressen.map((a) => `https://${a}:${oeffentlich}`),
            datenordner: this.verzeichnisse(m.id).daten,
          };
        }
        return {
          id: m.id,
          name: m.name,
          beschreibung: m.beschreibung,
          kategorie: m.kategorie,
          version: m.version,
          sicherheitsstufe: m.sicherheitsstufe,
          hinweise: m.hinweise,
          medien: m.medien,
          installiert,
        };
      }),
    );
  }
}

/** Kurze, protokollierbare Fehlermeldung (ohne riesige Docker-Ausgaben). */
function kurz(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.length > 500 ? `${text.slice(0, 500)} …` : text;
}

/**
 * Legt die eingebundenen Datenordner vorab an. Neue Ordner werden für alle beschreibbar (0777),
 * damit auch Images mit eigenem Benutzer (z. B. UID 1000) hineinschreiben können. Privat bleiben
 * sie trotzdem: Der App-Ordner darüber gehört lion und hat 0750. Vorhandene Ordner bleiben
 * unverändert – manche Apps (z. B. PostgreSQL) setzen dort bewusst strengere Rechte.
 */
export async function legeDatenordnerAn(daten: string, ordner: string[]): Promise<void> {
  for (const relativ of ordner) {
    let aktuell = daten;
    for (const teil of relativ.split("/")) {
      aktuell = join(aktuell, teil);
      const vorhanden = await stat(aktuell).then(() => true, () => false);
      if (vorhanden) continue;
      await mkdir(aktuell);
      await chmod(aktuell, 0o777);
    }
  }
}

const MAX_ZEILEN = 300;

/** Entfernt Farbcodes und Steuerzeichen und begrenzt die Länge. */
export function bereinigeProtokoll(text: string): string[] {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .split("\n")
    .map((z) => (z.length > 2000 ? `${z.slice(0, 2000)} …` : z))
    .filter((z) => z.trim() !== "")
    .slice(-MAX_ZEILEN);
}
