import { describe, expect, it } from "vitest";
import { ladeKonfiguration } from "../src/konfiguration.js";

describe("Konfiguration", () => {
  it("verlangt ein Geheimnis mit mindestens 32 Zeichen", () => {
    expect(() => ladeKonfiguration({})).toThrow(/LION_SECRET/);
    expect(() => ladeKonfiguration({ LION_SECRET: "zu-kurz" })).toThrow(/32 Zeichen/);
  });

  it("setzt sichere Standardwerte (nur lokal erreichbar)", () => {
    const k = ladeKonfiguration({ LION_SECRET: "x".repeat(32) });
    expect(k.host).toBe("127.0.0.1");
    expect(k.port).toBe(8080);
    expect(k.datenbank).toBe("/var/lib/lion/lion.db");
  });

  it("liest Port als Zahl und lehnt ungültige Ports ab", () => {
    expect(ladeKonfiguration({ LION_SECRET: "x".repeat(32), LION_PORT: "9000" }).port).toBe(9000);
    expect(() => ladeKonfiguration({ LION_SECRET: "x".repeat(32), LION_PORT: "70000" })).toThrow();
  });

  it("liest den Einrichtungscode (optional, mindestens 8 Zeichen)", () => {
    expect(ladeKonfiguration({ LION_SECRET: "x".repeat(32) }).einrichtungsCode).toBeUndefined();
    expect(ladeKonfiguration({ LION_SECRET: "x".repeat(32), LION_SETUP_CODE: "ABCD-EFGH-JKLM" }).einrichtungsCode).toBe("ABCD-EFGH-JKLM");
    expect(() => ladeKonfiguration({ LION_SECRET: "x".repeat(32), LION_SETUP_CODE: "kurz" })).toThrow(/LION_SETUP_CODE/);
  });
});
