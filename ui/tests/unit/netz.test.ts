import { describe, expect, it } from "vitest";
import { LEERER_VERLAUF, linie, neuerVerlauf, rate } from "@/lib/netz";

const netz = (rx: number, tx: number, schnittstelle = "eth0") => ({ schnittstelle, empfangenBytes: rx, gesendetBytes: tx });

describe("Netzwerk-Verlauf", () => {
  it("erster Wert ergibt noch keinen Punkt, der zweite eine Rate pro Sekunde", () => {
    const a = neuerVerlauf(LEERER_VERLAUF, netz(1000, 500), 0);
    expect(a.punkte).toEqual([]);
    const b = neuerVerlauf(a, netz(11_000, 2500), 5000);
    expect(b.punkte).toEqual([{ runter: 2000, hoch: 400 }]);
  });

  it("zurückgesetzte Zähler oder andere Karte beginnen neu statt negativ zu werden", () => {
    const a = neuerVerlauf(neuerVerlauf(LEERER_VERLAUF, netz(5000, 5000), 0), netz(6000, 6000), 1000);
    expect(a.punkte).toHaveLength(1);
    expect(neuerVerlauf(a, netz(10, 10), 2000).punkte).toHaveLength(1);
    expect(neuerVerlauf(a, netz(9000, 9000, "wlan0"), 2000).punkte).toHaveLength(1);
  });

  it("behält höchstens max Punkte und ignoriert fehlende Daten", () => {
    let v = LEERER_VERLAUF;
    for (let i = 0; i < 10; i++) v = neuerVerlauf(v, netz(i * 100, i * 10), i * 1000, 5);
    expect(v.punkte).toHaveLength(5);
    expect(neuerVerlauf(v, null, 99_000)).toBe(v);
  });
});

describe("Anzeige", () => {
  it("rate nutzt passende Einheiten", () => {
    expect(rate(512)).toBe("512 B/s");
    expect(rate(3_400)).toBe("3,4 kB/s");
    expect(rate(11_000)).toBe("11 kB/s");
    expect(rate(2_500_000)).toBe("2,5 MB/s");
    expect(rate(-5)).toBe("0 B/s");
  });

  it("linie skaliert auf die Fläche und braucht mindestens zwei Punkte", () => {
    expect(linie([1], 1)).toBe("");
    expect(linie([0, 10], 10, 40)).toBe("0.0,39.0 100.0,1.0");
  });
});
