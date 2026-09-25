import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { letzteEintraege } from "../src/audit.js";
import { BackupVerwaltung } from "../src/backup/backup.js";
import { type Mount, ResticFehler, type Rechte } from "../src/backup/restic.js";
import { oeffneDatenbank } from "../src/datenbank.js";
import { baueServer } from "../src/server.js";
import { BEISPIEL_STATUS, csrf, einrichten, PASSWORT } from "./helfer.js";

type Aufruf = { args: string[]; mounts: Mount[]; rechte: Rechte; tmpfs?: string[] };

/** Nachgebildetes restic: merkt sich Aufrufe, kann Fehler werfen und „stellt wieder her“, indem es eine Datei schreibt. */
class FakeRestic {
  aufrufe: Aufruf[] = [];
  repoDa = false;
  fehlerBei: string | null = null;
  fehlerText = "Fatal: etwas ging schief";
  wiederherstellenSchreibt = true;

  async restic(args: string[], mounts: Mount[], rechte: Rechte, tmpfs?: string[]) {
    this.aufrufe.push({ args, mounts, rechte, tmpfs });
    const befehl = args.find((a) => ["cat", "init", "backup", "forget", "snapshots", "restore"].includes(a)) ?? "";
    if (this.fehlerBei === befehl) throw new ResticFehler(this.fehlerText, this.fehlerText);
    if (befehl === "cat") {
      if (!this.repoDa) throw new ResticFehler("kein Repo", "Fatal: unable to open config file\nIs there a repository at the following location?");
      return "{}";
    }
    if (befehl === "init") this.repoDa = true;
    if (befehl === "backup") return '{"message_type":"summary","files_new":2,"data_added":4096,"snapshot_id":"abcdef1234"}\n';
    if (befehl === "snapshots") return JSON.stringify([{ id: "abcdef1234".padEnd(64, "0"), short_id: "abcdef12", time: "2026-09-25T03:00:00Z", paths: ["/daten"] }]);
    if (befehl === "restore" && this.wiederherstellenSchreibt) {
      const ziel = mounts.find((m) => m.ziel.startsWith("/wiederherstellung"))!;
      await writeFile(join(ziel.quelle, "wiederhergestellt.txt"), "aus dem Backup");
    }
    return "";
  }

  befehle() {
    return this.aufrufe.map((a) => a.args.find((x) => ["cat", "init", "backup", "forget", "snapshots", "restore"].includes(x)));
  }
}

class FakeApps {
  laufend = ["nextcloud", "uptime-kuma"];
  protokoll: string[] = [];
  laufendeApps() {
    return [...this.laufend];
  }
  async anhalten(id: string) {
    this.protokoll.push(`anhalten ${id}`);
  }
  async fortsetzen(id: string) {
    this.protokoll.push(`fortsetzen ${id}`);
  }
}

async function aufbau(jetzt = new Date("2026-09-25T10:00:00")) {
  const basis = await mkdtemp(join(tmpdir(), "lion-backup-"));
  const pfade = { appDaten: join(basis, "daten"), appZustand: join(basis, "zustand"), arbeit: join(basis, "arbeit") };
  await mkdir(join(pfade.appDaten, "nextcloud"), { recursive: true });
  await writeFile(join(pfade.appDaten, "nextcloud", "original.txt"), "aktuelle Daten");
  await mkdir(pfade.appZustand, { recursive: true });
  const db = oeffneDatenbank(":memory:");
  const restic = new FakeRestic();
  const apps = new FakeApps();
  const uhr = { jetzt };
  const backup = new BackupVerwaltung({
    db,
    restic,
    apps,
    pfade,
    pruefeZiel: async (p) => {
      if (!p.startsWith("/mnt/")) throw new Error("Backups sind nur in Unterordnern von /mnt erlaubt.");
      return p;
    },
    jetzt: () => uhr.jetzt,
  });
  return { basis, pfade, db, restic, apps, backup, uhr };
}

describe("Einrichten", () => {
  it("legt Schlüssel (600) und neues Repository an und liefert den Schlüssel genau einmal", async () => {
    const { backup, restic, pfade } = await aufbau();
    const erst = await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    expect(erst.schluesselNeu).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(restic.befehle()).toEqual(["cat", "init"]);
    expect((await stat(join(pfade.arbeit, "schluessel"))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(pfade.arbeit, "schluessel"), "utf8")).trim()).toBe(erst.schluesselNeu);
    expect(backup.status()).toMatchObject({ eingerichtet: true, ziel: "/mnt/usb", zeit: "03:00", aktiv: true });

    const zweit = await backup.einrichten({ ziel: "/mnt/usb", zeit: "04:30" }, "admin");
    expect(zweit.schluesselNeu).toBeNull();
    expect(restic.befehle().slice(2)).toEqual(["cat"]);
  });

  it("verweigert ein Ziel mit fremdem Schlüssel", async () => {
    const { backup, restic, db } = await aufbau();
    restic.fehlerBei = "cat";
    restic.fehlerText = "Fatal: wrong password or no key found";
    await expect(backup.einrichten({ ziel: "/mnt/fremd", zeit: "03:00" }, "admin")).rejects.toMatchObject({ code: 409 });
    expect(backup.status().eingerichtet).toBe(false);
    expect(letzteEintraege(db)[0]).toMatchObject({ aktion: "backup.einrichten", ergebnis: "fehler" });
  });

  it("prüft Uhrzeit und Ziel", async () => {
    const { backup } = await aufbau();
    await expect(backup.einrichten({ ziel: "/mnt/usb", zeit: "25:00" }, "admin")).rejects.toMatchObject({ code: 400 });
    await expect(backup.einrichten({ ziel: "/etc", zeit: "03:00" }, "admin")).rejects.toThrow(/nur in Unterordnern/);
  });
});

describe("Sichern", () => {
  it("hält laufende Apps an, sichert Daten, Zustand und Datenbank-Abzug, startet Apps wieder und räumt auf", async () => {
    const { backup, restic, apps, pfade, db } = await aufbau();
    await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    backup.sichern("admin");
    expect(backup.status().laeuft).toBe("sicherung");
    await backup.warte();

    expect(apps.protokoll).toEqual(["anhalten nextcloud", "anhalten uptime-kuma", "fortsetzen nextcloud", "fortsetzen uptime-kuma"]);
    const sicherung = restic.aufrufe.find((a) => a.args.includes("backup"))!;
    expect(sicherung.rechte).toBe("lesen");
    expect(sicherung.mounts).toEqual(
      expect.arrayContaining([
        { quelle: pfade.appDaten, ziel: "/daten/apps", nurLesen: true },
        { quelle: pfade.appZustand, ziel: "/daten/lion/apps", nurLesen: true },
        { quelle: join(pfade.arbeit, "datenbank"), ziel: "/daten/lion/datenbank", nurLesen: true },
        { quelle: "/mnt/usb", ziel: "/repo", nurLesen: false },
      ]),
    );
    expect(await readdir(join(pfade.arbeit, "datenbank"))).toContain("lion.db");
    expect(restic.befehle()).toContain("forget");
    const s = backup.status();
    expect(s.laeuft).toBeNull();
    expect(s.letzter).toMatchObject({ status: "erfolg", sicherung: "abcdef1234", bytesNeu: 4096 });
    expect(letzteEintraege(db)[0]).toMatchObject({ aktion: "backup.sichern", ergebnis: "erfolg" });
  });

  it("startet Apps auch dann wieder, wenn die Sicherung fehlschlägt, und meldet den Fehler", async () => {
    const { backup, restic, apps } = await aufbau();
    await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    restic.fehlerBei = "backup";
    backup.sichern("admin");
    await backup.warte();
    expect(apps.protokoll.filter((p) => p.startsWith("fortsetzen"))).toHaveLength(2);
    expect(backup.status().letzter).toMatchObject({ status: "fehler", meldung: expect.stringContaining("schief") });
    expect(backup.hinweis()).toMatchObject({ stufe: "rot", text: expect.stringContaining("fehlgeschlagen") });
  });

  it("nur eine Aktion gleichzeitig; ohne Ziel nicht möglich", async () => {
    const { backup } = await aufbau();
    expect(() => backup.sichern("admin")).toThrow(/zuerst ein Backup-Ziel/);
    await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    backup.sichern("admin");
    expect(() => backup.sichern("admin")).toThrow(/bereits eine Sicherung/);
    await backup.warte();
  });

  it("Zeitplan: sichert einmal pro Tag ab der Uhrzeit, nicht wenn ausgeschaltet", async () => {
    const { backup, restic, uhr } = await aufbau(new Date("2026-09-25T02:00:00"));
    await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    const anzahl = () => restic.befehle().filter((b) => b === "backup").length;
    backup.zeitplanPruefen();
    expect(anzahl()).toBe(0);
    uhr.jetzt = new Date("2026-09-25T03:01:00");
    backup.zeitplanPruefen();
    await backup.warte();
    backup.zeitplanPruefen();
    await backup.warte();
    expect(anzahl()).toBe(1);
    uhr.jetzt = new Date("2026-09-26T03:05:00");
    backup.planAendern({ zeit: "03:00", aktiv: false }, "admin");
    backup.zeitplanPruefen();
    expect(anzahl()).toBe(1);
  });
});

describe("Ampel-Hinweis", () => {
  it("gelb ohne Backup, keiner nach frischem Erfolg, gelb nach 2 Tagen, rot nach einer Woche", async () => {
    const { backup, uhr } = await aufbau();
    expect(backup.hinweis()).toMatchObject({ stufe: "gelb", text: expect.stringContaining("Noch kein Backup") });
    await backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    expect(backup.hinweis()).toMatchObject({ stufe: "rot", text: expect.stringContaining("noch kein erfolgreiches") });
    backup.sichern("admin");
    await backup.warte();
    expect(backup.hinweis()).toBeNull();
    uhr.jetzt = new Date("2026-09-28T10:00:00");
    expect(backup.hinweis()).toMatchObject({ stufe: "gelb" });
    uhr.jetzt = new Date("2026-10-03T10:00:00");
    expect(backup.hinweis()).toMatchObject({ stufe: "rot" });
    backup.planAendern({ zeit: "03:00", aktiv: false }, "admin");
    expect(backup.hinweis()).toBeNull();
  });
});

describe("Wiederherstellen", () => {
  async function eingerichtet() {
    const a = await aufbau();
    await a.backup.einrichten({ ziel: "/mnt/usb", zeit: "03:00" }, "admin");
    return a;
  }

  it("legt aktuelle Daten beiseite, stellt nur diese App wieder her und startet sie neu", async () => {
    const { backup, restic, apps, pfade, db } = await eingerichtet();
    backup.wiederherstellen({ sicherung: "abcdef12", app: "nextcloud", bestaetigung: "nextcloud" }, "admin");
    await backup.warte();

    expect(await readFile(join(pfade.appDaten, "nextcloud", "wiederhergestellt.txt"), "utf8")).toBe("aus dem Backup");
    const beiseite = (await readdir(pfade.appDaten)).find((n) => n.startsWith(".nextcloud.vor-wiederherstellung-"))!;
    expect(await readFile(join(pfade.appDaten, beiseite, "original.txt"), "utf8")).toBe("aktuelle Daten");

    const aufruf = restic.aufrufe.find((a) => a.args.includes("restore"))!;
    expect(aufruf.args).toEqual(expect.arrayContaining(["restore", "abcdef12", "--target", "/wiederherstellung", "--include", "/daten/apps/nextcloud"]));
    expect(aufruf.rechte).toBe("schreiben");
    expect(aufruf.tmpfs).toEqual(["/wiederherstellung"]);
    expect(aufruf.mounts).toContainEqual({ quelle: join(pfade.appDaten, "nextcloud"), ziel: "/wiederherstellung/daten/apps/nextcloud", nurLesen: false });
    expect(apps.protokoll).toEqual(["anhalten nextcloud", "fortsetzen nextcloud"]);
    expect(backup.letzteWiederherstellung()).toMatchObject({ status: "erfolg", app: "nextcloud" });
    expect(letzteEintraege(db)[0]).toMatchObject({ aktion: "backup.wiederherstellen", ergebnis: "erfolg", details: expect.stringContaining("vorherige Daten") });
  });

  it("rollt zurück, wenn die Sicherung keine Daten für die App enthält", async () => {
    const { backup, restic, pfade } = await eingerichtet();
    restic.wiederherstellenSchreibt = false;
    backup.wiederherstellen({ sicherung: "abcdef12", app: "nextcloud", bestaetigung: "nextcloud" }, "admin");
    await backup.warte();
    expect(await readFile(join(pfade.appDaten, "nextcloud", "original.txt"), "utf8")).toBe("aktuelle Daten");
    expect((await readdir(pfade.appDaten)).filter((n) => n.startsWith("."))).toEqual([]);
    expect(backup.letzteWiederherstellung()).toMatchObject({ status: "fehler", meldung: expect.stringContaining("keine Daten") });
  });

  it("rollt zurück, wenn restic fehlschlägt – Originaldaten bleiben unangetastet", async () => {
    const { backup, restic, pfade, apps } = await eingerichtet();
    restic.fehlerBei = "restore";
    backup.wiederherstellen({ sicherung: "abcdef12", app: "nextcloud", bestaetigung: "nextcloud" }, "admin");
    await backup.warte();
    expect(await readFile(join(pfade.appDaten, "nextcloud", "original.txt"), "utf8")).toBe("aktuelle Daten");
    expect(apps.protokoll).toContain("fortsetzen nextcloud");
  });

  it("prüft Bestätigung, App-ID und Sicherungs-ID streng", async () => {
    const { backup } = await eingerichtet();
    const w = (e: { sicherung: string; app: string; bestaetigung: unknown }) => () => backup.wiederherstellen(e, "admin");
    expect(w({ sicherung: "abcdef12", app: "nextcloud", bestaetigung: "falsch" })).toThrow(/Bestätigung/);
    expect(w({ sicherung: "abcdef12", app: "../etc", bestaetigung: "../etc" })).toThrow(/Unbekannte App/);
    expect(w({ sicherung: "latest; rm", app: "nextcloud", bestaetigung: "nextcloud" })).toThrow(/Unbekannte Sicherung/);
  });
});

describe("API", () => {
  async function server() {
    const a = await aufbau();
    const app = baueServer({ db: a.db, version: "test", status: async () => BEISPIEL_STATUS, sichereCookies: false, backup: a.backup });
    const { cookie } = await einrichten(app);
    return { ...a, app, cookie };
  }

  it("Einrichten, Status, Sichern und Liste über die API; Hinweis landet in der Ampel", async () => {
    const { app, cookie, backup } = await server();
    const sys = (await app.inject({ url: "/api/system", headers: { cookie } })).json();
    expect(sys.ampel).toBe("gelb");
    expect(sys.hinweise.at(-1)).toMatchObject({ bereich: "backup" });

    const e = await app.inject({ method: "POST", url: "/api/backup/einrichten", headers: { ...csrf, cookie }, payload: { ziel: "/mnt/usb", zeit: "03:00" } });
    expect(e.statusCode).toBe(200);
    expect(e.json().schluesselNeu).toBeTruthy();
    expect((await app.inject({ method: "POST", url: "/api/backup/jetzt", headers: { ...csrf, cookie } })).statusCode).toBe(202);
    await backup.warte();
    expect((await app.inject({ url: "/api/backup", headers: { cookie } })).json().letzter.status).toBe("erfolg");
    const liste = (await app.inject({ url: "/api/backup/sicherungen", headers: { cookie } })).json();
    expect(liste.sicherungen[0].kurz).toBe("abcdef12");
  });

  it("Fehler als verständliche Meldungen; Schlüssel nur mit richtigem Passwort", async () => {
    const { app, cookie } = await server();
    const falsch = await app.inject({ method: "POST", url: "/api/backup/einrichten", headers: { ...csrf, cookie }, payload: { ziel: "/etc", zeit: "03:00" } });
    expect(falsch.statusCode).toBe(400);
    expect(falsch.json().fehler).toMatch(/nur in Unterordnern/);

    await app.inject({ method: "POST", url: "/api/backup/einrichten", headers: { ...csrf, cookie }, payload: { ziel: "/mnt/usb", zeit: "03:00" } });
    const ohne = await app.inject({ method: "POST", url: "/api/backup/schluessel", headers: { ...csrf, cookie }, payload: { passwort: "falsch-falsch" } });
    expect(ohne.statusCode).toBe(403);
    const mit = await app.inject({ method: "POST", url: "/api/backup/schluessel", headers: { ...csrf, cookie }, payload: { passwort: PASSWORT } });
    expect(mit.json().schluessel).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  });

  it("alles nur angemeldet und mit CSRF-Kennung", async () => {
    const { app, cookie } = await server();
    expect((await app.inject({ url: "/api/backup" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/backup/jetzt", headers: { cookie } })).statusCode).toBe(403);
  });
});
