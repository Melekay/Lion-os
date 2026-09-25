import { realpath, stat } from "node:fs/promises";
import { isAbsolute, sep } from "node:path";

export class ZielFehler extends Error {}

export type ZielRegeln = {
  /** Nur hier dürfen Backup-Ziele liegen (z. B. /mnt und /media für USB-Platten und Netzlaufwerke). */
  erlaubt: string[];
  /** Ordner mit den App-Daten – das Ziel soll auf einem anderen Datenträger liegen. */
  daten: string;
  /** In Tests abschaltbar, weil dort alles auf einer Platte liegt. */
  anderesGeraetPflicht?: boolean;
};

/**
 * Prüft ein Backup-Ziel und liefert den echten Pfad (Symlinks aufgelöst).
 * Der Pfad wird später in einen Container eingebunden – deshalb streng: nur unterhalb der erlaubten Ordner.
 */
export async function pruefeZiel(eingabe: string, r: ZielRegeln): Promise<string> {
  const pfad = eingabe.trim();
  if (!pfad || !isAbsolute(pfad)) throw new ZielFehler("Bitte einen vollständigen Pfad angeben, z. B. /mnt/usb-backup.");
  if (!/^[A-Za-z0-9._/-]+$/.test(pfad)) throw new ZielFehler("Der Pfad darf nur Buchstaben ohne Umlaute, Ziffern und . _ - / enthalten.");
  let echt: string;
  try {
    echt = await realpath(pfad);
  } catch {
    throw new ZielFehler(`${pfad} gibt es nicht. Ist die Festplatte eingehängt?`);
  }
  const erlaubt = await Promise.all(r.erlaubt.map((e) => realpath(e).catch(() => e)));
  if (!erlaubt.some((e) => echt.startsWith(e.endsWith(sep) ? e : e + sep))) {
    throw new ZielFehler(`Backups sind nur in Unterordnern von ${r.erlaubt.join(" oder ")} erlaubt.`);
  }
  const s = await stat(echt);
  if (!s.isDirectory()) throw new ZielFehler(`${pfad} ist kein Ordner.`);
  if (r.anderesGeraetPflicht !== false) {
    const daten = await stat(r.daten).catch(() => null);
    if (daten && daten.dev === s.dev) {
      throw new ZielFehler("Das Ziel liegt auf derselben Festplatte wie deine Daten. Fällt sie aus, wären beide weg – bitte eine zweite Festplatte nehmen.");
    }
  }
  return echt;
}
