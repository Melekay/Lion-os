import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppVerwaltung } from "../src/apps.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { ladeKatalog } from "../src/katalog.js";
import { baueServer, CSRF_HEADER } from "../src/server.js";
import type { Systemstatus } from "../src/system.js";

export const PASSWORT = "sehr-sicheres-passwort-123";

export const BEISPIEL_STATUS: Systemstatus = {
  cpuKerne: 4,
  last1: 0.5,
  ramGesamtMb: 16000,
  ramFreiMb: 12000,
  speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 60 }],
  temperaturC: 45,
  laufzeitS: 3600,
  netzwerk: { schnittstelle: "eth0", empfangenBytes: 1000, gesendetBytes: 500 },
  ampel: "gruen",
  hinweise: [],
};

export function testServer() {
  const db = oeffneDatenbank(":memory:");
  const app = baueServer({ db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false });
  return { app, db };
}

export const csrf = { [CSRF_HEADER]: "1" };

/** Richtet Lion OS ein und liefert das Sitzungs-Cookie. */
export async function einrichten(app: ReturnType<typeof testServer>["app"], name = "admin") {
  const res = await app.inject({ method: "POST", url: "/api/setup", headers: csrf, payload: { name, passwort: PASSWORT } });
  const cookie = res.cookies.find((c) => c.name === "lion_sitzung");
  return { res, cookie: cookie ? `lion_sitzung=${cookie.value}` : "" };
}

/** Server mit App-Verwaltung, aber ohne echtes Docker und ohne echtes Caddy. */
export async function testServerMitApps() {
  const db = oeffneDatenbank(":memory:");
  const { vorlagen } = await ladeKatalog(fileURLToPath(new URL("../../apps", import.meta.url)));
  const basis = await mkdtemp(join(tmpdir(), "lion-srv-"));
  const apps = new AppVerwaltung({
    db,
    vorlagen,
    laufzeit: {
      hochfahren: async () => {},
      starten: async () => {},
      stoppen: async () => {},
      entfernen: async () => {},
      status: async () => "laeuft",
    },
    caddy: { eintragSetzen: async () => {}, eintragEntfernen: async () => {}, adressen: async () => ["localhost"] },
    zustandsOrdner: join(basis, "zustand"),
    datenOrdner: join(basis, "daten"),
  });
  const app = baueServer({ db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false, apps });
  return { app, db, apps };
}
