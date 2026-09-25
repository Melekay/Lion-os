import { describe, expect, it } from "vitest";
import { hashePasswort, passwortRegelVerletzt, pruefePasswort } from "../src/passwort.js";

describe("Passwörter", () => {
  it("prüft das richtige Passwort und lehnt ein falsches ab", async () => {
    const hash = await hashePasswort("korrektes-pferd-batterie");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await pruefePasswort("korrektes-pferd-batterie", hash)).toBe(true);
    expect(await pruefePasswort("falsches-pferd-batterie", hash)).toBe(false);
  });

  it("erzeugt für dasselbe Passwort unterschiedliche Hashes (Salt)", async () => {
    expect(await hashePasswort("gleiches-passwort-1")).not.toBe(await hashePasswort("gleiches-passwort-1"));
  });

  it("lehnt kaputte Hash-Formate ab statt abzustürzen", async () => {
    expect(await pruefePasswort("x", "kein-hash")).toBe(false);
    expect(await pruefePasswort("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("verlangt mindestens 12 Zeichen", () => {
    expect(passwortRegelVerletzt("kurz")).toMatch(/12 Zeichen/);
    expect(passwortRegelVerletzt("genau-12-zei")).toBeNull();
  });
});
