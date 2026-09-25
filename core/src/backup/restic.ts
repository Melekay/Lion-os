import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * restic läuft in einem Container mit fester Version (nie „latest“). So kann es die Daten aller Apps lesen,
 * ohne dass lion-core selbst root sein muss. Der Container bekommt kein Netzwerk und nur die nötigen Rechte.
 */
export const RESTIC_IMAGE = "restic/restic:0.18.1";

export type Mount = { quelle: string; ziel: string; nurLesen: boolean };

/** „lesen“: Sichern (Dateien anderer Benutzer lesen). „schreiben“: Wiederherstellen inkl. Besitzer und Rechte. */
export type Rechte = "lesen" | "schreiben";

const RECHTE: Record<Rechte, string[]> = {
  lesen: ["DAC_READ_SEARCH"],
  schreiben: ["DAC_READ_SEARCH", "DAC_OVERRIDE", "CHOWN", "FOWNER"],
};

const SICHERER_PFAD = /^\/[A-Za-z0-9._/-]*$/;

/** Argumente für `docker run` – als Liste, ohne Shell. Reine Funktion, damit sie genau prüfbar ist. */
export function dockerArgumente(o: { mounts: Mount[]; rechte: Rechte; resticArgs: string[]; image?: string; tmpfs?: string[] }): string[] {
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/tmp",
    ...(o.tmpfs ?? []).flatMap((t) => {
      if (!SICHERER_PFAD.test(t)) throw new Error(`Unzulässiger Pfad für den Backup-Container: ${t}`);
      return ["--tmpfs", t];
    }),
    "--cap-drop",
    "ALL",
    ...RECHTE[o.rechte].flatMap((r) => ["--cap-add", r]),
    "--security-opt",
    "no-new-privileges:true",
    "--label",
    "lion.aufgabe=backup",
  ];
  for (const m of o.mounts) {
    for (const pfad of [m.quelle, m.ziel]) {
      if (!SICHERER_PFAD.test(pfad) || pfad.split("/").includes("..")) throw new Error(`Unzulässiger Pfad für den Backup-Container: ${pfad}`);
    }
    args.push("--mount", `type=bind,source=${m.quelle},target=${m.ziel}${m.nurLesen ? ",readonly" : ""}`);
  }
  args.push(o.image ?? RESTIC_IMAGE, "--no-cache", ...o.resticArgs);
  return args;
}

export interface ResticLaeufer {
  /** Führt restic aus und liefert stdout. Wirft mit verständlicher Meldung, wenn restic fehlschlägt. */
  restic(resticArgs: string[], mounts: Mount[], rechte: Rechte, tmpfs?: string[]): Promise<string>;
}

export class ResticFehler extends Error {
  constructor(
    message: string,
    readonly ausgabe: string,
  ) {
    super(message);
  }
}

export class DockerRestic implements ResticLaeufer {
  constructor(private readonly image = RESTIC_IMAGE) {}

  async restic(resticArgs: string[], mounts: Mount[], rechte: Rechte, tmpfs?: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("docker", dockerArgumente({ mounts, rechte, resticArgs, image: this.image, tmpfs }), {
        timeout: 6 * 60 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (e) {
      const f = e as { stderr?: string; message?: string };
      const ausgabe = (f.stderr ?? f.message ?? "").trim();
      throw new ResticFehler(ausgabe.split("\n").slice(-3).join(" ").slice(0, 400) || "restic ist fehlgeschlagen.", ausgabe);
    }
  }
}

export type Sicherung = { id: string; kurz: string; zeit: string; pfade: string[] };

/** `restic snapshots --json` → neueste zuerst. */
export function werteSicherungenAus(json: string): Sicherung[] {
  const roh = JSON.parse(json || "[]") as { id: string; short_id?: string; time: string; paths?: string[] }[];
  return roh
    .map((s) => ({ id: s.id, kurz: s.short_id ?? s.id.slice(0, 8), zeit: new Date(s.time).toISOString(), pfade: s.paths ?? [] }))
    .sort((a, b) => b.zeit.localeCompare(a.zeit));
}

export type Zusammenfassung = { sicherung: string | null; dateienNeu: number; bytesNeu: number };

/** Letzte „summary“-Zeile aus `restic backup --json`. */
export function werteZusammenfassungAus(ausgabe: string): Zusammenfassung {
  for (const zeile of ausgabe.trim().split("\n").reverse()) {
    try {
      const j = JSON.parse(zeile) as { message_type?: string; snapshot_id?: string; files_new?: number; data_added?: number };
      if (j.message_type === "summary") return { sicherung: j.snapshot_id ?? null, dateienNeu: j.files_new ?? 0, bytesNeu: j.data_added ?? 0 };
    } catch {
      /* Fortschrittszeilen oder Text ignorieren */
    }
  }
  return { sicherung: null, dateienNeu: 0, bytesNeu: 0 };
}

/** Unterscheidet „dort ist noch kein Backup“ von „falscher Schlüssel“ anhand der restic-Meldung. */
export function keinRepository(meldung: string): boolean {
  return /Is there a repository at the following location|unable to open config file|does not exist|no such file or directory/i.test(meldung);
}

export function falscherSchluessel(meldung: string): boolean {
  return /wrong password|no key found|ciphertext verification failed/i.test(meldung);
}
