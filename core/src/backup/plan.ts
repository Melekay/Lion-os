import { randomBytes } from "node:crypto";

export const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Wie lange Sicherungen aufbewahrt werden (restic forget). */
export const AUFBEWAHRUNG = ["--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "6"];

function heuteUm(jetzt: Date, zeit: string): Date {
  const [h, m] = zeit.split(":").map(Number) as [number, number];
  const d = new Date(jetzt);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Ist heute eine Sicherung fällig? Ja, wenn die Uhrzeit erreicht ist und heute seit dann noch keine lief. */
export function faellig(jetzt: Date, zeit: string, letzterStart: Date | null): boolean {
  const termin = heuteUm(jetzt, zeit);
  if (jetzt < termin) return false;
  return !letzterStart || letzterStart < termin;
}

export function naechsterLauf(jetzt: Date, zeit: string, letzterStart: Date | null): Date {
  const termin = heuteUm(jetzt, zeit);
  if (faellig(jetzt, zeit, letzterStart)) return jetzt;
  if (jetzt < termin) return termin;
  const morgen = new Date(termin);
  morgen.setDate(morgen.getDate() + 1);
  return morgen;
}

/**
 * Wiederherstellungsschlüssel: 6 Blöcke à 4 Zeichen ohne verwechselbare Zeichen (120 Bit).
 * Ohne ihn ist ein Backup auf einer neuen Box nicht lesbar – der Besitzer muss ihn aufschreiben.
 */
export function erzeugeSchluessel(): string {
  const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(24);
  const roh = Array.from(bytes, (b) => zeichen[b % 32]).join("");
  return roh.match(/.{4}/g)!.join("-");
}
