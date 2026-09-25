import { describe, expect, it } from "vitest";
import { oeffneDatenbank } from "../src/datenbank.js";
import { baueServer } from "../src/server.js";
import { MAX_VERSUCHE } from "../src/sperre.js";
import { BEISPIEL_STATUS, csrf, einrichten, PASSWORT, testServer } from "./helfer.js";

const NEU = "ein-ganz-neues-passwort-456";

type App = ReturnType<typeof testServer>["app"];

async function anmelden(app: App, passwort = PASSWORT, geraet = "Mozilla/5.0 (Windows NT 10.0) Firefox/140.0") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { ...csrf, "user-agent": geraet },
    payload: { name: "admin", passwort },
  });
  const c = res.cookies.find((k) => k.name === "lion_sitzung");
  return { res, cookie: c ? `lion_sitzung=${c.value}` : "" };
}

const wechsel = (app: App, cookie: string, altesPasswort: string, neuesPasswort: string) =>
  app.inject({ method: "POST", url: "/api/auth/passwort", headers: { ...csrf, cookie }, payload: { altesPasswort, neuesPasswort } });

describe("Passwort ändern", () => {
  it("klappt mit richtigem alten Passwort; danach gilt nur noch das neue", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await wechsel(app, cookie, PASSWORT, NEU);
    expect(res.statusCode).toBe(200);
    expect((await anmelden(app, PASSWORT)).res.statusCode).toBe(401);
    expect((await anmelden(app, NEU)).res.statusCode).toBe(200);
  });

  it("meldet alle anderen Geräte ab, das aktuelle bleibt angemeldet", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const anderes = await anmelden(app);
    const res = await wechsel(app, cookie, PASSWORT, NEU);
    expect(res.json()).toEqual({ ok: true, abgemeldet: 1 });
    expect((await app.inject({ url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/auth/me", headers: { cookie: anderes.cookie } })).statusCode).toBe(401);
  });

  it("lehnt falsches altes Passwort ab und protokolliert es", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await wechsel(app, cookie, "falsch-falsch-falsch", NEU);
    expect(res.statusCode).toBe(403);
    expect((await anmelden(app, PASSWORT)).res.statusCode).toBe(200);
    const audit = (await app.inject({ url: "/api/audit", headers: { cookie } })).json().eintraege as { aktion: string; ergebnis: string }[];
    expect(audit.some((e) => e.aktion === "passwort.aendern" && e.ergebnis === "abgelehnt")).toBe(true);
  });

  it("prüft die Regeln für das neue Passwort", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await wechsel(app, cookie, PASSWORT, "kurz");
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toMatch(/12 Zeichen/);
  });

  it("sperrt nach zu vielen falschen alten Passwörtern", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    for (let i = 0; i < MAX_VERSUCHE; i++) await wechsel(app, cookie, "falsch-falsch-falsch", NEU);
    expect((await wechsel(app, cookie, PASSWORT, NEU)).statusCode).toBe(429);
  });

  it("braucht Anmeldung und CSRF-Kennung", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const ohneCookie = await app.inject({ method: "POST", url: "/api/auth/passwort", headers: csrf, payload: { altesPasswort: PASSWORT, neuesPasswort: NEU } });
    expect(ohneCookie.statusCode).toBe(401);
    const ohneCsrf = await app.inject({ method: "POST", url: "/api/auth/passwort", headers: { cookie }, payload: { altesPasswort: PASSWORT, neuesPasswort: NEU } });
    expect(ohneCsrf.statusCode).toBe(403);
  });
});

describe("Sitzungen", () => {
  it("listet eigene Sitzungen mit Gerät, IP und Markierung der aktuellen – ohne Token oder Hash", async () => {
    const { app } = testServer();
    await einrichten(app);
    const { cookie } = await anmelden(app);
    const res = await app.inject({ url: "/api/auth/sitzungen", headers: { cookie } });
    const liste = res.json().sitzungen as Record<string, unknown>[];
    expect(liste).toHaveLength(2);
    expect(liste.filter((s) => s.aktuell)).toHaveLength(1);
    expect(liste.find((s) => s.aktuell)).toMatchObject({ geraet: expect.stringContaining("Firefox"), ip: "127.0.0.1" });
    expect(JSON.stringify(liste)).not.toMatch(/token|hash/i);
  });

  it("beendet eine andere Sitzung gezielt, aber nicht die eigene", async () => {
    const { app } = testServer();
    await einrichten(app);
    const a = await anmelden(app);
    const b = await anmelden(app);
    const liste = (await app.inject({ url: "/api/auth/sitzungen", headers: { cookie: a.cookie } })).json().sitzungen as { id: number; aktuell: boolean }[];
    const eigene = liste.find((s) => s.aktuell)!;
    const bId = (await app.inject({ url: "/api/auth/sitzungen", headers: { cookie: b.cookie } })).json().sitzungen.find((s: { aktuell: boolean }) => s.aktuell).id;

    const selbst = await app.inject({ method: "POST", url: "/api/auth/sitzungen/abmelden", headers: { ...csrf, cookie: a.cookie }, payload: { id: eigene.id } });
    expect(selbst.statusCode).toBe(400);

    const andere = await app.inject({ method: "POST", url: "/api/auth/sitzungen/abmelden", headers: { ...csrf, cookie: a.cookie }, payload: { id: bId } });
    expect(andere.statusCode).toBe(200);
    expect((await app.inject({ url: "/api/auth/me", headers: { cookie: b.cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/auth/me", headers: { cookie: a.cookie } })).statusCode).toBe(200);
  });

  it("unbekannte Sitzung → 404", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/sitzungen/abmelden", headers: { ...csrf, cookie }, payload: { id: 9999 } });
    expect(res.statusCode).toBe(404);
  });

  it("„alle anderen abmelden“ lässt nur die aktuelle übrig", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    await anmelden(app);
    await anmelden(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/sitzungen/abmelden", headers: { ...csrf, cookie }, payload: {} });
    expect(res.json()).toEqual({ ok: true, abgemeldet: 2 });
    const liste = (await app.inject({ url: "/api/auth/sitzungen", headers: { cookie } })).json().sitzungen;
    expect(liste).toHaveLength(1);
  });
});

describe("Einstellungen", () => {
  it("liefert Standardname, Version und Adressen", async () => {
    const db = oeffneDatenbank(":memory:");
    const app = baueServer({
      db,
      version: "9.9.9",
      status: async () => BEISPIEL_STATUS,
      sichereCookies: false,
      adressen: async () => ["localhost", "192.168.1.20"],
    });
    const { cookie } = await einrichten(app);
    const res = await app.inject({ url: "/api/einstellungen", headers: { cookie } });
    expect(res.json()).toEqual({ boxName: "Lion OS", version: "9.9.9", adressen: ["localhost", "192.168.1.20"], hintergrundFoto: null });
  });

  it("speichert den Namen der Box (getrimmt) und protokolliert es", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await app.inject({ method: "POST", url: "/api/einstellungen", headers: { ...csrf, cookie }, payload: { boxName: "  Wohnzimmer-Box  " } });
    expect(res.json()).toEqual({ boxName: "Wohnzimmer-Box" });
    expect((await app.inject({ url: "/api/einstellungen", headers: { cookie } })).json().boxName).toBe("Wohnzimmer-Box");
    const audit = (await app.inject({ url: "/api/audit", headers: { cookie } })).json().eintraege as { aktion: string }[];
    expect(audit[0]?.aktion).toBe("einstellungen.aendern");
  });

  it("lehnt leere, zu lange und HTML-Namen ab", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    for (const boxName of ["   ", "x".repeat(41), "<script>", "a\u0000b"]) {
      const res = await app.inject({ method: "POST", url: "/api/einstellungen", headers: { ...csrf, cookie }, payload: { boxName } });
      expect(res.statusCode, boxName).toBe(400);
    }
    const ok = await app.inject({ method: "POST", url: "/api/einstellungen", headers: { ...csrf, cookie }, payload: { boxName: "Büro Süd 2" } });
    expect(ok.statusCode).toBe(200);
  });

  it("braucht Anmeldung", async () => {
    const { app } = testServer();
    expect((await app.inject({ url: "/api/einstellungen" })).statusCode).toBe(401);
  });
});

describe("Migration", () => {
  it("Sitzungen aus älteren Versionen (ohne Gerät/Zeit) werden trotzdem angezeigt", async () => {
    const { app, db } = testServer();
    const { cookie } = await einrichten(app);
    db.prepare("INSERT INTO sitzungen (token_hash, benutzer_id, laeuft_ab) VALUES ('alt', 1, ?)").run(Date.now() + 60_000);
    const liste = (await app.inject({ url: "/api/auth/sitzungen", headers: { cookie } })).json().sitzungen as { erstelltAm: unknown; geraet: unknown }[];
    expect(liste).toHaveLength(2);
    expect(liste.some((s) => s.erstelltAm === null && s.geraet === null)).toBe(true);
  });
});
