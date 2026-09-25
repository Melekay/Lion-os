import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { letzteEintraege } from "../src/audit.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { HintergrundFoto, istJpeg, MAX_FOTO_BYTES } from "../src/hintergrund.js";
import { baueServer } from "../src/server.js";
import { BEISPIEL_STATUS, csrf, einrichten } from "./helfer.js";

/** Kleinster gültiger JPEG-Anfang reicht für die Prüfung; der Inhalt wird nicht dekodiert. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7), Buffer.from([0xff, 0xd9])]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function aufbau() {
  const ordner = await mkdtemp(join(tmpdir(), "lion-hg-"));
  const db = oeffneDatenbank(":memory:");
  const hintergrund = new HintergrundFoto(join(ordner, "hintergrund.jpg"));
  const app = baueServer({ db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false, hintergrund });
  const { cookie } = await einrichten(app);
  const hochladen = (daten: Buffer, headers: Record<string, string> = {}) =>
    app.inject({ method: "POST", url: "/api/hintergrund", headers: { ...csrf, cookie, "content-type": "image/jpeg", ...headers }, payload: daten });
  return { app, db, cookie, ordner, hochladen };
}

describe("Hintergrundfoto – Speicher", () => {
  it("erkennt JPEG am Dateikopf", () => {
    expect(istJpeg(JPEG)).toBe(true);
    expect(istJpeg(PNG)).toBe(false);
    expect(istJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it("speichert atomar mit Rechten 640 und entfernt wieder", async () => {
    const ordner = await mkdtemp(join(tmpdir(), "lion-hg-"));
    const foto = new HintergrundFoto(join(ordner, "h.jpg"));
    expect(await foto.version()).toBeNull();
    await foto.speichern(JPEG);
    expect((await stat(join(ordner, "h.jpg"))).mode & 0o777).toBe(0o640);
    expect(await readdir(ordner)).toEqual(["h.jpg"]);
    expect((await foto.lesen())?.equals(JPEG)).toBe(true);
    expect(await foto.entfernen()).toBe(true);
    expect(await foto.entfernen()).toBe(false);
    expect(await foto.lesen()).toBeNull();
  });

  it("lehnt Nicht-JPEG und zu große Dateien ab, ohne etwas zu hinterlassen", async () => {
    const ordner = await mkdtemp(join(tmpdir(), "lion-hg-"));
    const foto = new HintergrundFoto(join(ordner, "h.jpg"));
    await expect(foto.speichern(PNG)).rejects.toThrow(/JPEG/);
    await expect(foto.speichern(Buffer.concat([JPEG, Buffer.alloc(MAX_FOTO_BYTES)]))).rejects.toThrow(/zu groß/);
    expect(await readdir(ordner)).toEqual([]);
  });
});

describe("Hintergrundfoto – API", () => {
  it("hochladen, in den Einstellungen sehen, abrufen, entfernen – mit Protokoll", async () => {
    const { app, db, cookie, hochladen } = await aufbau();
    expect((await app.inject({ url: "/api/einstellungen", headers: { cookie } })).json().hintergrundFoto).toBeNull();

    const res = await hochladen(JPEG);
    expect(res.statusCode).toBe(200);
    const adresse = res.json().hintergrundFoto as string;
    expect(adresse).toMatch(/^\/api\/hintergrund\?v=\d+$/);
    expect((await app.inject({ url: "/api/einstellungen", headers: { cookie } })).json().hintergrundFoto).toBe(adresse);

    const bild = await app.inject({ url: adresse, headers: { cookie } });
    expect(bild.statusCode).toBe(200);
    expect(bild.headers["content-type"]).toBe("image/jpeg");
    expect(bild.headers["x-content-type-options"]).toBe("nosniff");
    expect(bild.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(bild.rawPayload.equals(JPEG)).toBe(true);

    const weg = await app.inject({ method: "POST", url: "/api/hintergrund/entfernen", headers: { ...csrf, cookie } });
    expect(weg.statusCode).toBe(200);
    expect((await app.inject({ url: "/api/hintergrund", headers: { cookie } })).statusCode).toBe(404);
    const aktionen = letzteEintraege(db).map((e) => e.aktion);
    expect(aktionen).toContain("hintergrund.hochladen");
    expect(aktionen).toContain("hintergrund.entfernen");
  });

  it("nimmt nur JPEG an", async () => {
    const { hochladen } = await aufbau();
    expect((await hochladen(PNG)).statusCode).toBe(415);
    expect((await hochladen(PNG, { "content-type": "image/png" })).statusCode).toBe(415);
  });

  it("lehnt zu große Fotos ab", async () => {
    const { hochladen } = await aufbau();
    expect((await hochladen(Buffer.concat([JPEG, Buffer.alloc(MAX_FOTO_BYTES)]))).statusCode).toBe(413);
  });

  it("braucht Anmeldung und CSRF-Kennung", async () => {
    const { app, cookie } = await aufbau();
    expect((await app.inject({ url: "/api/hintergrund" })).statusCode).toBe(401);
    const ohneCsrf = await app.inject({ method: "POST", url: "/api/hintergrund", headers: { cookie, "content-type": "image/jpeg" }, payload: JPEG });
    expect(ohneCsrf.statusCode).toBe(403);
    const ohneAnmeldung = await app.inject({ method: "POST", url: "/api/hintergrund", headers: { ...csrf, "content-type": "image/jpeg" }, payload: JPEG });
    expect(ohneAnmeldung.statusCode).toBe(401);
  });
});
