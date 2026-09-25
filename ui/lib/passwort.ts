/** Mindestlänge wie in lion-core (core/src/passwort.ts). Die echte Prüfung macht lion-core. */
export const MIN_LAENGE = 12;

export function passwortPruefen(passwort: string, wiederholung: string): { ok: boolean; passwort: string | null; wiederholung: string | null } {
  const zuKurz = passwort.length < MIN_LAENGE ? `Mindestens ${MIN_LAENGE} Zeichen.` : null;
  const ungleich = wiederholung !== passwort ? "Die Passwörter stimmen nicht überein." : null;
  return { ok: !zuKurz && !ungleich, passwort: zuKurz, wiederholung: ungleich };
}
