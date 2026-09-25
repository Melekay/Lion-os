/**
 * lion-helper, Teil 1: externe Datenträger erkennen. Reine Logik ohne Seiteneffekte – gut testbar.
 * Grundsatz: lieber einen Datenträger zu wenig anzeigen als die System- oder Datenplatte anbieten.
 */

export const EINHAENGE_BASIS = "/media/lion";
export const BACKUP_ORDNER = "lion-backup";

/** Dateisysteme, die wir einhängen (lsblk-Name → mount -t). Kein Formatieren, nie. */
export const DATEISYSTEME: Record<string, string> = {
  ext4: "ext4",
  xfs: "xfs",
  btrfs: "btrfs",
  exfat: "exfat",
  vfat: "vfat",
  ntfs: "ntfs3",
};

/** Einhängepunkte, an denen wir einen Datenträger als System-Datenträger erkennen. */
const SYSTEM_PFADE = ["/", "/boot", "/boot/efi", "/usr", "/var", "/home", "/opt", "/srv", "/etc", "[SWAP]"];

/** UUIDs von ext4 (8-4-4-4-12), FAT (ABCD-1234), NTFS/exFAT (16 Hex) – nur Buchstaben, Ziffern und „-“. */
const UUID = /^[A-Za-z0-9](?:[A-Za-z0-9-]{2,62}[A-Za-z0-9])$/;

export function istUuid(wert: unknown): wert is string {
  return typeof wert === "string" && UUID.test(wert);
}

export type Datentraeger = {
  uuid: string;
  name: string;
  groesseBytes: number;
  dateisystem: string;
  geraet: string;
  /** Aktueller Einhängepunkt unter /media/lion, sonst null */
  eingehaengt: string | null;
  backupOrdner: string;
};

type LsblkGeraet = {
  name?: string;
  path?: string;
  size?: number | string;
  type?: string;
  tran?: string | null;
  rm?: boolean | string | number;
  hotplug?: boolean | string | number;
  fstype?: string | null;
  label?: string | null;
  uuid?: string | null;
  mountpoints?: (string | null)[];
  mountpoint?: string | null;
  model?: string | null;
  children?: LsblkGeraet[];
};

const wahr = (w: unknown) => w === true || w === 1 || w === "1" || w === "true";

function einhaengepunkte(g: LsblkGeraet): string[] {
  const liste = g.mountpoints ?? (g.mountpoint !== undefined ? [g.mountpoint] : []);
  return liste.filter((m): m is string => typeof m === "string" && m.length > 0);
}

function alleTeile(g: LsblkGeraet): LsblkGeraet[] {
  return [g, ...(g.children ?? []).flatMap(alleTeile)];
}

export function einhaengepunktFuer(uuid: string, basis = EINHAENGE_BASIS): string {
  return `${basis}/${uuid}`;
}

/** Sichere Namensanzeige: nur druckbare Zeichen, gekürzt. */
function anzeige(text: string | null | undefined): string {
  return (text ?? "").replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 40);
}

/**
 * Wertet `lsblk --json --bytes -o NAME,PATH,SIZE,TYPE,TRAN,RM,HOTPLUG,FSTYPE,LABEL,UUID,MOUNTPOINTS,MODEL` aus.
 * Angeboten werden nur Dateisysteme auf USB-/Wechsel-Datenträgern, deren Platte nirgends als System eingehängt ist.
 */
export function werteLsblkAus(json: string, basis = EINHAENGE_BASIS): Datentraeger[] {
  let daten: { blockdevices?: LsblkGeraet[] };
  try {
    daten = JSON.parse(json);
  } catch {
    return [];
  }
  const ergebnis: Datentraeger[] = [];
  for (const platte of daten.blockdevices ?? []) {
    if (platte.type !== "disk") continue;
    const extern = platte.tran === "usb" || wahr(platte.hotplug) || wahr(platte.rm);
    if (!extern) continue;
    const teile = alleTeile(platte);
    // Irgendwo auf dieser Platte ein System-Einhängepunkt oder etwas außerhalb von /media/lion? Dann Finger weg.
    const fremdGenutzt = teile.some((t) =>
      einhaengepunkte(t).some((m) => SYSTEM_PFADE.includes(m) || !m.startsWith(`${basis}/`)),
    );
    if (fremdGenutzt) continue;
    for (const t of teile) {
      const fs = t.fstype ?? "";
      if (!(fs in DATEISYSTEME) || !istUuid(t.uuid) || typeof t.path !== "string" || !/^\/dev\/[A-Za-z0-9]+$/.test(t.path)) continue;
      const uuid = t.uuid;
      const punkt = einhaengepunkte(t).find((m) => m === einhaengepunktFuer(uuid, basis)) ?? null;
      ergebnis.push({
        uuid,
        name: anzeige(t.label) || anzeige(platte.model) || "USB-Datenträger",
        groesseBytes: Number(t.size) || 0,
        dateisystem: fs,
        geraet: t.path,
        eingehaengt: punkt,
        backupOrdner: `${einhaengepunktFuer(uuid, basis)}/${BACKUP_ORDNER}`,
      });
    }
  }
  return ergebnis;
}

/** Einhänge-Optionen: nie Programme ausführen, keine Geräte- oder SUID-Dateien. */
export function einhaengeOptionen(dateisystem: string): string {
  const basis = "nosuid,nodev,noexec,noatime";
  // FAT/exFAT/NTFS kennen keine Unix-Rechte: nur root (restic-Container) darf lesen und schreiben.
  if (dateisystem === "vfat" || dateisystem === "exfat" || dateisystem === "ntfs") return `${basis},uid=0,gid=0,umask=0077`;
  return basis;
}

/** Aus einem Backup-Ziel die UUID lesen, wenn es auf einem von lion-helper eingehängten Datenträger liegt. */
export function uuidAusZiel(ziel: string): string | null {
  const t = new RegExp(`^${EINHAENGE_BASIS}/([^/]+)(/|$)`).exec(ziel);
  return t && istUuid(t[1]) ? t[1]! : null;
}
