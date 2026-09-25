import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Container-Laufzeit. lion-core ruft Docker ausschließlich über diese feste Liste von Aktionen auf –
 * ohne Shell, mit festen Argumenten. Für Tests gibt es eine Attrappe.
 */
export type AppStatus = "laeuft" | "gestoppt" | "teilweise" | "unbekannt";

/** Live-Verbrauch einer App (Summe ihrer Container). CPU wie bei Docker: 100 % = ein voller Kern. */
export type Ressourcen = { cpuProzent: number; ramMb: number };

export interface Laufzeit {
  hochfahren(projekt: string, verzeichnis: string): Promise<void>;
  starten(projekt: string, verzeichnis: string): Promise<void>;
  stoppen(projekt: string, verzeichnis: string): Promise<void>;
  entfernen(projekt: string, verzeichnis: string): Promise<void>;
  status(projekt: string, verzeichnis: string): Promise<AppStatus>;
  /** Letzte Protokollzeilen aller Container der App (Text). */
  protokoll(projekt: string, verzeichnis: string): Promise<string>;
  /** Live-Verbrauch aller laufenden Lion-Apps, nach Projektname (lion-app-…). */
  ressourcen(): Promise<Map<string, Ressourcen>>;
}

const ausfuehren = promisify(execFile);
const ZEITLIMIT_MS = 15 * 60 * 1000; // Image-Downloads können dauern

export class DockerComposeLaufzeit implements Laufzeit {
  constructor(private readonly docker = "docker") {}

  private async compose(projekt: string, verzeichnis: string, ...argumente: string[]): Promise<string> {
    if (!/^lion-app-[a-z0-9-]+$/.test(projekt)) throw new Error(`Ungültiger Projektname: ${projekt}`);
    const { stdout } = await ausfuehren(
      this.docker,
      ["compose", "--project-name", projekt, "--project-directory", verzeichnis, "--file", `${verzeichnis}/compose.yaml`, "--env-file", `${verzeichnis}/.env`, ...argumente],
      { timeout: ZEITLIMIT_MS, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  }

  async hochfahren(p: string, v: string) {
    await this.compose(p, v, "up", "--detach", "--remove-orphans", "--wait", "--wait-timeout", "600");
  }
  async starten(p: string, v: string) {
    await this.compose(p, v, "start");
  }
  async stoppen(p: string, v: string) {
    await this.compose(p, v, "stop");
  }
  async entfernen(p: string, v: string) {
    await this.compose(p, v, "down", "--remove-orphans");
  }
  async protokoll(p: string, v: string): Promise<string> {
    return this.compose(p, v, "logs", "--no-color", "--timestamps", "--tail", "300");
  }
  async ressourcen(): Promise<Map<string, Ressourcen>> {
    const optionen = { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 };
    const { stdout: ps } = await ausfuehren(
      this.docker,
      ["ps", "--filter", "label=com.docker.compose.project", "--format", '{{.ID}}\t{{.Label "com.docker.compose.project"}}'],
      optionen,
    );
    const container = werteContainerAus(ps);
    if (container.size === 0) return new Map();
    const { stdout: stats } = await ausfuehren(this.docker, ["stats", "--no-stream", "--format", "{{json .}}", ...container.keys()], optionen);
    return summiereRessourcen(container, werteStatsAus(stats));
  }

  async status(p: string, v: string): Promise<AppStatus> {
    try {
      const ausgabe = await this.compose(p, v, "ps", "--all", "--format", "json");
      return werteStatusAus(ausgabe);
    } catch {
      return "unbekannt";
    }
  }
}

/** Wertet `docker compose ps --format json` aus (ein JSON-Objekt pro Zeile oder ein Array). */
export function werteStatusAus(ausgabe: string): AppStatus {
  const text = ausgabe.trim();
  if (!text) return "gestoppt";
  let eintraege: { State?: string }[];
  try {
    eintraege = text.startsWith("[") ? JSON.parse(text) : text.split("\n").filter(Boolean).map((z) => JSON.parse(z));
  } catch {
    return "unbekannt";
  }
  if (eintraege.length === 0) return "gestoppt";
  const laufend = eintraege.filter((e) => e.State === "running").length;
  if (laufend === eintraege.length) return "laeuft";
  if (laufend === 0) return "gestoppt";
  return "teilweise";
}

const CONTAINER_ID = /^[0-9a-f]{12,64}$/;
const LION_PROJEKT = /^lion-app-[a-z0-9-]+$/;

/** `docker ps` (ID ⇥ Compose-Projekt) → nur Container von Lion-Apps, ID → Projekt. */
export function werteContainerAus(ausgabe: string): Map<string, string> {
  const ergebnis = new Map<string, string>();
  for (const zeile of ausgabe.split("\n")) {
    const [id = "", projekt = ""] = zeile.trim().split("\t");
    if (CONTAINER_ID.test(id) && LION_PROJEKT.test(projekt)) ergebnis.set(id, projekt);
  }
  return ergebnis;
}

const EINHEIT_MB: Record<string, number> = {
  b: 1 / (1024 * 1024),
  kb: 1000 / (1024 * 1024),
  kib: 1 / 1024,
  mb: 1_000_000 / (1024 * 1024),
  mib: 1,
  gb: 1_000_000_000 / (1024 * 1024),
  gib: 1024,
  tb: 1e12 / (1024 * 1024),
  tib: 1024 * 1024,
};

/** „45.3MiB“, „1.2GiB“, „512kB“ → MB (MiB). Unbekanntes → 0. */
export function groesseInMb(text: string): number {
  const t = /^\s*([\d.]+)\s*([a-z]+)\s*$/i.exec(text);
  if (!t) return 0;
  const faktor = EINHEIT_MB[t[2]!.toLowerCase()];
  const wert = Number(t[1]);
  return faktor && Number.isFinite(wert) ? wert * faktor : 0;
}

/** `docker stats --format "{{json .}}"` → Verbrauch je Container-ID (auf 12 Zeichen gekürzt). */
export function werteStatsAus(ausgabe: string): Map<string, Ressourcen> {
  const ergebnis = new Map<string, Ressourcen>();
  for (const zeile of ausgabe.split("\n")) {
    if (!zeile.trim()) continue;
    try {
      const d = JSON.parse(zeile) as { ID?: string; Container?: string; CPUPerc?: string; MemUsage?: string };
      const id = (d.ID ?? d.Container ?? "").slice(0, 12);
      if (!CONTAINER_ID.test(id)) continue;
      const cpu = Number.parseFloat((d.CPUPerc ?? "").replace("%", ""));
      const ram = groesseInMb((d.MemUsage ?? "").split("/")[0] ?? "");
      ergebnis.set(id, { cpuProzent: Number.isFinite(cpu) ? cpu : 0, ramMb: ram });
    } catch {
      /* kaputte Zeile überspringen */
    }
  }
  return ergebnis;
}

/** Summiert den Verbrauch aller Container je Projekt. */
export function summiereRessourcen(container: Map<string, string>, stats: Map<string, Ressourcen>): Map<string, Ressourcen> {
  const ergebnis = new Map<string, Ressourcen>();
  for (const [id, projekt] of container) {
    const s = stats.get(id.slice(0, 12));
    if (!s) continue;
    const bisher = ergebnis.get(projekt) ?? { cpuProzent: 0, ramMb: 0 };
    ergebnis.set(projekt, { cpuProzent: bisher.cpuProzent + s.cpuProzent, ramMb: bisher.ramMb + s.ramMb });
  }
  return ergebnis;
}
