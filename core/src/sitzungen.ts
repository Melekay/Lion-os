import { createHash, randomBytes } from "node:crypto";
import type { Datenbank } from "./datenbank.js";

/** Sitzungen: Im Cookie steht ein Zufalls-Token, in der Datenbank nur dessen SHA-256-Hash. */
export const SITZUNG_COOKIE = "lion_sitzung";
export const SITZUNG_DAUER_MS = 7 * 24 * 60 * 60 * 1000;

const hashe = (token: string) => createHash("sha256").update(token).digest("hex");

/** Herkunft einer Anmeldung – nur zur Anzeige für den Besitzer, nie für Entscheidungen. */
export type Herkunft = { geraet?: string | undefined; ip?: string | undefined };

export function erstelleSitzung(db: Datenbank, benutzerId: number, jetzt = Date.now(), herkunft: Herkunft = {}): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sitzungen (token_hash, benutzer_id, laeuft_ab, erstellt_am, geraet, ip) VALUES (?, ?, ?, ?, ?, ?)").run(
    hashe(token),
    benutzerId,
    jetzt + SITZUNG_DAUER_MS,
    jetzt,
    herkunft.geraet?.slice(0, 300) ?? null,
    herkunft.ip?.slice(0, 64) ?? null,
  );
  return token;
}

export type SitzungsBenutzer = { id: number; name: string; sitzungId: number };

export function findeSitzung(db: Datenbank, token: string | undefined, jetzt = Date.now()): SitzungsBenutzer | null {
  if (!token) return null;
  const zeile = db
    .prepare(
      `SELECT b.id AS id, b.name AS name, s.laeuft_ab AS laeuft_ab, s.rowid AS sitzung_id
         FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id
        WHERE s.token_hash = ?`,
    )
    .get(hashe(token)) as { id: number; name: string; laeuft_ab: number; sitzung_id: number } | undefined;
  if (!zeile) return null;
  if (zeile.laeuft_ab <= jetzt) {
    beendeSitzung(db, token);
    return null;
  }
  return { id: zeile.id, name: zeile.name, sitzungId: zeile.sitzung_id };
}

export type SitzungsAnsicht = {
  id: number;
  erstelltAm: string | null;
  laeuftAb: string;
  geraet: string | null;
  ip: string | null;
  aktuell: boolean;
};

/** Aktive Sitzungen eines Benutzers, neueste zuerst. Tokens oder Hashes verlassen nie die Datenbank. */
export function listeSitzungen(db: Datenbank, benutzerId: number, aktuelleId: number, jetzt = Date.now()): SitzungsAnsicht[] {
  const zeilen = db
    .prepare(
      `SELECT rowid AS id, erstellt_am, laeuft_ab, geraet, ip FROM sitzungen
        WHERE benutzer_id = ? AND laeuft_ab > ? ORDER BY COALESCE(erstellt_am, 0) DESC, rowid DESC`,
    )
    .all(benutzerId, jetzt) as { id: number; erstellt_am: number | null; laeuft_ab: number; geraet: string | null; ip: string | null }[];
  return zeilen.map((z) => ({
    id: z.id,
    erstelltAm: z.erstellt_am === null ? null : new Date(z.erstellt_am).toISOString(),
    laeuftAb: new Date(z.laeuft_ab).toISOString(),
    geraet: z.geraet,
    ip: z.ip,
    aktuell: z.id === aktuelleId,
  }));
}

/** Beendet eine bestimmte Sitzung – nur, wenn sie diesem Benutzer gehört. Liefert, ob etwas beendet wurde. */
export function beendeSitzungMitId(db: Datenbank, benutzerId: number, sitzungId: number): boolean {
  return Number(db.prepare("DELETE FROM sitzungen WHERE rowid = ? AND benutzer_id = ?").run(sitzungId, benutzerId).changes) > 0;
}

/** Beendet alle Sitzungen des Benutzers außer der aktuellen. Liefert die Anzahl. */
export function beendeAndereSitzungen(db: Datenbank, benutzerId: number, aktuelleId: number): number {
  return Number(db.prepare("DELETE FROM sitzungen WHERE benutzer_id = ? AND rowid != ?").run(benutzerId, aktuelleId).changes);
}

export function beendeSitzung(db: Datenbank, token: string): void {
  db.prepare("DELETE FROM sitzungen WHERE token_hash = ?").run(hashe(token));
}

export function raeumeAbgelaufeneAuf(db: Datenbank, jetzt = Date.now()): void {
  db.prepare("DELETE FROM sitzungen WHERE laeuft_ab <= ?").run(jetzt);
}
