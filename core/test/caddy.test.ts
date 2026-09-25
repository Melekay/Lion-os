import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DateiCaddy, renderEintrag } from "../src/caddy.js";

describe("Caddy-Eintrag", () => {
  it("stellt die App per HTTPS auf allen Adressen bereit und leitet lokal weiter", () => {
    const text = renderEintrag(["localhost", "192.168.1.20"], 8101, 18101);
    expect(text).toContain("https://localhost:8101, https://192.168.1.20:8101 {");
    expect(text).toContain("tls internal");
    expect(text).toContain("reverse_proxy 127.0.0.1:18101");
  });

  it("filtert ungültige Adressen (keine Einschleusung in die Caddy-Konfiguration)", () => {
    const text = renderEintrag(["localhost", "boese { respond x }"], 8101, 18101);
    expect(text).not.toContain("boese");
  });

  it("schreibt und entfernt den Eintrag und lädt Caddy jeweils neu", async () => {
    const ordner = await mkdtemp(join(tmpdir(), "lion-caddy-"));
    const adressen = join(ordner, "adressen");
    await writeFile(adressen, "localhost\n10.0.0.5\n");
    const neuLaden = vi.fn(async () => {});
    const caddy = new DateiCaddy(ordner, adressen, "lion-caddy", neuLaden);

    await caddy.eintragSetzen("uptime-kuma", 8101, 18101);
    const inhalt = await readFile(join(ordner, "uptime-kuma.caddy"), "utf8");
    expect(inhalt).toContain("https://10.0.0.5:8101");
    expect(neuLaden).toHaveBeenCalledTimes(1);

    await caddy.eintragEntfernen("uptime-kuma");
    await expect(stat(join(ordner, "uptime-kuma.caddy"))).rejects.toThrow();
    expect(neuLaden).toHaveBeenCalledTimes(2);
  });

  it("nutzt localhost, wenn die Adressdatei fehlt", async () => {
    const caddy = new DateiCaddy("/tmp", "/gibt/es/nicht", "lion-caddy", async () => {});
    expect(await caddy.adressen()).toEqual(["localhost"]);
  });

  it("lehnt ungültige App-IDs ab (kein Pfad-Ausbruch)", async () => {
    const caddy = new DateiCaddy("/tmp", "/x", "lion-caddy", async () => {});
    await expect(caddy.eintragSetzen("../etc/passwd", 1, 2)).rejects.toThrow(/Ungültige App-ID/);
  });
});
