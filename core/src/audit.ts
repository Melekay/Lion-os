import type { Datenbank } from "./datenbank.js";

/** Audit-Log: Wer hat wann was getan – mit Ergebnis. Enthält nie Passwörter oder Geheimnisse. */
export type AuditEintrag = {
  id: number;
  zeit: string;
  benutzer: string | null;
  aktion: string;
  ziel: string | null;
  ergebnis: "erfolg" | "fehler" | "abgelehnt";
  details: string | null;
};

export function protokolliere(
  db: Datenbank,
  e: { benutzer?: string | null; aktion: string; ziel?: string | null; ergebnis: AuditEintrag["ergebnis"]; details?: string | null },
  jetzt = new Date(),
): void {
  db.prepare("INSERT INTO audit (zeit, benutzer, aktion, ziel, ergebnis, details) VALUES (?, ?, ?, ?, ?, ?)").run(
    jetzt.toISOString(),
    e.benutzer ?? null,
    e.aktion,
    e.ziel ?? null,
    e.ergebnis,
    e.details ?? null,
  );
}

export function letzteEintraege(db: Datenbank, anzahl = 100): AuditEintrag[] {
  return db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(Math.min(Math.max(anzahl, 1), 500)) as AuditEintrag[];
}
