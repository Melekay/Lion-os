import { describe, expect, it } from "vitest";
import { AnmeldeSperre, FENSTER_MS, MAX_VERSUCHE, SPERRE_MS } from "../src/sperre.js";

describe("Anmeldesperre", () => {
  it(`sperrt nach ${MAX_VERSUCHE} Fehlversuchen für ${SPERRE_MS / 60000} Minuten`, () => {
    const s = new AnmeldeSperre();
    for (let i = 0; i < MAX_VERSUCHE - 1; i++) s.fehlversuch("ip", 1000);
    expect(s.gesperrtFuer("ip", 1000)).toBe(0);
    s.fehlversuch("ip", 1000);
    expect(s.gesperrtFuer("ip", 1000)).toBe(SPERRE_MS);
    expect(s.gesperrtFuer("ip", 1000 + SPERRE_MS)).toBe(0);
  });

  it("zählt nach Ablauf des Fensters neu", () => {
    const s = new AnmeldeSperre();
    for (let i = 0; i < MAX_VERSUCHE - 1; i++) s.fehlversuch("ip", 0);
    s.fehlversuch("ip", FENSTER_MS + 1);
    expect(s.gesperrtFuer("ip", FENSTER_MS + 1)).toBe(0);
  });

  it("setzt nach erfolgreicher Anmeldung zurück und trennt Schlüssel", () => {
    const s = new AnmeldeSperre();
    for (let i = 0; i < MAX_VERSUCHE - 1; i++) s.fehlversuch("a", 0);
    s.erfolg("a");
    s.fehlversuch("a", 0);
    expect(s.gesperrtFuer("a", 0)).toBe(0);
    expect(s.gesperrtFuer("b", 0)).toBe(0);
  });
});
