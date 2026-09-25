import { describe, expect, it } from "vitest";
import { aktionen, besteAdresse, beschaeftigt, kategorien, kategorieText, liveAnzeige, medienText, ramText, ramWarnung, sicherheitsHinweis, statusAnzeige } from "@/lib/apps";
import type { AppAnsicht, AppStatus } from "@/lib/typen";

const app = (status?: AppStatus): AppAnsicht => ({
  id: "uptime-kuma",
  name: "Uptime Kuma",
  beschreibung: "",
  kategorie: "ueberwachung",
  version: "1.23.16",
  sicherheitsstufe: "normal",
  hinweise: [],
  installiert: status ? { status, meldung: null, adressen: [], datenordner: "/srv/lion/apps/uptime-kuma" } : null,
});

describe("App-Status", () => {
  it("übersetzt jeden Status in Text und Ton", () => {
    expect(statusAnzeige(app())).toEqual({ text: "Nicht installiert", ton: "neutral" });
    expect(statusAnzeige(app("laeuft"))).toEqual({ text: "Läuft", ton: "gruen" });
    expect(statusAnzeige(app("installiere")).ton).toBe("arbeitet");
    expect(statusAnzeige(app("fehler")).ton).toBe("rot");
  });

  it("beschaeftigt, solange installiert oder entfernt wird", () => {
    expect(beschaeftigt([app("laeuft"), app()])).toBe(false);
    expect(beschaeftigt([app("laeuft"), app("installiere")])).toBe(true);
    expect(beschaeftigt([app("entferne")])).toBe(true);
  });

  it("zeigt nur sinnvolle Aktionen", () => {
    expect(aktionen(app())).toEqual(["installieren"]);
    expect(aktionen(app("laeuft"))).toEqual(["oeffnen", "stoppen", "protokoll", "entfernen"]);
    expect(aktionen(app("teilweise"))).toEqual(["oeffnen", "starten", "stoppen", "protokoll", "entfernen"]);
    expect(aktionen(app("gestoppt"))).toEqual(["starten", "protokoll", "entfernen"]);
    expect(aktionen(app("fehler"))).toEqual(["starten", "protokoll", "entfernen"]);
    expect(aktionen(app("installiere"))).toEqual([]);
    expect(aktionen(app("entferne"))).toEqual([]);
  });
});

describe("besteAdresse", () => {
  const adressen = ["https://localhost:8101", "https://box.local:8101", "https://192.168.1.20:8101"];

  it("nimmt die Adresse mit demselben Hostnamen wie die Oberfläche", () => {
    expect(besteAdresse(adressen, "192.168.1.20")).toBe("https://192.168.1.20:8101");
    expect(besteAdresse(adressen, "box.local")).toBe("https://box.local:8101");
  });

  it("sonst die erste, die nicht localhost ist", () => {
    expect(besteAdresse(adressen, "unbekannt")).toBe("https://box.local:8101");
    expect(besteAdresse(["https://localhost:8101"], "x")).toBe("https://localhost:8101");
    expect(besteAdresse([], "x")).toBeNull();
  });
});

describe("Texte", () => {
  it("Sicherheitsstufen haben eine Erklärung, normal nicht", () => {
    expect(sicherheitsHinweis("normal")).toBeNull();
    expect(sicherheitsHinweis("sensibel")?.text).toBe("Sensible Daten");
    expect(sicherheitsHinweis("vollzugriff")?.text).toBe("Vollzugriff");
  });

  it("Kategorien werden lesbar", () => {
    expect(kategorieText("ueberwachung")).toBe("Überwachung");
    expect(kategorieText("neu")).toBe("neu");
    expect(kategorieText("ki")).toBe("KI");
  });

  it("Kategorien für den Filter: ohne Doppelte, alphabetisch nach Anzeigename", () => {
    const mit = (kategorie: string) => ({ ...app(), kategorie });
    expect(kategorien([mit("medien"), mit("ki"), mit("medien"), mit("dateien")])).toEqual(["dateien", "ki", "medien"]);
  });

  it("Medienordner-Hinweis nur für Apps mit Zugriff", () => {
    expect(medienText("lesen")).toMatch(/nur lesen/);
    expect(medienText("schreiben")).toMatch(/Verwaltet/);
    expect(medienText("keine")).toBeNull();
    expect(medienText(undefined)).toBeNull();
  });
});

describe("RAM-Warnung", () => {
  const geraet = (ramGesamtMb: number, ramFreiMb: number) => ({ ramGesamtMb, ramFreiMb });

  it("schreibt Größen verständlich", () => {
    expect(ramText(512)).toBe("512 MB");
    expect(ramText(4096)).toBe("4 GB");
    expect(ramText(1536)).toBe("1,5 GB");
  });

  it("rot, wenn das Gerät insgesamt zu wenig hat", () => {
    const w = ramWarnung(8192, geraet(4096, 3000));
    expect(w?.stufe).toBe("rot");
    expect(w?.text).toContain("mindestens 8 GB");
    expect(w?.text).toContain("insgesamt nur 4 GB");
  });

  it("gelb, wenn gerade zu wenig frei ist", () => {
    const w = ramWarnung(4096, geraet(8192, 2048));
    expect(w?.stufe).toBe("gelb");
    expect(w?.text).toContain("frei sind gerade 2 GB");
  });

  it("keine Warnung bei genug Speicher, ohne Messwerte oder ohne Angabe", () => {
    expect(ramWarnung(1024, geraet(8192, 4096))).toBeNull();
    expect(ramWarnung(4096, geraet(8192, 4096))).toBeNull();
    expect(ramWarnung(4096, null)).toBeNull();
    expect(ramWarnung(4096, geraet(0, 0))).toBeNull();
    expect(ramWarnung(undefined, geraet(1024, 100))).toBeNull();
    expect(ramWarnung(0, geraet(1024, 100))).toBeNull();
  });
});

describe("Live-Werte", () => {
  it("formatiert RAM und CPU und rechnet Anteile", () => {
    const l = liveAnzeige({ cpuProzent: 2.34, ramMb: 312.4 }, 8192)!;
    expect(l.ramText).toBe("312 MB");
    expect(l.cpuText).toBe("2,3 %");
    expect(l.ramAnteil).toBeCloseTo(312.4 / 8192);
    expect(l.cpuAnteil).toBeCloseTo(0.0234);
    expect(l.satz).toBe("312 MB Arbeitsspeicher, 2,3 % CPU");
    expect(liveAnzeige({ cpuProzent: 37.5, ramMb: 1234 }, 8192)?.ramText).toBe("1,2 GB");
    expect(liveAnzeige({ cpuProzent: 37.5, ramMb: 1234 }, 8192)?.cpuText).toBe("38 %");
    expect(liveAnzeige({ cpuProzent: 0, ramMb: 5 }, 8192)?.cpuText).toBe("0 %");
  });

  it("ohne Messung nichts, ohne Gesamt-RAM kein Anteil", () => {
    expect(liveAnzeige(undefined, 8192)).toBeNull();
    expect(liveAnzeige({ cpuProzent: 1, ramMb: 100 }, undefined)?.ramAnteil).toBe(0);
  });
});
