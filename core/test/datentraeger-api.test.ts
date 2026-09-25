import { describe, expect, it } from "vitest";
import { letzteEintraege } from "../src/audit.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { type Helfer, HelferAblehnung, HelferNichtErreichbar } from "../src/helfer-client.js";
import type { Datentraeger } from "../src/helfer/datentraeger.js";
import { baueServer } from "../src/server.js";
import { BEISPIEL_STATUS, csrf, einrichten } from "./helfer.js";

const STICK: Datentraeger = {
  uuid: "ABCD-1234",
  name: "STICK",
  groesseBytes: 64e9,
  dateisystem: "vfat",
  geraet: "/dev/sdb1",
  eingehaengt: null,
  backupOrdner: "/media/lion/ABCD-1234/lion-backup",
};

class FakeHelfer implements Helfer {
  aufrufe: string[] = [];
  fehler: Error | null = null;
  async datentraeger() {
    if (this.fehler) throw this.fehler;
    return [STICK];
  }
  async einhaengen(uuid: string) {
    this.aufrufe.push(`einhaengen ${uuid}`);
    if (this.fehler) throw this.fehler;
    return { einhaengepunkt: `/media/lion/${uuid}`, backupOrdner: `/media/lion/${uuid}/lion-backup` };
  }
  async aushaengen(uuid: string) {
    this.aufrufe.push(`aushaengen ${uuid}`);
    return { ok: true as const };
  }
}

async function aufbau(backupStatus?: { laeuft: string | null; ziel: string | null }) {
  const db = oeffneDatenbank(":memory:");
  const helfer = new FakeHelfer();
  const backup = backupStatus ? ({ status: () => backupStatus, hinweis: () => null } as never) : undefined;
  const app = baueServer({ db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false, helfer, backup });
  const { cookie } = await einrichten(app);
  return { app, db, helfer, cookie };
}

describe("Datenträger-API", () => {
  it("listet, hängt ein und aus – mit Protokoll", async () => {
    const { app, db, helfer, cookie } = await aufbau();
    const liste = await app.inject({ url: "/api/datentraeger", headers: { cookie } });
    expect(liste.json()).toEqual({ datentraeger: [STICK] });

    const ein = await app.inject({ method: "POST", url: "/api/datentraeger/einhaengen", headers: { ...csrf, cookie }, payload: { uuid: "ABCD-1234" } });
    expect(ein.json()).toEqual({ einhaengepunkt: "/media/lion/ABCD-1234", backupOrdner: "/media/lion/ABCD-1234/lion-backup" });
    const aus = await app.inject({ method: "POST", url: "/api/datentraeger/aushaengen", headers: { ...csrf, cookie }, payload: { uuid: "ABCD-1234" } });
    expect(aus.statusCode).toBe(200);
    expect(helfer.aufrufe).toEqual(["einhaengen ABCD-1234", "aushaengen ABCD-1234"]);
    const aktionen = letzteEintraege(db).map((e) => e.aktion);
    expect(aktionen).toContain("datentraeger.einhaengen");
    expect(aktionen).toContain("datentraeger.aushaengen");
  });

  it("gibt ungültige Kennungen gar nicht erst weiter", async () => {
    const { app, helfer, cookie } = await aufbau();
    for (const uuid of ["../../etc", "; reboot", 42, undefined]) {
      const res = await app.inject({ method: "POST", url: "/api/datentraeger/einhaengen", headers: { ...csrf, cookie }, payload: { uuid } });
      expect(res.statusCode, String(uuid)).toBe(400);
    }
    expect(helfer.aufrufe).toEqual([]);
  });

  it("verweigert das Aushängen, während auf den Datenträger gesichert wird", async () => {
    const { app, helfer, cookie } = await aufbau({ laeuft: "sicherung", ziel: "/media/lion/ABCD-1234/lion-backup" });
    const res = await app.inject({ method: "POST", url: "/api/datentraeger/aushaengen", headers: { ...csrf, cookie }, payload: { uuid: "ABCD-1234" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().fehler).toMatch(/gesichert/);
    expect(helfer.aufrufe).toEqual([]);
  });

  it("verständliche Fehler: Dienst fehlt (503), Ablehnung (409)", async () => {
    const { app, helfer, cookie } = await aufbau();
    helfer.fehler = new HelferNichtErreichbar("lion-helper läuft nicht.");
    expect((await app.inject({ url: "/api/datentraeger", headers: { cookie } })).statusCode).toBe(503);
    helfer.fehler = new HelferAblehnung("Diesen Datenträger gibt es nicht (mehr).");
    const res = await app.inject({ method: "POST", url: "/api/datentraeger/einhaengen", headers: { ...csrf, cookie }, payload: { uuid: "ABCD-1234" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().fehler).toMatch(/nicht \(mehr\)/);
  });

  it("nur angemeldet und mit CSRF-Kennung", async () => {
    const { app, cookie } = await aufbau();
    expect((await app.inject({ url: "/api/datentraeger" })).statusCode).toBe(401);
    const ohneCsrf = await app.inject({ method: "POST", url: "/api/datentraeger/einhaengen", headers: { cookie }, payload: { uuid: "ABCD-1234" } });
    expect(ohneCsrf.statusCode).toBe(403);
  });
});
