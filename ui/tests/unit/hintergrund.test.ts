import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOTO_SCHLUESSEL,
  gespeicherterHintergrund,
  gleicheFotoAb,
  HINTERGRUND_SKRIPT,
  istFotoAdresse,
  istHintergrund,
  setzeHintergrund,
  SPEICHER_SCHLUESSEL,
  STANDARD_HINTERGRUND,
} from "@/lib/hintergrund";

function speicher(start: Record<string, string> = {}) {
  const daten = new Map(Object.entries(start));
  return {
    getItem: (k: string) => daten.get(k) ?? null,
    setItem: (k: string, v: string) => void daten.set(k, v),
    removeItem: (k: string) => void daten.delete(k),
    daten,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Hintergrund", () => {
  it("kennt nur die festen Hintergründe", () => {
    expect(istHintergrund("ozean")).toBe(true);
    expect(istHintergrund("javascript:alert(1)")).toBe(false);
    expect(istHintergrund(null)).toBe(false);
  });

  it("liest den gespeicherten Wert, sonst den Standard", () => {
    vi.stubGlobal("localStorage", speicher({ [SPEICHER_SCHLUESSEL]: "aurora" }));
    expect(gespeicherterHintergrund()).toBe("aurora");
    vi.stubGlobal("localStorage", speicher({ [SPEICHER_SCHLUESSEL]: "unbekannt" }));
    expect(gespeicherterHintergrund()).toBe(STANDARD_HINTERGRUND);
  });

  it("übersteht gesperrten Speicher", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("gesperrt");
      },
      setItem: () => {
        throw new Error("gesperrt");
      },
    });
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    expect(gespeicherterHintergrund()).toBe(STANDARD_HINTERGRUND);
    expect(() => setzeHintergrund("nebel")).not.toThrow();
    expect(dataset.hintergrund).toBe("nebel");
  });

  it("setzt das Attribut und speichert", () => {
    const s = speicher();
    const dataset: Record<string, string> = {};
    vi.stubGlobal("localStorage", s);
    vi.stubGlobal("document", { documentElement: { dataset } });
    setzeHintergrund("ozean");
    expect(dataset.hintergrund).toBe("ozean");
    expect(s.daten.get(SPEICHER_SCHLUESSEL)).toBe("ozean");
  });

  it("das Start-Skript übernimmt nur bekannte Werte", () => {
    const lauf = (wert: string | null, foto: string | null = null) => {
      const dataset: Record<string, string> = {};
      const stil: Record<string, string> = {};
      const speicher = { getItem: (k: string) => (k === SPEICHER_SCHLUESSEL ? wert : foto) };
      const dokument = { documentElement: { dataset, style: { setProperty: (k: string, v: string) => (stil[k] = v) } } };
      new Function("localStorage", "document", HINTERGRUND_SKRIPT)(speicher, dokument);
      return { wahl: dataset.hintergrund, foto: stil["--hg-foto"] };
    };
    expect(lauf("aurora").wahl).toBe("aurora");
    expect(lauf("<script>").wahl).toBeUndefined();
    expect(lauf(null).wahl).toBeUndefined();
    expect(lauf("foto", "/api/hintergrund?v=17")).toEqual({ wahl: "foto", foto: 'url("/api/hintergrund?v=17")' });
    expect(lauf("foto", '/api/hintergrund?v=1");background:url(https://böse.example')).toEqual({ wahl: undefined, foto: undefined });
    expect(lauf("foto", null).wahl).toBeUndefined();
  });

  it("Foto-Adressen: nur das Foto der Box oder ein eingebettetes JPEG", () => {
    expect(istFotoAdresse("/api/hintergrund?v=1712345678901")).toBe(true);
    expect(istFotoAdresse("data:image/jpeg;base64,/9j/4AAQSk+Z==")).toBe(true);
    expect(istFotoAdresse("https://example.com/bild.jpg")).toBe(false);
    expect(istFotoAdresse('/api/hintergrund?v=1")')).toBe(false);
    expect(istFotoAdresse("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(istFotoAdresse(null)).toBe(false);
  });

  it("gelöschtes Foto: zurück zum Standard-Verlauf", () => {
    const s = speicher({ [SPEICHER_SCHLUESSEL]: "foto", [FOTO_SCHLUESSEL]: "/api/hintergrund?v=1" });
    const dataset: Record<string, string> = { hintergrund: "foto" };
    vi.stubGlobal("localStorage", s);
    vi.stubGlobal("document", { documentElement: { dataset, style: { setProperty: () => {}, removeProperty: () => {} } } });
    gleicheFotoAb(null);
    expect(dataset.hintergrund).toBe(STANDARD_HINTERGRUND);
    expect(s.daten.has(FOTO_SCHLUESSEL)).toBe(false);
  });

  it("neue Foto-Version wird übernommen, die Wahl bleibt", () => {
    const s = speicher({ [SPEICHER_SCHLUESSEL]: "foto", [FOTO_SCHLUESSEL]: "/api/hintergrund?v=1" });
    const stil: Record<string, string> = {};
    const dataset: Record<string, string> = { hintergrund: "foto" };
    vi.stubGlobal("localStorage", s);
    vi.stubGlobal("document", { documentElement: { dataset, style: { setProperty: (k: string, v: string) => (stil[k] = v), removeProperty: () => {} } } });
    gleicheFotoAb("/api/hintergrund?v=2");
    expect(dataset.hintergrund).toBe("foto");
    expect(stil["--hg-foto"]).toBe('url("/api/hintergrund?v=2")');
    expect(gespeicherterHintergrund()).toBe("foto");
  });
});
