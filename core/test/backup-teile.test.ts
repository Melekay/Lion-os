import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erzeugeSchluessel, faellig, naechsterLauf } from "../src/backup/plan.js";
import { dockerArgumente, falscherSchluessel, keinRepository, RESTIC_IMAGE, werteSicherungenAus, werteZusammenfassungAus } from "../src/backup/restic.js";
import { pruefeZiel } from "../src/backup/ziel.js";

describe("dockerArgumente", () => {
  const m = { quelle: "/srv/lion/apps", ziel: "/daten/apps", nurLesen: true };

  it("läuft ohne Netzwerk, schreibgeschützt, nur mit Lese-/Schreibzugriff auf Dateien", () => {
    const a = dockerArgumente({ mounts: [m], rechte: "lesen", resticArgs: ["snapshots"] });
    expect(a.slice(0, 2)).toEqual(["run", "--rm"]);
    expect(a.join(" ")).toContain("--network none");
    expect(a).toContain("--read-only");
    expect(a.join(" ")).toContain("--cap-drop ALL --cap-add DAC_READ_SEARCH --cap-add DAC_OVERRIDE --security-opt no-new-privileges:true");
    expect(a).not.toContain("CHOWN");
    expect(a).not.toContain("FOWNER");
    expect(a).toContain("type=bind,source=/srv/lion/apps,target=/daten/apps,readonly");
    expect(a.slice(-3)).toEqual([RESTIC_IMAGE, "--no-cache", "snapshots"]);
  });

  it("Wiederherstellen darf Besitzer und Rechte setzen", () => {
    const a = dockerArgumente({ mounts: [], rechte: "schreiben", resticArgs: [], tmpfs: ["/wiederherstellung"] });
    for (const r of ["DAC_OVERRIDE", "CHOWN", "FOWNER"]) expect(a).toContain(r);
    expect(a.join(" ")).toContain("--tmpfs /wiederherstellung");
  });

  it("feste Image-Version, nie latest", () => {
    expect(RESTIC_IMAGE).toMatch(/^restic\/restic:\d+\.\d+\.\d+$/);
  });

  it("lehnt gefährliche Pfade ab (Kommas, .., relative Pfade)", () => {
    for (const quelle of ["/mnt/a,target=/etc", "/mnt/../etc", "relativ", "/mnt/a b"]) {
      expect(() => dockerArgumente({ mounts: [{ quelle, ziel: "/repo", nurLesen: false }], rechte: "lesen", resticArgs: [] })).toThrow(/Unzulässiger Pfad/);
    }
  });
});

describe("restic-Ausgaben", () => {
  it("Sicherungen: neueste zuerst", () => {
    const s = werteSicherungenAus(
      JSON.stringify([
        { id: "a".repeat(64), short_id: "aaaaaaaa", time: "2026-09-20T03:00:00Z", paths: ["/daten"] },
        { id: "b".repeat(64), time: "2026-09-25T03:00:00Z" },
      ]),
    );
    expect(s.map((x) => x.kurz)).toEqual(["bbbbbbbb", "aaaaaaaa"]);
    expect(werteSicherungenAus("")).toEqual([]);
  });

  it("Zusammenfassung aus der letzten summary-Zeile", () => {
    const aus = ['{"message_type":"status","percent_done":0.5}', 'Text dazwischen', '{"message_type":"summary","files_new":3,"data_added":1234,"snapshot_id":"abc123"}'].join("\n");
    expect(werteZusammenfassungAus(aus)).toEqual({ sicherung: "abc123", dateienNeu: 3, bytesNeu: 1234 });
    expect(werteZusammenfassungAus("")).toEqual({ sicherung: null, dateienNeu: 0, bytesNeu: 0 });
  });

  it("unterscheidet „kein Backup“ von „falscher Schlüssel“", () => {
    expect(keinRepository("Fatal: unable to open config file: stat /repo/config: no such file or directory\nIs there a repository at the following location?")).toBe(true);
    expect(falscherSchluessel("Fatal: wrong password or no key found")).toBe(true);
    expect(keinRepository("Fatal: wrong password or no key found")).toBe(false);
  });
});

describe("Zeitplan", () => {
  const d = (s: string) => new Date(s);

  it("fällig ab der Uhrzeit, einmal pro Tag", () => {
    expect(faellig(d("2026-09-25T02:59:00"), "03:00", null)).toBe(false);
    expect(faellig(d("2026-09-25T03:00:00"), "03:00", null)).toBe(true);
    expect(faellig(d("2026-09-25T09:00:00"), "03:00", d("2026-09-24T03:00:00"))).toBe(true);
    expect(faellig(d("2026-09-25T09:00:00"), "03:00", d("2026-09-25T03:00:05"))).toBe(false);
  });

  it("nächster Lauf: heute, sofort oder morgen", () => {
    expect(naechsterLauf(d("2026-09-25T01:00:00"), "03:00", null)).toEqual(d("2026-09-25T03:00:00"));
    expect(naechsterLauf(d("2026-09-25T09:00:00"), "03:00", d("2026-09-25T03:00:05"))).toEqual(d("2026-09-26T03:00:00"));
    const jetzt = d("2026-09-25T09:00:00");
    expect(naechsterLauf(jetzt, "03:00", null)).toEqual(jetzt);
  });

  it("Schlüssel: 6×4 Zeichen ohne verwechselbare Zeichen, jedes Mal anders", () => {
    const s = erzeugeSchluessel();
    expect(s).toMatch(/^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/);
    expect(s).not.toBe(erzeugeSchluessel());
  });
});

describe("pruefeZiel", () => {
  async function basis() {
    const b = await mkdtemp(join(tmpdir(), "lion-ziel-"));
    await mkdir(join(b, "mnt", "usb"), { recursive: true });
    await mkdir(join(b, "etc"), { recursive: true });
    return { b, regeln: { erlaubt: [join(b, "mnt")], daten: join(b, "daten"), anderesGeraetPflicht: false } };
  }

  it("akzeptiert Unterordner der erlaubten Orte und liefert den echten Pfad", async () => {
    const { b, regeln } = await basis();
    expect(await pruefeZiel(`${join(b, "mnt", "usb")}/`, regeln)).toMatch(/\/mnt\/usb$/);
  });

  it("lehnt den erlaubten Ordner selbst, fremde Orte und Umwege über Symlinks ab", async () => {
    const { b, regeln } = await basis();
    await symlink(join(b, "etc"), join(b, "mnt", "trick"));
    await expect(pruefeZiel(join(b, "mnt"), regeln)).rejects.toThrow(/nur in Unterordnern/);
    await expect(pruefeZiel(join(b, "etc"), regeln)).rejects.toThrow(/nur in Unterordnern/);
    await expect(pruefeZiel(join(b, "mnt", "trick"), regeln)).rejects.toThrow(/nur in Unterordnern/);
  });

  it("verständliche Fehler für fehlende Ordner, Dateien und relative Pfade", async () => {
    const { b, regeln } = await basis();
    await writeFile(join(b, "mnt", "datei"), "x");
    await expect(pruefeZiel(join(b, "mnt", "fehlt"), regeln)).rejects.toThrow(/eingehängt/);
    await expect(pruefeZiel(join(b, "mnt", "datei"), regeln)).rejects.toThrow(/kein Ordner/);
    await expect(pruefeZiel("mnt/usb", regeln)).rejects.toThrow(/vollständigen Pfad/);
    await expect(pruefeZiel("/mnt/usb b", regeln)).rejects.toThrow(/nur Buchstaben/);
  });

  it("verlangt einen anderen Datenträger als die Daten", async () => {
    const { b, regeln } = await basis();
    await mkdir(regeln.daten);
    await expect(pruefeZiel(join(b, "mnt", "usb"), { ...regeln, anderesGeraetPflicht: true })).rejects.toThrow(/derselben Festplatte/);
  });
});
