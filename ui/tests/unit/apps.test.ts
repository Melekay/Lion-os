import { describe, expect, it } from "vitest";
import { aktionen, besteAdresse, beschaeftigt, kategorieText, sicherheitsHinweis, statusAnzeige } from "@/lib/apps";
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
    expect(aktionen(app("laeuft"))).toEqual(["oeffnen", "stoppen", "entfernen"]);
    expect(aktionen(app("gestoppt"))).toEqual(["starten", "entfernen"]);
    expect(aktionen(app("fehler"))).toEqual(["starten", "entfernen"]);
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
  });
});
