import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * Container-Laufzeit. lion-core ruft Docker ausschließlich über diese feste Liste von Aktionen auf –
 * ohne Shell, mit festen Argumenten. Für Tests gibt es eine Attrappe.
 */
export type AppStatus = "laeuft" | "gestoppt" | "teilweise" | "unbekannt";

export interface Laufzeit {
  hochfahren(projekt: string, verzeichnis: string): Promise<void>;
  starten(projekt: string, verzeichnis: string): Promise<void>;
  stoppen(projekt: string, verzeichnis: string): Promise<void>;
  entfernen(projekt: string, verzeichnis: string): Promise<void>;
  status(projekt: string, verzeichnis: string): Promise<AppStatus>;
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
