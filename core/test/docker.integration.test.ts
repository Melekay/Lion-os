import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AppVerwaltung } from "../src/apps.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { ladeKatalog } from "../src/katalog.js";
import { DockerComposeLaufzeit } from "../src/laufzeit.js";

/**
 * Echte Installation mit Docker. Läuft nur mit LION_DOCKER_TEST=1 (CI und lokal mit Docker).
 * Caddy wird hier ersetzt; geprüft wird, dass die App lokal auf 127.0.0.1 antwortet.
 */
const aktiv = process.env.LION_DOCKER_TEST === "1";

describe.skipIf(!aktiv)("Echte Installation mit Docker", () => {
  it("installiert Uptime Kuma, erreicht es lokal, stoppt, startet und entfernt es", { timeout: 600_000 }, async () => {
    const basis = await mkdtemp(join(tmpdir(), "lion-docker-"));
    const { vorlagen } = await ladeKatalog(fileURLToPath(new URL("../../apps", import.meta.url)));
    const laufzeit = new DockerComposeLaufzeit();
    const apps = new AppVerwaltung({
      db: oeffneDatenbank(":memory:"),
      vorlagen,
      laufzeit,
      caddy: { eintragSetzen: async () => {}, eintragEntfernen: async () => {}, adressen: async () => ["localhost"] },
      zustandsOrdner: join(basis, "zustand"),
      datenOrdner: join(basis, "daten"),
    });
    const status = async () => (await apps.liste()).find((a) => a.id === "uptime-kuma")?.installiert;

    apps.installieren("uptime-kuma", "test");
    await apps.warteAuf("uptime-kuma");
    expect((await status())?.meldung).toBeNull();
    expect((await status())?.status).toBe("laeuft");

    let antwort = 0;
    for (let i = 0; i < 60 && antwort === 0; i++) {
      antwort = await fetch("http://127.0.0.1:18101/").then((r) => r.status, () => 0);
      if (antwort === 0) await new Promise((r) => setTimeout(r, 1000));
    }
    expect(antwort).toBeGreaterThanOrEqual(200);
    expect(antwort).toBeLessThan(400);

    apps.stoppen("uptime-kuma", "test");
    await apps.warteAuf("uptime-kuma");
    expect((await status())?.status).toBe("gestoppt");

    apps.starten("uptime-kuma", "test");
    await apps.warteAuf("uptime-kuma");
    expect((await status())?.status).toBe("laeuft");

    apps.entfernen("uptime-kuma", "test", "uptime-kuma");
    await apps.warteAuf("uptime-kuma");
    expect(await status()).toBeNull();
    expect(await laufzeit.status("lion-app-uptime-kuma", join(basis, "zustand/uptime-kuma"))).not.toBe("laeuft");
  });
});
