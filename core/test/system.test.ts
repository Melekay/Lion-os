import { describe, expect, it } from "vitest";
import { bewerte, messe, type Messwerte } from "../src/system.js";

const basis: Messwerte = {
  cpuKerne: 4,
  last1: 1,
  ramGesamtMb: 16000,
  ramFreiMb: 10000,
  speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 50 }],
  temperaturC: 50,
  laufzeitS: 100,
};

describe("Ampel", () => {
  it("ist grün, wenn alles im Rahmen ist", () => {
    expect(bewerte(basis)).toEqual({ ampel: "gruen", hinweise: [] });
  });

  it("wird gelb ab 80 % belegtem Speicher", () => {
    const r = bewerte({ ...basis, speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 15 }] });
    expect(r.ampel).toBe("gelb");
    expect(r.hinweise[0]?.text).toMatch(/85 % voll/);
  });

  it("wird rot ab 90 % belegtem Speicher", () => {
    expect(bewerte({ ...basis, speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 5 }] }).ampel).toBe("rot");
  });

  it("Rot schlägt Gelb", () => {
    const r = bewerte({ ...basis, temperaturC: 90, speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 15 }] });
    expect(r.ampel).toBe("rot");
    expect(r.hinweise).toHaveLength(2);
  });

  it("bewertet CPU-Last pro Kern", () => {
    expect(bewerte({ ...basis, last1: 4 }).ampel).toBe("gelb");
    expect(bewerte({ ...basis, last1: 8 }).ampel).toBe("rot");
  });

  it("ignoriert fehlende Temperatur und leere Datenträger", () => {
    expect(bewerte({ ...basis, temperaturC: null, speicher: [{ pfad: "/x", gesamtGb: 0, freiGb: 0 }] }).ampel).toBe("gruen");
  });

  it("warnt bei knappem Arbeitsspeicher", () => {
    expect(bewerte({ ...basis, ramFreiMb: 1600 }).ampel).toBe("gelb");
    expect(bewerte({ ...basis, ramFreiMb: 400 }).ampel).toBe("rot");
  });
});

describe("Messung", () => {
  it("liefert plausible Werte vom echten System", async () => {
    const m = await messe(["/"]);
    expect(m.cpuKerne).toBeGreaterThan(0);
    expect(m.ramGesamtMb).toBeGreaterThan(0);
    expect(m.ramFreiMb).toBeLessThanOrEqual(m.ramGesamtMb);
    expect(m.speicher[0]?.gesamtGb).toBeGreaterThan(0);
  });

  it("kommt mit nicht existierenden Pfaden zurecht", async () => {
    const m = await messe(["/gibt/es/nicht"]);
    expect(m.speicher[0]).toEqual({ pfad: "/gibt/es/nicht", gesamtGb: 0, freiGb: 0 });
  });
});
