import { describe, expect, it } from "vitest";
import { aktionText, anteil, begruessung, datumLang, dauer, kennzahlen, speicherName, speicherZustand, ton, uhrzeit, zahl } from "@/lib/format";
import type { Systemstatus } from "@/lib/typen";

const STATUS: Systemstatus = {
  cpuKerne: 4,
  last1: 2,
  ramGesamtMb: 16384,
  ramFreiMb: 4096,
  speicher: [
    { pfad: "/", gesamtGb: 100, freiGb: 5 },
    { pfad: "/srv/lion", gesamtGb: 0, freiGb: 0 },
  ],
  temperaturC: 80,
  laufzeitS: 3 * 86400 + 4 * 3600,
  netzwerk: null,
  ampel: "rot",
  hinweise: [],
};

describe("Zahlen und Anteile", () => {
  it("formatiert deutsch", () => {
    expect(zahl(1234.5, 1)).toBe("1.234,5");
    expect(zahl(0.64, 2)).toBe("0,64");
  });

  it("anteil ist sicher gegen 0 und Ausreißer", () => {
    expect(anteil(5, 0)).toBe(0);
    expect(anteil(5, 10)).toBe(0.5);
    expect(anteil(20, 10)).toBe(1);
    expect(anteil(-1, 10)).toBe(0);
    expect(anteil(Number.NaN, 10)).toBe(0);
  });

  it("ton nutzt die Grenzen wie lion-core (ab Grenze gelb/rot)", () => {
    const g = { gelb: 0.8, rot: 0.9 };
    expect(ton(0.79, g)).toBe("gruen");
    expect(ton(0.8, g)).toBe("gelb");
    expect(ton(0.9, g)).toBe("rot");
  });
});

describe("Texte", () => {
  it("dauer zeigt die zwei größten Einheiten", () => {
    expect(dauer(59)).toBe("0 Min.");
    expect(dauer(22 * 60)).toBe("22 Min.");
    expect(dauer(5 * 3600 + 12 * 60)).toBe("5 Std., 12 Min.");
    expect(dauer(86400 + 3600)).toBe("1 Tag, 1 Std.");
    expect(dauer(3 * 86400 + 4 * 3600)).toBe("3 Tagen, 4 Std.");
  });

  it("begruessung passt zur Tageszeit", () => {
    expect(begruessung(7)).toBe("Guten Morgen");
    expect(begruessung(12)).toBe("Guten Tag");
    expect(begruessung(20)).toBe("Guten Abend");
    expect(begruessung(2)).toBe("Gute Nacht");
  });

  it("aktionText übersetzt bekannte Aktionen, unbekannte bleiben", () => {
    expect(aktionText("app.installieren")).toBe("App installieren");
    expect(aktionText("neu.etwas")).toBe("neu.etwas");
  });
});

describe("kennzahlen", () => {
  const k = kennzahlen(STATUS);

  it("berechnet Last pro Kern und färbt ab 1,0 gelb", () => {
    expect(k.cpu.wert).toBe("50 %");
    expect(k.cpu.ton).toBe("gruen");
    expect(kennzahlen({ ...STATUS, last1: 4 }).cpu.ton).toBe("gelb");
    expect(kennzahlen({ ...STATUS, last1: 8 }).cpu.ton).toBe("rot");
  });

  it("zeigt belegten Arbeitsspeicher", () => {
    expect(k.ram.wert).toBe("75 %");
    expect(k.ram.detail).toBe("12,0 von 16,0 GB belegt");
    expect(k.ram.ton).toBe("gruen");
  });

  it("lässt nicht eingebundene Speicher weg und färbt volle rot", () => {
    expect(k.speicher).toHaveLength(1);
    expect(k.speicher[0]).toMatchObject({ pfad: "/", wert: "95 %", ton: "rot", detail: "5 von 100 GB frei", belegtGb: 95, gesamtGb: 100 });
  });

  it("Temperatur: gelb ab 75 °C, null ohne Sensor", () => {
    expect(k.temperatur).toMatchObject({ wert: "80 °C", ton: "gelb" });
    expect(kennzahlen({ ...STATUS, temperaturC: null }).temperatur).toBeNull();
  });
});

describe("Uhr und Speicher-Zustand", () => {
  it("zeigt Uhrzeit und Datum deutsch", () => {
    const d = new Date(2026, 6, 14, 16, 32);
    expect(uhrzeit(d)).toBe("16:32");
    expect(datumLang(d)).toBe("Dienstag, 14. Juli 2026");
  });

  it("Speicher bekommt verständliche Namen", () => {
    expect(speicherName("/")).toBe("System");
    expect(speicherName("/srv/lion")).toBe("Daten");
    expect(speicherName("/mnt/usb")).toBe("/mnt/usb");
  });

  it("Speicher-Zustand in einem Wort", () => {
    expect(speicherZustand("gruen")).toBe("Gesund");
    expect(speicherZustand("gelb")).toBe("Wird knapp");
    expect(speicherZustand("rot")).toBe("Fast voll");
  });
});
