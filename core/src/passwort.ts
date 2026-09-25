import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/** Passwort-Hashing mit scrypt (in Node eingebaut). Format: scrypt$N$r$p$salt$hash (base64url). */
const N = 2 ** 15;
const R = 8;
const P = 1;
const LAENGE = 64;
export const MIN_PASSWORT_LAENGE = 12;

function scrypt(passwort: string, salt: Buffer, optionen: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(passwort, salt, LAENGE, { ...optionen, maxmem: 128 * N * R * 2 }, (fehler, schluessel) =>
      fehler ? reject(fehler) : resolve(schluessel),
    ),
  );
}

export async function hashePasswort(passwort: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(passwort, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  const teile = gespeichert.split("$");
  if (teile.length !== 6 || teile[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = teile as [string, string, string, string, string, string];
  const erwartet = Buffer.from(hash, "base64url");
  const berechnet = await scrypt(passwort, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return erwartet.length === berechnet.length && timingSafeEqual(erwartet, berechnet);
}

/** Liefert eine Fehlermeldung oder null, wenn das Passwort den Regeln genügt. */
export function passwortRegelVerletzt(passwort: string): string | null {
  if (passwort.length < MIN_PASSWORT_LAENGE) return `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`;
  if (passwort.length > 256) return "Das Passwort ist zu lang (höchstens 256 Zeichen).";
  return null;
}
