import { describe, expect, it } from "vitest";
import { backupZustand, groesse, wannText } from "@/lib/backup";
import type { BackupStatus } from "@/lib/typen";

const JETZT = new Date("2026-09-25T10:00:00");
const lauf = (start: string, status: "erfolg" | "fehler" = "erfolg") => ({
  id: 1, art: "sicherung" as const, start, ende: start, status, meldung: null, sicherung: "abc", bytesNeu: 1, app: null,
});
const basis: BackupStatus = {
  eingerichtet: true, ziel: "/mnt/usb", zeit: "03:00", aktiv: true, laeuft: null,
  letzter: null, letzterErfolg: null, letzteWiederherstellung: null, naechster: null,
};

describe("backupZustand", () => {
  it("deckt alle Fälle ab", () => {
    const t = (s: Partial<BackupStatus>) => backupZustand({ ...basis, ...s }, JETZT.getTime()).ton;
    expect(backupZustand(undefined, 0).ton).toBe("neutral");
    expect(t({ eingerichtet: false })).toBe("gelb");
    expect(t({ laeuft: "sicherung" })).toBe("arbeitet");
    expect(t({})).toBe("gelb");
    expect(t({ letzter: lauf("2026-09-25T03:00:00"), letzterErfolg: lauf("2026-09-25T03:00:00") })).toBe("gruen");
    expect(t({ letzter: lauf("2026-09-22T03:00:00"), letzterErfolg: lauf("2026-09-22T03:00:00") })).toBe("gelb");
    expect(t({ letzter: lauf("2026-09-10T03:00:00"), letzterErfolg: lauf("2026-09-10T03:00:00") })).toBe("rot");
    expect(t({ letzter: lauf("2026-09-25T03:00:00", "fehler"), letzterErfolg: lauf("2026-09-24T03:00:00") })).toBe("rot");
  });
});

describe("Anzeige", () => {
  it("groesse", () => {
    expect(groesse(null)).toBe("–");
    expect(groesse(512)).toBe("512 B");
    expect(groesse(4096)).toBe("4 KB");
    expect(groesse(12.34 * 1024 * 1024)).toBe("12,3 MB");
    expect(groesse(150 * 1024 ** 3)).toBe("150 GB");
  });

  it("wannText", () => {
    expect(wannText("2026-09-25T15:00:00", JETZT)).toBe("heute um 15:00");
    expect(wannText("2026-09-26T03:00:00", JETZT)).toBe("morgen um 03:00");
    expect(wannText("2026-09-24T03:00:00", JETZT)).toBe("gestern um 03:00");
    expect(wannText(JETZT.toISOString(), JETZT)).toBe("jetzt gleich");
  });
});
