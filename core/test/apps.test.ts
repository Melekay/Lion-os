import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppFehler, AppVerwaltung } from "../src/apps.js";
import { letzteEintraege } from "../src/audit.js";
import type { CaddyVerwaltung } from "../src/caddy.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { ladeKatalog } from "../src/katalog.js";
import type { AppStatus, Laufzeit } from "../src/laufzeit.js";

const KATALOG = fileURLToPath(new URL("../../apps", import.meta.url));

class AttrappenLaufzeit implements Laufzeit {
  aufrufe: string[] = [];
  zustand = new Map<string, AppStatus>();
  fehlerBei: string | null = null;
  private tu(aktion: string, projekt: string) {
    this.aufrufe.push(`${aktion}:${projekt}`);
    if (this.fehlerBei === aktion) throw new Error(`Docker-Fehler bei ${aktion}`);
  }
  async hochfahren(p: string) { this.tu("hochfahren", p); this.zustand.set(p, "laeuft"); }
  async starten(p: string) { this.tu("starten", p); this.zustand.set(p, "laeuft"); }
  async stoppen(p: string) { this.tu("stoppen", p); this.zustand.set(p, "gestoppt"); }
  async entfernen(p: string) { this.tu("entfernen", p); this.zustand.delete(p); }
  async status(p: string) { return this.zustand.get(p) ?? "gestoppt"; }
}

class AttrappenCaddy implements CaddyVerwaltung {
  eintraege = new Map<string, [number, number]>();
  async eintragSetzen(id: string, o: number, l: number) { this.eintraege.set(id, [o, l]); }
  async eintragEntfernen(id: string) { this.eintraege.delete(id); }
  async adressen() { return ["localhost", "192.168.1.20"]; }
}

async function aufbau() {
  const basis = await mkdtemp(join(tmpdir(), "lion-apps-"));
  const db = oeffneDatenbank(":memory:");
  const { vorlagen } = await ladeKatalog(KATALOG);
  const laufzeit = new AttrappenLaufzeit();
  const caddy = new AttrappenCaddy();
  const apps = new AppVerwaltung({ db, vorlagen, laufzeit, caddy, zustandsOrdner: join(basis, "zustand"), datenOrdner: join(basis, "daten") });
  return { basis, db, laufzeit, caddy, apps };
}

describe("Installieren", () => {
  it("richtet Ordner, .env (600) mit Geheimnissen, Container und Caddy-Eintrag ein", async () => {
    const { basis, laufzeit, caddy, apps, db } = await aufbau();
    apps.installieren("nextcloud", "admin");
    await apps.warteAuf("nextcloud");

    const env = await readFile(join(basis, "zustand/nextcloud/.env"), "utf8");
    expect(env).toContain("LION_APP_PORT=18101");
    expect(env).toContain(`LION_APP_DATA=${join(basis, "daten/nextcloud")}`);
    expect(env).toMatch(/^POSTGRES_PASSWORD=[0-9a-f]{64}$/m);
    expect((await stat(join(basis, "zustand/nextcloud/.env"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(basis, "daten/nextcloud"))).isDirectory()).toBe(true);

    expect(laufzeit.aufrufe).toEqual(["hochfahren:lion-app-nextcloud"]);
    expect(caddy.eintraege.get("nextcloud")).toEqual([8101, 18101]);

    const liste = await apps.liste();
    const nc = liste.find((a) => a.id === "nextcloud")!;
    expect(nc.installiert?.status).toBe("laeuft");
    expect(nc.installiert?.adressen).toEqual(["https://localhost:8101", "https://192.168.1.20:8101"]);
    expect(letzteEintraege(db)[0]).toMatchObject({ aktion: "app.installieren", ziel: "nextcloud", ergebnis: "erfolg" });
  });

  it("vergibt fortlaufende Ports und schreibt keine Geheimnisse ins Audit-Log", async () => {
    const { apps, caddy, db, basis } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    apps.installieren("vaultwarden", "admin");
    await apps.warteAuf("vaultwarden");
    expect(caddy.eintraege.get("uptime-kuma")).toEqual([8101, 18101]);
    expect(caddy.eintraege.get("vaultwarden")).toEqual([8102, 18102]);
    apps.installieren("nextcloud", "admin");
    await apps.warteAuf("nextcloud");
    const geheimnis = (await readFile(join(basis, "zustand/nextcloud/.env"), "utf8")).match(/POSTGRES_PASSWORD=(\w+)/)![1]!;
    expect(JSON.stringify(letzteEintraege(db))).not.toContain(geheimnis);
  });

  it("lehnt doppelte Installation und unbekannte Apps ab", async () => {
    const { apps } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    expect(() => apps.installieren("uptime-kuma", "admin")).toThrow(AppFehler);
    await apps.warteAuf("uptime-kuma");
    expect(() => apps.installieren("uptime-kuma", "admin")).toThrow(/bereits installiert/);
    expect(() => apps.installieren("gibtsnicht", "admin")).toThrow(/Unbekannte App/);
  });

  it("markiert Fehler beim Start und protokolliert sie", async () => {
    const { apps, laufzeit, caddy, db } = await aufbau();
    laufzeit.fehlerBei = "hochfahren";
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    const app = (await apps.liste()).find((a) => a.id === "uptime-kuma")!;
    expect(app.installiert?.status).toBe("fehler");
    expect(app.installiert?.meldung).toMatch(/Docker-Fehler/);
    expect(caddy.eintraege.size).toBe(0);
    expect(letzteEintraege(db)[0]).toMatchObject({ aktion: "app.installieren", ergebnis: "fehler" });
  });
});

describe("Starten, Stoppen, Entfernen", () => {
  it("stoppt und startet eine installierte App", async () => {
    const { apps, laufzeit } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    apps.stoppen("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    expect((await apps.liste()).find((a) => a.id === "uptime-kuma")?.installiert?.status).toBe("gestoppt");
    apps.starten("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    expect(laufzeit.aufrufe).toEqual(["hochfahren:lion-app-uptime-kuma", "stoppen:lion-app-uptime-kuma", "starten:lion-app-uptime-kuma"]);
  });

  it("verlangt zum Entfernen die App-ID als Bestätigung", async () => {
    const { apps } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    expect(() => apps.entfernen("uptime-kuma", "admin", undefined)).toThrow(/Bestätigung/);
    expect(() => apps.entfernen("uptime-kuma", "admin", "ja")).toThrow(/Bestätigung/);
  });

  it("entfernt Container, Caddy-Eintrag und Zustand, behält aber die Daten", async () => {
    const { apps, caddy, basis } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    apps.entfernen("uptime-kuma", "admin", "uptime-kuma");
    await apps.warteAuf("uptime-kuma");
    expect(caddy.eintraege.has("uptime-kuma")).toBe(false);
    await expect(stat(join(basis, "zustand/uptime-kuma"))).rejects.toThrow();
    expect((await stat(join(basis, "daten/uptime-kuma"))).isDirectory()).toBe(true);
    expect((await apps.liste()).find((a) => a.id === "uptime-kuma")?.installiert).toBeNull();
  });

  it("gibt Ports nach dem Entfernen wieder frei", async () => {
    const { apps, caddy } = await aufbau();
    apps.installieren("uptime-kuma", "admin");
    await apps.warteAuf("uptime-kuma");
    apps.entfernen("uptime-kuma", "admin", "uptime-kuma");
    await apps.warteAuf("uptime-kuma");
    apps.installieren("vaultwarden", "admin");
    await apps.warteAuf("vaultwarden");
    expect(caddy.eintraege.get("vaultwarden")).toEqual([8101, 18101]);
  });

  it("lehnt Aktionen für nicht installierte Apps ab", async () => {
    const { apps } = await aufbau();
    expect(() => apps.starten("uptime-kuma", "admin")).toThrow(/nicht installiert/);
    expect(() => apps.entfernen("uptime-kuma", "admin", "uptime-kuma")).toThrow(/nicht installiert/);
  });
});
