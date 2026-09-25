import { describe, expect, it } from "vitest";
import { zielGroesse } from "@/lib/bild";

describe("Foto verkleinern", () => {
  it("behält das Seitenverhältnis und bleibt innerhalb der Grenzen", () => {
    expect(zielGroesse(6000, 4000)).toEqual({ breite: 2400, hoehe: 1600 });
    expect(zielGroesse(8000, 2000)).toEqual({ breite: 2560, hoehe: 640 });
    expect(zielGroesse(3000, 4000)).toEqual({ breite: 1200, hoehe: 1600 });
  });

  it("vergrößert nie und fängt Unsinn ab", () => {
    expect(zielGroesse(1280, 720)).toEqual({ breite: 1280, hoehe: 720 });
    expect(zielGroesse(0, 100)).toEqual({ breite: 0, hoehe: 0 });
    expect(zielGroesse(NaN, 100)).toEqual({ breite: 0, hoehe: 0 });
    expect(zielGroesse(100000, 1)).toEqual({ breite: 2560, hoehe: 1 });
  });
});
