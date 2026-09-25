import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Schreibt pro App einen Caddy-Eintrag (HTTPS auf eigenem Port → 127.0.0.1:<lokaler Port>)
 * und lädt Caddy neu. Die Adressen stammen aus /etc/lion/adressen (vom Installer).
 */
export interface CaddyVerwaltung {
  eintragSetzen(appId: string, oeffentlicherPort: number, lokalerPort: number): Promise<void>;
  eintragEntfernen(appId: string): Promise<void>;
  adressen(): Promise<string[]>;
}

const ausfuehren = promisify(execFile);
const HOST = /^[A-Za-z0-9.-]+$/;

export function renderEintrag(adressen: string[], oeffentlicherPort: number, lokalerPort: number): string {
  const sichere = adressen.filter((a) => HOST.test(a));
  const liste = (sichere.length ? sichere : ["localhost"]).map((a) => `https://${a}:${oeffentlicherPort}`).join(", ");
  return [
    "# Von lion-core erzeugt – nicht von Hand ändern.",
    `${liste} {`,
    "\ttls internal",
    "\tencode zstd gzip",
    `\treverse_proxy 127.0.0.1:${lokalerPort}`,
    "}",
    "",
  ].join("\n");
}

export class DateiCaddy implements CaddyVerwaltung {
  constructor(
    private readonly verzeichnis: string,
    private readonly adressDatei: string,
    private readonly container = "lion-caddy",
    private readonly neuLaden: () => Promise<void> = async () => {
      await ausfuehren("docker", ["exec", this.container, "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"], {
        timeout: 60_000,
      });
    },
  ) {}

  async adressen(): Promise<string[]> {
    try {
      const text = await readFile(this.adressDatei, "utf8");
      const liste = text.split("\n").map((z) => z.trim()).filter((z) => z && HOST.test(z));
      return liste.length ? liste : ["localhost"];
    } catch {
      return ["localhost"];
    }
  }

  private pfad(appId: string) {
    if (!/^[a-z0-9-]+$/.test(appId)) throw new Error(`Ungültige App-ID: ${appId}`);
    return join(this.verzeichnis, `${appId}.caddy`);
  }

  async eintragSetzen(appId: string, oeffentlicherPort: number, lokalerPort: number) {
    await writeFile(this.pfad(appId), renderEintrag(await this.adressen(), oeffentlicherPort, lokalerPort), { mode: 0o644 });
    await this.neuLaden();
  }

  async eintragEntfernen(appId: string) {
    await rm(this.pfad(appId), { force: true });
    await this.neuLaden();
  }
}
