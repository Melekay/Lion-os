import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiFehler, CSRF_HEADER, lion } from "@/lib/api";
import { passwortPruefen } from "@/lib/passwort";

function antwort(status: number, body: unknown) {
  return vi.fn(async () => new Response(body === undefined ? "" : JSON.stringify(body), { status }));
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("GET ohne CSRF-Header und ohne Body", async () => {
    const f = antwort(200, { ok: true });
    vi.stubGlobal("fetch", f);
    await api("/api/health");
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
  });

  it("POST mit Daten: CSRF-Header und JSON", async () => {
    const f = antwort(200, { name: "admin" });
    vi.stubGlobal("fetch", f);
    await lion.anmelden({ name: "admin", passwort: "x" });
    const [pfad, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(pfad).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(headers[CSRF_HEADER]).toBe("1");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ name: "admin", passwort: "x" });
  });

  it("POST ohne Daten schickt keinen JSON-Body (lion-core lehnt leeres JSON ab)", async () => {
    const f = antwort(202, { ok: true });
    vi.stubGlobal("fetch", f);
    await lion.appAktion("uptime-kuma", "stoppen");
    const [pfad, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(pfad).toBe("/api/apps/uptime-kuma/stoppen");
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("App-IDs werden in der Adresse kodiert", async () => {
    const f = antwort(202, {});
    vi.stubGlobal("fetch", f);
    await lion.appEntfernen("../x", "../x");
    const [pfad] = f.mock.calls[0] as unknown as [string];
    expect(pfad).toBe("/api/apps/..%2Fx/entfernen");
  });

  it("übernimmt die Fehlermeldung von lion-core", async () => {
    vi.stubGlobal("fetch", antwort(409, { fehler: "Uptime Kuma ist bereits installiert." }));
    await expect(api("/api/x")).rejects.toMatchObject({ status: 409, message: "Uptime Kuma ist bereits installiert." });
  });

  it("hat verständliche Standardmeldungen", async () => {
    vi.stubGlobal("fetch", antwort(500, undefined));
    await expect(api("/api/x")).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/Fehler gemeldet/) });
  });

  it("Netzwerkfehler → Status 0 mit Hinweis", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const fehler = await api("/api/x").catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect(fehler).toMatchObject({ status: 0, message: expect.stringMatching(/nicht erreichbar/) });
  });
});

describe("passwortPruefen", () => {
  it("verlangt 12 Zeichen und gleiche Wiederholung", () => {
    expect(passwortPruefen("kurz", "kurz")).toMatchObject({ ok: false, passwort: "Mindestens 12 Zeichen." });
    expect(passwortPruefen("lang-genug-123", "anders")).toMatchObject({ ok: false, wiederholung: expect.any(String) });
    expect(passwortPruefen("lang-genug-123", "lang-genug-123")).toEqual({ ok: true, passwort: null, wiederholung: null });
  });
});
