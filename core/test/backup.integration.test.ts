import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackupVerwaltung } from "../src/backup/backup.js";
import { DockerRestic } from "../src/backup/restic.js";
import { oeffneDatenbank } from "../src/datenbank.js";

/**
 * Echte Sicherung und echte Wiederherstellung mit restic im Container (Projektregel: Backup-Logik
 * immer mit einem Test, der eine echte Wiederherstellung prüft). Braucht Docker:
 *   LION_DOCKER_TEST=1 npx vitest run test/backup.integration.test.ts
 */
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const keineApps = { laufendeApps: () => [], anhalten: async () => {}, fortsetzen: async () => {} };

describe.skipIf(process.env.LION_DOCKER_TEST !== "1")("Backup mit echtem restic", () => {
  it("sichert, stellt nach Änderung und Löschung Byte für Byte wieder her und legt den alten Stand beiseite", { timeout: 300_000 }, async () => {
    const basis = await mkdtemp(join(tmpdir(), "lion-backup-echt-"));
    const pfade = { appDaten: join(basis, "daten"), appZustand: join(basis, "zustand"), arbeit: join(basis, "arbeit") };
    const repo = join(basis, "usb");
    const app = join(pfade.appDaten, "nextcloud");
    await mkdir(join(app, "unterordner"), { recursive: true });
    await mkdir(join(pfade.appZustand, "nextcloud"), { recursive: true });
    await mkdir(repo);

    const gross = randomBytes(2 * 1024 * 1024);
    await writeFile(join(app, "notiz.txt"), "Originaltext");
    await writeFile(join(app, "unterordner", "gross.bin"), gross);
    await writeFile(join(pfade.appZustand, "nextcloud", ".env"), "GEHEIM=123\n", { mode: 0o600 });
    // Datei ohne Leserechte: nur mit DAC_READ_SEARCH im Container lesbar.
    await writeFile(join(app, "gesperrt.db"), "nur root darf lesen");
    await chmod(join(app, "gesperrt.db"), 0o000);

    const db = oeffneDatenbank(":memory:");
    const backup = new BackupVerwaltung({ db, restic: new DockerRestic(), apps: keineApps, pfade, pruefeZiel: async (p) => p });

    const { schluesselNeu } = await backup.einrichten({ ziel: repo, zeit: "03:00" }, "test");
    expect(schluesselNeu).toBeTruthy();
    expect(await readdir(repo)).toEqual(expect.arrayContaining(["config", "data", "keys", "snapshots"]));

    backup.sichern("test");
    await backup.warte();
    expect(backup.status().letzter).toMatchObject({ status: "erfolg" });
    const sicherungen = await backup.sicherungen();
    expect(sicherungen).toHaveLength(1);

    // Schaden anrichten: ändern, löschen, Neues hinzufügen.
    await writeFile(join(app, "notiz.txt"), "kaputt");
    await writeFile(join(app, "unterordner", "gross.bin"), "");
    await writeFile(join(app, "neu.txt"), "nach dem Backup entstanden");

    backup.wiederherstellen({ sicherung: sicherungen[0]!.kurz, app: "nextcloud", bestaetigung: "nextcloud" }, "test");
    await backup.warte();
    expect(backup.letzteWiederherstellung()).toMatchObject({ status: "erfolg" });

    expect(await readFile(join(app, "notiz.txt"), "utf8")).toBe("Originaltext");
    expect(hash(await readFile(join(app, "unterordner", "gross.bin")))).toBe(hash(gross));
    expect((await stat(join(app, "gesperrt.db"))).size).toBe("nur root darf lesen".length);
    expect(await readdir(app)).not.toContain("neu.txt");

    const beiseite = (await readdir(pfade.appDaten)).find((n) => n.startsWith(".nextcloud.vor-wiederherstellung-"))!;
    expect(await readFile(join(pfade.appDaten, beiseite, "neu.txt"), "utf8")).toBe("nach dem Backup entstanden");

    // Eine App, die nicht im Backup ist: Fehler, nichts wird angelegt.
    backup.wiederherstellen({ sicherung: sicherungen[0]!.kurz, app: "vaultwarden", bestaetigung: "vaultwarden" }, "test");
    await backup.warte();
    expect(backup.letzteWiederherstellung()).toMatchObject({ status: "fehler", meldung: expect.stringContaining("keine Daten") });
    expect(await readdir(pfade.appDaten)).not.toContain("vaultwarden");

    // Zweite Box mit anderem Schlüssel darf das Backup nicht übernehmen.
    const fremd = new BackupVerwaltung({
      db: oeffneDatenbank(":memory:"),
      restic: new DockerRestic(),
      apps: keineApps,
      pfade: { ...pfade, arbeit: join(basis, "arbeit-fremd") },
      pruefeZiel: async (p) => p,
    });
    await expect(fremd.einrichten({ ziel: repo, zeit: "03:00" }, "test")).rejects.toMatchObject({ code: 409 });
  });
});
