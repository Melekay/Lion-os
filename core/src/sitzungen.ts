import { createHash, randomBytes } from "node:crypto";
import type { Datenbank } from "./datenbank.js";

/** Sitzungen: Im Cookie steht ein Zufalls-Token, in der Datenbank nur dessen SHA-256-Hash. */
export const SITZUNG_COOKIE = "lion_sitzung";
export const SITZUNG_DAUER_MS = 7 * 24 * 60 * 60 * 1000;

const hashe = (token: string) => createHash("sha256").update(token).digest("hex");

export function erstelleSitzung(db: Datenbank, benutzerId: number, jetzt = Date.now()): string {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sitzungen (token_hash, benutzer_id, laeuft_ab) VALUES (?, ?, ?)").run(
    hashe(token),
    benutzerId,
    jetzt + SITZUNG_DAUER_MS,
  );
  return token;
}

export type SitzungsBenutzer = { id: number; name: string };

export function findeSitzung(db: Datenbank, token: string | undefined, jetzt = Date.now()): SitzungsBenutzer | null {
  if (!token) return null;
  const zeile = db
    .prepare(
      `SELECT b.id AS id, b.name AS name, s.laeuft_ab AS laeuft_ab
         FROM sitzungen s JOIN benutzer b ON b.id = s.benutzer_id
        WHERE s.token_hash = ?`,
    )
    .get(hashe(token)) as { id: number; name: string; laeuft_ab: number } | undefined;
  if (!zeile) return null;
  if (zeile.laeuft_ab <= jetzt) {
    beendeSitzung(db, token);
    return null;
  }
  return { id: zeile.id, name: zeile.name };
}

export function beendeSitzung(db: Datenbank, token: string): void {
  db.prepare("DELETE FROM sitzungen WHERE token_hash = ?").run(hashe(token));
}

export function raeumeAbgelaufeneAuf(db: Datenbank, jetzt = Date.now()): void {
  db.prepare("DELETE FROM sitzungen WHERE laeuft_ab <= ?").run(jetzt);
}
