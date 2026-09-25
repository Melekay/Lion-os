import { describe, expect, it } from "vitest";
import { DockerComposeLaufzeit, werteStatusAus } from "../src/laufzeit.js";

describe("Status aus docker compose ps", () => {
  it("erkennt laufend, gestoppt und teilweise", () => {
    expect(werteStatusAus('{"State":"running"}\n{"State":"running"}')).toBe("laeuft");
    expect(werteStatusAus('{"State":"exited"}')).toBe("gestoppt");
    expect(werteStatusAus('{"State":"running"}\n{"State":"exited"}')).toBe("teilweise");
    expect(werteStatusAus('[{"State":"running"}]')).toBe("laeuft");
    expect(werteStatusAus("")).toBe("gestoppt");
    expect(werteStatusAus("kein json")).toBe("unbekannt");
  });
});

describe("Docker-Aufrufe", () => {
  it("lehnt ungültige Projektnamen ab (keine Befehls-Einschleusung)", async () => {
    const l = new DockerComposeLaufzeit("/bin/false");
    await expect(l.hochfahren("lion-app-x; rm -rf /", "/tmp")).rejects.toThrow(/Ungültiger Projektname/);
    await expect(l.stoppen("fremdes-projekt", "/tmp")).rejects.toThrow(/Ungültiger Projektname/);
  });

  it("meldet „unbekannt“, wenn Docker nicht antwortet", async () => {
    const l = new DockerComposeLaufzeit("/bin/false");
    expect(await l.status("lion-app-test", "/tmp")).toBe("unbekannt");
  });
});
