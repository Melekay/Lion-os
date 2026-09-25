import { randomBytes } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";

/**
 * Eigenes Hintergrundfoto der Box. Die Oberfläche verkleinert das Bild vorher und speichert es neu als JPEG
 * (dabei fallen Metadaten wie der GPS-Standort weg). lion-core nimmt deshalb nur JPEG an und prüft Größe
 * und Dateikopf. Gespeichert wird atomar: erst in eine Zwischendatei, dann umbenannt.
 */
export const MAX_FOTO_BYTES = 6 * 1024 * 1024;

/** JPEG beginnt immer mit FF D8 FF. */
export function istJpeg(daten: Buffer): boolean {
  return daten.length >= 4 && daten[0] === 0xff && daten[1] === 0xd8 && daten[2] === 0xff;
}

export class HintergrundFoto {
  constructor(private readonly pfad: string) {}

  /** Version (Änderungszeit in ms) für die Cache-Adresse, oder null ohne Foto. */
  async version(): Promise<number | null> {
    try {
      return Math.floor((await stat(this.pfad)).mtimeMs);
    } catch {
      return null;
    }
  }

  async lesen(): Promise<Buffer | null> {
    try {
      return await readFile(this.pfad);
    } catch {
      return null;
    }
  }

  async speichern(daten: Buffer): Promise<number> {
    if (daten.length > MAX_FOTO_BYTES) throw new Error("Das Foto ist zu groß.");
    if (!istJpeg(daten)) throw new Error("Nur JPEG-Bilder sind erlaubt.");
    const zwischen = `${this.pfad}.${randomBytes(6).toString("hex")}.neu`;
    try {
      await writeFile(zwischen, daten, { mode: 0o640 });
      await rename(zwischen, this.pfad);
    } catch (e) {
      await rm(zwischen, { force: true });
      throw e;
    }
    return (await this.version()) ?? Date.now();
  }

  /** true, wenn es ein Foto gab. */
  async entfernen(): Promise<boolean> {
    const gab = (await this.version()) !== null;
    await rm(this.pfad, { force: true });
    return gab;
  }
}
