import { z } from "zod";
import type { Datenbank } from "./datenbank.js";

/** Einstellungen, die der Besitzer in der Oberfläche ändern darf. Alles andere bleibt in /etc/lion. */
export type Einstellungen = { boxName: string };

export const STANDARD: Einstellungen = { boxName: "Lion OS" };

/** Buchstaben (auch Umlaute), Ziffern, Leerzeichen und - _ . ' – keine Steuer- oder HTML-Zeichen. */
export const BoxName = z
  .string()
  .trim()
  .min(1, "Bitte einen Namen angeben.")
  .max(40, "Der Name darf höchstens 40 Zeichen lang sein.")
  .regex(/^[\p{L}\p{N} ._'-]+$/u, "Erlaubt sind Buchstaben, Ziffern, Leerzeichen und - _ . '");

export function ladeEinstellungen(db: Datenbank): Einstellungen {
  const zeile = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'boxName'").get() as { wert: string } | undefined;
  return { boxName: zeile?.wert ?? STANDARD.boxName };
}

export function speichereBoxName(db: Datenbank, name: string): void {
  db.prepare("INSERT INTO einstellungen (schluessel, wert) VALUES ('boxName', ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert").run(name);
}
