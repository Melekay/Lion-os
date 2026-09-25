import { describe, expect, it } from "vitest";
import { oeffneDatenbank } from "../src/datenbank.js";
import { baueServer } from "../src/server.js";
import { MAX_VERSUCHE } from "../src/sperre.js";
import { BEISPIEL_STATUS, csrf, einrichten, PASSWORT, testServer, testServerMitApps } from "./helfer.js";

describe("Einrichtungscode", () => {
  const CODE = "K7QM-4XPA-9TRD";
  const serverMitCode = () => {
    const db = oeffneDatenbank(":memory:");
    return baueServer({ db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false, einrichtungsCode: CODE });
  };
  const einrichtenMit = (app: ReturnType<typeof serverMitCode>, code?: string) =>
    app.inject({ method: "POST", url: "/api/setup", headers: csrf, payload: { name: "admin", passwort: PASSWORT, code } });

  it("meldet, dass ein Code nötig ist", async () => {
    const res = await serverMitCode().inject({ url: "/api/setup/status" });
    expect(res.json()).toEqual({ eingerichtet: false, codeNoetig: true });
  });

  it("lehnt die Einrichtung ohne oder mit falschem Code ab", async () => {
    const app = serverMitCode();
    expect((await einrichtenMit(app)).statusCode).toBe(403);
    expect((await einrichtenMit(app, "AAAA-BBBB-CCCC")).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/setup/status" })).json().eingerichtet).toBe(false);
  });

  it("akzeptiert den Code unabhängig von Schreibweise und Bindestrichen", async () => {
    const res = await einrichtenMit(serverMitCode(), " k7qm 4xpa9trd ");
    expect(res.statusCode).toBe(201);
  });

  it("sperrt nach zu vielen falschen Codes", async () => {
    const app = serverMitCode();
    for (let i = 0; i < MAX_VERSUCHE; i++) await einrichtenMit(app, "falsch-falsch");
    const res = await einrichtenMit(app, CODE);
    expect(res.statusCode).toBe(429);
  });

  it("protokolliert abgelehnte Versuche im Audit-Log", async () => {
    const app = serverMitCode();
    await einrichtenMit(app, "falsch-falsch");
    const ok = await einrichtenMit(app, CODE);
    const cookie = `lion_sitzung=${ok.cookies.find((c) => c.name === "lion_sitzung")?.value}`;
    const audit = await app.inject({ url: "/api/audit", headers: { cookie } });
    const einrichtungen = audit.json().eintraege.filter((e: { aktion: string }) => e.aktion === "einrichtung");
    expect(einrichtungen.map((e: { ergebnis: string }) => e.ergebnis).sort()).toEqual(["abgelehnt", "erfolg"]);
  });
});

describe("Einrichtung", () => {
  it("ist anfangs nicht eingerichtet", async () => {
    const { app } = testServer();
    const res = await app.inject({ url: "/api/setup/status" });
    expect(res.json()).toEqual({ eingerichtet: false, codeNoetig: false });
  });

  it("legt den ersten Admin an und meldet ihn direkt an", async () => {
    const { app } = testServer();
    const { res, cookie } = await einrichten(app);
    expect(res.statusCode).toBe(201);
    expect(cookie).toMatch(/^lion_sitzung=/);
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json()).toEqual({ name: "admin" });
  });

  it("lässt sich nur einmal durchführen", async () => {
    const { app } = testServer();
    await einrichten(app);
    const zweiter = await app.inject({ method: "POST", url: "/api/setup", headers: csrf, payload: { name: "boese", passwort: PASSWORT } });
    expect(zweiter.statusCode).toBe(409);
  });

  it("lehnt zu kurze Passwörter ab", async () => {
    const { app } = testServer();
    const res = await app.inject({ method: "POST", url: "/api/setup", headers: csrf, payload: { name: "admin", passwort: "kurz" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toMatch(/12 Zeichen/);
  });

  it("speichert das Passwort nie im Klartext", async () => {
    const { app, db } = testServer();
    await einrichten(app);
    const zeile = db.prepare("SELECT passwort_hash FROM benutzer").get() as { passwort_hash: string };
    expect(zeile.passwort_hash).not.toContain(PASSWORT);
    expect(zeile.passwort_hash.startsWith("scrypt$")).toBe(true);
  });
});

describe("Anmeldung", () => {
  it("setzt ein sicheres Sitzungs-Cookie", async () => {
    const { app } = testServer();
    await einrichten(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: PASSWORT } });
    expect(res.statusCode).toBe(200);
    const c = res.cookies.find((x) => x.name === "lion_sitzung");
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe("Strict");
  });

  it("lehnt falsches Passwort und unbekannte Namen gleich ab", async () => {
    const { app } = testServer();
    await einrichten(app);
    const falsch = await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: "falsch-falsch-falsch" } });
    const unbekannt = await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "wer", passwort: "falsch-falsch-falsch" } });
    expect(falsch.statusCode).toBe(401);
    expect(unbekannt.statusCode).toBe(401);
    expect(falsch.json()).toEqual(unbekannt.json());
  });

  it(`sperrt nach ${MAX_VERSUCHE} Fehlversuchen – auch das richtige Passwort`, async () => {
    const { app } = testServer();
    await einrichten(app);
    for (let i = 0; i < MAX_VERSUCHE; i++) {
      await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: "falsch-falsch-falsch" } });
    }
    const res = await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: PASSWORT } });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("Abmelden beendet die Sitzung serverseitig", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...csrf, cookie } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

describe("Schutz", () => {
  it("verlangt Anmeldung für Systemstatus und Audit-Log", async () => {
    const { app } = testServer();
    expect((await app.inject({ url: "/api/system" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/audit" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/system", headers: { cookie: "lion_sitzung=erfunden" } })).statusCode).toBe(401);
  });

  it("lehnt ändernde Anfragen ohne CSRF-Kennung ab", async () => {
    const { app } = testServer();
    const res = await app.inject({ method: "POST", url: "/api/setup", payload: { name: "admin", passwort: PASSWORT } });
    expect(res.statusCode).toBe(403);
  });

  it("Health-Check ist öffentlich und verrät nur die Version", async () => {
    const { app } = testServer();
    expect((await app.inject({ url: "/api/health" })).json()).toEqual({ ok: true, version: "test" });
  });
});

describe("Systemstatus und Audit-Log", () => {
  it("liefert den Systemstatus mit Ampel", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    const res = await app.inject({ url: "/api/system", headers: { cookie } });
    expect(res.json().ampel).toBe("gruen");
  });

  it("protokolliert Einrichtung, Fehlversuche und Anmeldung – ohne Passwörter", async () => {
    const { app } = testServer();
    const { cookie } = await einrichten(app);
    await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: "falsch-falsch-falsch" } });
    await app.inject({ method: "POST", url: "/api/auth/login", headers: csrf, payload: { name: "admin", passwort: PASSWORT } });
    const res = await app.inject({ url: "/api/audit", headers: { cookie } });
    const eintraege = res.json().eintraege as { aktion: string; ergebnis: string }[];
    expect(eintraege.map((e) => `${e.aktion}:${e.ergebnis}`)).toEqual(["anmeldung:erfolg", "anmeldung:abgelehnt", "einrichtung:erfolg"]);
    expect(JSON.stringify(eintraege)).not.toContain(PASSWORT);
    expect(JSON.stringify(eintraege)).not.toContain("falsch-falsch-falsch");
  });
});

describe("App-Routen", () => {
  it("sind ohne Anmeldung gesperrt", async () => {
    const { app } = await testServerMitApps();
    expect((await app.inject({ url: "/api/apps" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/apps/uptime-kuma/installieren", headers: csrf })).statusCode).toBe(401);
  });

  it("listen den Katalog und starten Installationen im Hintergrund (202)", async () => {
    const { app, apps } = await testServerMitApps();
    const { cookie } = await einrichten(app);
    const liste = await app.inject({ url: "/api/apps", headers: { cookie } });
    expect(liste.json().apps.map((a: { id: string }) => a.id)).toContain("uptime-kuma");
    const res = await app.inject({ method: "POST", url: "/api/apps/uptime-kuma/installieren", headers: { ...csrf, cookie } });
    expect(res.statusCode).toBe(202);
    await apps.warteAuf("uptime-kuma");
  });

  it("liefert 404 für unbekannte Apps und 400 ohne Bestätigung beim Entfernen", async () => {
    const { app, apps } = await testServerMitApps();
    const { cookie } = await einrichten(app);
    expect((await app.inject({ method: "POST", url: "/api/apps/gibtsnicht/installieren", headers: { ...csrf, cookie } })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: "/api/apps/uptime-kuma/installieren", headers: { ...csrf, cookie } });
    await apps.warteAuf("uptime-kuma");
    const ohne = await app.inject({ method: "POST", url: "/api/apps/uptime-kuma/entfernen", headers: { ...csrf, cookie }, payload: {} });
    expect(ohne.statusCode).toBe(400);
  });

  it("zeigt das Protokoll installierter Apps nur angemeldet", async () => {
    const { app, apps } = await testServerMitApps();
    const { cookie } = await einrichten(app);
    expect((await app.inject({ url: "/api/apps/uptime-kuma/protokoll" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/apps/uptime-kuma/protokoll", headers: { cookie } })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: "/api/apps/uptime-kuma/installieren", headers: { ...csrf, cookie } });
    await apps.warteAuf("uptime-kuma");
    const res = await app.inject({ url: "/api/apps/uptime-kuma/protokoll", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ zeilen: ["app-1  | gestartet"] });
  });

  it("liefert Logos als SVG mit Sperr-CSP und nur angemeldet", async () => {
    const { app } = await testServerMitApps();
    const { cookie } = await einrichten(app);
    expect((await app.inject({ url: "/api/apps/jellyfin/logo" })).statusCode).toBe(401);
    const res = await app.inject({ url: "/api/apps/jellyfin/logo", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/svg\+xml/);
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toMatch(/<svg[\s>]/);
    expect((await app.inject({ url: "/api/apps/gibtsnicht/logo", headers: { cookie } })).statusCode).toBe(404);
    const liste = (await app.inject({ url: "/api/apps", headers: { cookie } })).json().apps as { id: string; logo: string | null }[];
    expect(liste.find((a) => a.id === "jellyfin")?.logo).toBe("/api/apps/jellyfin/logo");
  });

  it("liefert Live-Werte der Apps nur angemeldet", async () => {
    const { app } = await testServerMitApps();
    const { cookie } = await einrichten(app);
    expect((await app.inject({ url: "/api/apps/ressourcen" })).statusCode).toBe(401);
    const res = await app.inject({ url: "/api/apps/ressourcen", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().apps["uptime-kuma"].ramMb).toBe(96);
  });
});
