import { describe, expect, it } from "vitest";
import { groesseText, uuidAusZiel } from "@/lib/datentraeger";

describe("Datenträger", () => {
  it("Größen wie auf der Verpackung", () => {
    expect(groesseText(2_000_398_934_016)).toBe("2,0 TB");
    expect(groesseText(64_000_000_000)).toBe("64 GB");
    expect(groesseText(512_000_000)).toBe("512 MB");
    expect(groesseText(16_000_000_000_000)).toBe("16 TB");
    expect(groesseText(0)).toBe("–");
  });

  it("erkennt Backup-Ziele auf USB-Datenträgern von lion-helper", () => {
    expect(uuidAusZiel("/media/lion/ABCD-1234/lion-backup")).toBe("ABCD-1234");
    expect(uuidAusZiel("/media/lion/9f1c2b3a-0000-4d5e-8f90-123456789abc")).toBe("9f1c2b3a-0000-4d5e-8f90-123456789abc");
    expect(uuidAusZiel("/mnt/usb-backup")).toBeNull();
    expect(uuidAusZiel("/media/lion/../etc")).toBeNull();
    expect(uuidAusZiel(null)).toBeNull();
  });
});
