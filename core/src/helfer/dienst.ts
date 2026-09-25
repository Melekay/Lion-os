import { mkdir, rmdir, stat } from "node:fs/promises";
import { z } from "zod";
import { BACKUP_ORDNER, DATEISYSTEME, type Datentraeger, einhaengeOptionen, einhaengepunktFuer, EINHAENGE_BASIS, istUuid, werteLsblkAus } from "./datentraeger.js";

/**
 * lion-helper, Teil 2: die festen Aktionen. Läuft als root, deshalb:
 * - nur diese drei Aktionen, feste Programme mit absoluten Pfaden, keine Shell,
 * - jede UUID wird gegen die frisch gelesene Liste geprüft (nie direkt an mount übergeben),
 * - nichts wird formatiert oder gelöscht (außer dem leeren Einhängeordner).
 */
export type Ausfuehren = (programm: string, argumente: string[]) => Promise<string>;

export const PROGRAMME = {
  lsblk: "/usr/bin/lsblk",
  mount: "/usr/bin/mount",
  umount: "/usr/bin/umount",
  sync: "/usr/bin/sync",
} as const;

const LSBLK_ARGUMENTE = ["--json", "--bytes", "--output", "NAME,PATH,SIZE,TYPE,TRAN,RM,HOTPLUG,FSTYPE,LABEL,UUID,MOUNTPOINTS,MODEL"];

export const Anfrage = z.discriminatedUnion("aktion", [
  z.object({ aktion: z.literal("datentraeger") }),
  z.object({ aktion: z.literal("einhaengen"), uuid: z.string().refine(istUuid, "Ungültige Kennung.") }),
  z.object({ aktion: z.literal("aushaengen"), uuid: z.string().refine(istUuid, "Ungültige Kennung.") }),
]);
export type Anfrage = z.infer<typeof Anfrage>;

export class HelferFehler extends Error {}

export class HelferDienst {
  private kette: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ausfuehren: Ausfuehren,
    private readonly basis = EINHAENGE_BASIS,
  ) {}

  /** Aktionen laufen nacheinander – nie zwei mount-Vorgänge gleichzeitig. */
  bearbeite(a: Anfrage): Promise<unknown> {
    const lauf = this.kette.then(() => this.ausfuehrenAktion(a));
    this.kette = lauf.catch(() => undefined);
    return lauf;
  }

  private async ausfuehrenAktion(a: Anfrage): Promise<unknown> {
    if (a.aktion === "datentraeger") return { datentraeger: await this.liste() };
    if (a.aktion === "einhaengen") return this.einhaengen(a.uuid);
    return this.aushaengen(a.uuid);
  }

  async liste(): Promise<Datentraeger[]> {
    return werteLsblkAus(await this.ausfuehren(PROGRAMME.lsblk, LSBLK_ARGUMENTE), this.basis);
  }

  private async finde(uuid: string): Promise<Datentraeger> {
    const d = (await this.liste()).find((x) => x.uuid === uuid);
    if (!d) throw new HelferFehler("Diesen Datenträger gibt es nicht (mehr). Ist er angeschlossen?");
    return d;
  }

  async einhaengen(uuid: string): Promise<{ einhaengepunkt: string; backupOrdner: string }> {
    const d = await this.finde(uuid);
    const punkt = einhaengepunktFuer(uuid, this.basis);
    if (!d.eingehaengt) {
      await mkdir(punkt, { recursive: true, mode: 0o700 });
      await this.ausfuehren(PROGRAMME.mount, ["-t", DATEISYSTEME[d.dateisystem]!, "-o", einhaengeOptionen(d.dateisystem), "--", d.geraet, punkt]);
    }
    const ordner = `${punkt}/${BACKUP_ORDNER}`;
    await mkdir(ordner, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EEXIST") throw e;
    });
    if (!(await stat(ordner)).isDirectory()) throw new HelferFehler(`${ordner} ist kein Ordner.`);
    return { einhaengepunkt: punkt, backupOrdner: ordner };
  }

  async aushaengen(uuid: string): Promise<{ ok: true }> {
    const d = await this.finde(uuid);
    if (d.eingehaengt) {
      await this.ausfuehren(PROGRAMME.sync, []);
      await this.ausfuehren(PROGRAMME.umount, ["--", d.eingehaengt]);
      await rmdir(d.eingehaengt).catch(() => undefined);
    }
    return { ok: true };
  }
}
