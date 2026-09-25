import { describe, expect, it } from "vitest";
import { DockerComposeLaufzeit, groesseInMb, summiereRessourcen, werteContainerAus, werteStatsAus, werteStatusAus } from "../src/laufzeit.js";

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

describe("Live-Werte aus Docker auswerten", () => {
  it("nimmt nur Container von Lion-Apps und ignoriert Unsinn", () => {
    const ps = [
      "3f2a1b4c5d6e\tlion-app-immich",
      "aaaaaaaaaaaa\tlion-app-immich",
      "bbbbbbbbbbbb\tlion-caddy",
      "cccccccccccc\tfremdes-projekt",
      "; rm -rf /\tlion-app-x",
      "",
    ].join("\n");
    expect([...werteContainerAus(ps)]).toEqual([
      ["3f2a1b4c5d6e", "lion-app-immich"],
      ["aaaaaaaaaaaa", "lion-app-immich"],
    ]);
  });

  it("rechnet Speicherangaben von Docker in MB um", () => {
    expect(groesseInMb("45.3MiB")).toBeCloseTo(45.3);
    expect(groesseInMb("1.5GiB")).toBe(1536);
    expect(groesseInMb("512KiB")).toBe(0.5);
    expect(groesseInMb("100MB")).toBeCloseTo(95.37, 1);
    expect(groesseInMb("0B")).toBe(0);
    expect(groesseInMb("kaputt")).toBe(0);
  });

  it("liest docker stats und summiert je App", () => {
    const stats = [
      JSON.stringify({ ID: "3f2a1b4c5d6e", CPUPerc: "12.50%", MemUsage: "1.2GiB / 7.6GiB" }),
      JSON.stringify({ ID: "aaaaaaaaaaaa", CPUPerc: "0.30%", MemUsage: "64MiB / 7.6GiB" }),
      "kein json",
      JSON.stringify({ ID: "zzz", CPUPerc: "1%", MemUsage: "1MiB / 1GiB" }),
    ].join("\n");
    const s = werteStatsAus(stats);
    expect(s.size).toBe(2);
    const container = new Map([
      ["3f2a1b4c5d6e", "lion-app-immich"],
      ["aaaaaaaaaaaa", "lion-app-immich"],
    ]);
    const summe = summiereRessourcen(container, s).get("lion-app-immich")!;
    expect(summe.cpuProzent).toBeCloseTo(12.8);
    expect(summe.ramMb).toBeCloseTo(1228.8 + 64);
  });
});
