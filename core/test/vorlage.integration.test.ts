import { chmod, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppVerwaltung } from "../src/apps.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { ladeKatalog } from "../src/katalog.js";
import { DockerComposeLaufzeit } from "../src/laufzeit.js";

/**
 * Installiert EINE Vorlage wirklich mit Docker und prüft, ob ihre Weboberfläche antwortet.
 * Läuft nur mit LION_APP_TEST=<app-id> (die CI startet das für jede App einzeln).
 */
const appId = process.env.LION_APP_TEST ?? "";
const MEDIEN_ORDNER = ["Filme", "Serien", "Musik", "Hörbücher"];

describe.skipIf(!appId)(`Vorlage „${appId}“ mit echtem Docker`, () => {
  it("installiert, antwortet über den Lion-Proxy-Weg, liefert ein Protokoll und lässt sich entfernen", { timeout: 1_500_000 }, async () => {
    const basis = await mkdtemp(join(tmpdir(), "lion-vorlage-"));
    const medien = join(basis, "medien");
    for (const ordner of MEDIEN_ORDNER) await mkdir(join(medien, ordner), { recursive: true });
    for (const ordner of ["", ...MEDIEN_ORDNER]) await chmod(join(medien, ordner), 0o777);

    const { vorlagen, fehler } = await ladeKatalog(fileURLToPath(new URL("../../apps", import.meta.url)));
    expect(fehler).toEqual([]);
    const apps = new AppVerwaltung({
      db: oeffneDatenbank(":memory:"),
      vorlagen,
      laufzeit: new DockerComposeLaufzeit(),
      caddy: { eintragSetzen: async () => {}, eintragEntfernen: async () => {}, adressen: async () => ["localhost"] },
      zustandsOrdner: join(basis, "zustand"),
      datenOrdner: join(basis, "daten"),
      medienOrdner: medien,
    });
    const status = async () => (await apps.liste()).find((a) => a.id === appId)?.installiert;

    try {
      apps.installieren(appId, "test");
      await apps.warteAuf(appId);
      expect((await status())?.meldung).toBeNull();
      expect((await status())?.status).toBe("laeuft");

      // Wie hinter Caddy: mit X-Forwarded-*-Kopfzeilen. Apps, die dem Proxy nicht vertrauen, antworten dann mit 400.
      let antwort = 0;
      for (let i = 0; i < 300 && (antwort === 0 || antwort >= 500); i++) {
        antwort = await fetch("http://127.0.0.1:18101/", {
          redirect: "manual",
          headers: { "X-Forwarded-For": "192.168.1.50", "X-Forwarded-Proto": "https", "X-Forwarded-Host": "lion.local:8101" },
        }).then((r) => r.status, () => 0);
        if (antwort === 0 || antwort >= 500) await new Promise((r) => setTimeout(r, 2000));
      }
      console.log(`${appId}: HTTP ${antwort}`);
      expect(antwort).toBeGreaterThanOrEqual(200);
      expect(antwort).toBeLessThan(400);

      const { zeilen } = await apps.protokoll(appId);
      expect(zeilen.length).toBeGreaterThan(0);
      expect((await status())?.status).toBe("laeuft");
    } catch (e) {
      const { zeilen } = await apps.protokoll(appId).catch(() => ({ zeilen: [] as string[] }));
      console.log(zeilen.slice(-80).join("\n"));
      throw e;
    } finally {
      apps.entfernen(appId, "test", appId);
      await apps.warteAuf(appId);
    }
    expect(await status()).toBeNull();
  });
});
