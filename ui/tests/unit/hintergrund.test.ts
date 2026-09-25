import { afterEach, describe, expect, it, vi } from "vitest";
import { gespeicherterHintergrund, HINTERGRUND_SKRIPT, istHintergrund, setzeHintergrund, SPEICHER_SCHLUESSEL, STANDARD_HINTERGRUND } from "@/lib/hintergrund";

function speicher(start: Record<string, string> = {}) {
  const daten = new Map(Object.entries(start));
  return {
    getItem: (k: string) => daten.get(k) ?? null,
    setItem: (k: string, v: string) => void daten.set(k, v),
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
    const lauf = (wert: string | null) => {
      const dataset: Record<string, string> = {};
      new Function("localStorage", "document", HINTERGRUND_SKRIPT)({ getItem: () => wert }, { documentElement: { dataset } });
      return dataset.hintergrund;
    };
    expect(lauf("aurora")).toBe("aurora");
    expect(lauf("<script>")).toBeUndefined();
    expect(lauf(null)).toBeUndefined();
  });
});
