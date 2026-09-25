import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { protokolliere } from "../audit.js";
import type { Datenbank } from "../datenbank.js";
import { AUFBEWAHRUNG, erzeugeSchluessel, faellig, naechsterLauf, ZEIT } from "./plan.js";
import { falscherSchluessel, keinRepository, type Mount, ResticFehler, type ResticLaeufer, type Sicherung, werteSicherungenAus, werteZusammenfassungAus } from "./restic.js";
import { ZielFehler } from "./ziel.js";

export class BackupFehler extends Error {
  constructor(
    message: string,
    readonly code: 400 | 404 | 409,
  ) {
    super(message);
  }
}

/** Was das Backup von der App-Verwaltung braucht (in Tests nachgebildet). */
export interface AppsFuerBackup {
  laufendeApps(): string[];
  anhalten(id: string): Promise<void>;
  fortsetzen(id: string): Promise<void>;
}

export type BackupOptionen = {
  db: Datenbank;
  restic: ResticLaeufer;
  apps: AppsFuerBackup;
  pfade: {
    appDaten: string; // /srv/lion/apps
    appZustand: string; // /var/lib/lion/apps
    arbeit: string; // /var/lib/lion/backup (Schlüssel, Datenbank-Abzug)
  };
  pruefeZiel: (pfad: string) => Promise<string>;
  /** Vor jedem Zugriff aufs Ziel: z. B. eine USB-Platte nach einem Neustart wieder einhängen (lion-helper). */
  zielBereitstellen?: (ziel: string) => Promise<void>;
  jetzt?: () => Date;
};

export type Lauf = {
  id: number;
  art: "sicherung" | "wiederherstellung";
  start: string;
  ende: string | null;
  status: "laeuft" | "erfolg" | "fehler";
  meldung: string | null;
  sicherung: string | null;
  bytesNeu: number | null;
  app: string | null;
};

export type BackupStatus = {
  eingerichtet: boolean;
  ziel: string | null;
  zeit: string;
  aktiv: boolean;
  laeuft: Lauf["art"] | null;
  letzter: Lauf | null;
  letzterErfolg: Lauf | null;
  letzteWiederherstellung: Lauf | null;
  naechster: string | null;
};

export type Hinweis = { bereich: "backup"; stufe: "gelb" | "rot"; text: string };

// Pfade im Container – fest, damit Wiederherstellen genau weiß, wo was liegt.
const C = { repo: "/repo", daten: "/daten", apps: "/daten/apps", zustand: "/daten/lion/apps", db: "/daten/lion/datenbank", schluessel: "/run/lion/schluessel" };

const APP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SICHERUNG_ID = /^[0-9a-f]{8,64}$/;
const STUNDE = 60 * 60 * 1000;

/** Leer? Ohne Leserecht (z. B. root-eigener Ordner aus dem Backup) gilt er als befüllt. */
async function istLeer(ordner: string): Promise<boolean> {
  try {
    return (await readdir(ordner)).length === 0;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EACCES") return false;
    throw e;
  }
}

export class BackupVerwaltung {
  private laufend: Lauf["art"] | null = null;
  private aufgabe: Promise<void> | null = null;

  constructor(private readonly o: BackupOptionen) {}

  private jetzt() {
    return this.o.jetzt?.() ?? new Date();
  }

  // ---- Einstellungen -------------------------------------------------------
  private lies(schluessel: string): string | null {
    const z = this.o.db.prepare("SELECT wert FROM einstellungen WHERE schluessel = ?").get(schluessel) as { wert: string } | undefined;
    return z?.wert ?? null;
  }

  private schreib(schluessel: string, wert: string) {
    this.o.db
      .prepare("INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert")
      .run(schluessel, wert);
  }

  private get ziel() {
    return this.lies("backup.ziel");
  }
  private get zeit() {
    return this.lies("backup.zeit") ?? "03:00";
  }
  private get aktiv() {
    return this.lies("backup.aktiv") !== "nein";
  }

  private get schluesselDatei() {
    return join(this.o.pfade.arbeit, "schluessel");
  }

  private async schluesselLesen(): Promise<string | null> {
    return (await readFile(this.schluesselDatei, "utf8").catch(() => null))?.trim() || null;
  }

  // ---- Läufe ---------------------------------------------------------------
  private starteLauf(art: Lauf["art"], app: string | null = null): number {
    const info = this.o.db
      .prepare("INSERT INTO backup_laeufe (art, start, status, app) VALUES (?, ?, 'laeuft', ?)")
      .run(art, this.jetzt().toISOString(), app);
    return Number(info.lastInsertRowid);
  }

  private beendeLauf(id: number, status: "erfolg" | "fehler", werte: { meldung?: string | null; sicherung?: string | null; bytesNeu?: number | null } = {}) {
    this.o.db
      .prepare("UPDATE backup_laeufe SET ende = ?, status = ?, meldung = ?, sicherung = ?, bytes_neu = ? WHERE id = ?")
      .run(this.jetzt().toISOString(), status, werte.meldung ?? null, werte.sicherung ?? null, werte.bytesNeu ?? null, id);
  }

  private lauf(where: string): Lauf | null {
    const z = this.o.db.prepare(`SELECT * FROM backup_laeufe WHERE ${where} ORDER BY id DESC LIMIT 1`).get() as
      | { id: number; art: Lauf["art"]; start: string; ende: string | null; status: Lauf["status"]; meldung: string | null; sicherung: string | null; bytes_neu: number | null; app: string | null }
      | undefined;
    if (!z) return null;
    return { id: z.id, art: z.art, start: z.start, ende: z.ende, status: z.status, meldung: z.meldung, sicherung: z.sicherung, bytesNeu: z.bytes_neu, app: z.app };
  }

  status(): BackupStatus {
    const letzter = this.lauf("art = 'sicherung' AND status != 'laeuft'");
    const eingerichtet = this.ziel !== null;
    const letzterStart = this.lauf("art = 'sicherung'");
    return {
      eingerichtet,
      ziel: this.ziel,
      zeit: this.zeit,
      aktiv: this.aktiv,
      laeuft: this.laufend,
      letzter,
      letzterErfolg: this.lauf("art = 'sicherung' AND status = 'erfolg'"),
      letzteWiederherstellung: this.lauf("art = 'wiederherstellung' AND status != 'laeuft'"),
      naechster: eingerichtet && this.aktiv ? naechsterLauf(this.jetzt(), this.zeit, letzterStart ? new Date(letzterStart.start) : null).toISOString() : null,
    };
  }

  /** Für die Ampel: fehlendes, altes oder fehlgeschlagenes Backup ist ein Hinweis wert. */
  hinweis(): Hinweis | null {
    const s = this.status();
    if (!s.eingerichtet) return { bereich: "backup", stufe: "gelb", text: "Noch kein Backup eingerichtet. Ohne Backup gehen Daten bei einem Festplattenschaden verloren." };
    if (s.letzter?.status === "fehler") return { bereich: "backup", stufe: "rot", text: `Das letzte Backup ist fehlgeschlagen: ${s.letzter.meldung ?? "unbekannter Fehler"}` };
    if (!s.aktiv) return null;
    const erfolg = s.letzterErfolg ? new Date(s.letzterErfolg.start).getTime() : null;
    const alter = erfolg === null ? Infinity : this.jetzt().getTime() - erfolg;
    if (alter > 7 * 24 * STUNDE) return { bereich: "backup", stufe: "rot", text: erfolg === null ? "Es gibt noch kein erfolgreiches Backup." : "Das letzte erfolgreiche Backup ist über eine Woche alt." };
    if (alter > 48 * STUNDE) return { bereich: "backup", stufe: "gelb", text: "Das letzte erfolgreiche Backup ist älter als zwei Tage." };
    return null;
  }

  // ---- restic --------------------------------------------------------------
  private repoMounts(ziel: string): Mount[] {
    return [
      { quelle: ziel, ziel: C.repo, nurLesen: false },
      { quelle: this.schluesselDatei, ziel: C.schluessel, nurLesen: true },
    ];
  }

  private resticBasis(): string[] {
    return ["--repo", C.repo, "--password-file", C.schluessel];
  }

  // ---- Einrichten ------------------------------------------------------------
  /** Richtet das Ziel ein. Liefert den Schlüssel nur, wenn er neu erzeugt wurde – er muss dann notiert werden. */
  async einrichten(eingabe: { ziel: string; zeit: string }, benutzer: string): Promise<{ schluesselNeu: string | null }> {
    if (!ZEIT.test(eingabe.zeit)) throw new BackupFehler("Bitte eine Uhrzeit im Format HH:MM angeben.", 400);
    if (this.laufend) throw new BackupFehler("Gerade läuft ein Backup. Bitte warten.", 409);
    let ziel: string;
    try {
      ziel = await this.o.pruefeZiel(eingabe.ziel);
    } catch (e) {
      throw new BackupFehler(e instanceof ZielFehler || e instanceof Error ? e.message : "Ungültiges Ziel.", 400);
    }

    await mkdir(this.o.pfade.arbeit, { recursive: true, mode: 0o700 });
    let schluesselNeu: string | null = null;
    if (!(await this.schluesselLesen())) {
      schluesselNeu = erzeugeSchluessel();
      await writeFile(this.schluesselDatei, `${schluesselNeu}\n`, { mode: 0o600 });
    }

    try {
      await this.o.restic.restic([...this.resticBasis(), "cat", "config"], this.repoMounts(ziel), "lesen");
    } catch (e) {
      const meldung = e instanceof ResticFehler ? e.ausgabe : String(e);
      if (falscherSchluessel(meldung)) {
        protokolliere(this.o.db, { benutzer, aktion: "backup.einrichten", ziel, ergebnis: "fehler", details: "anderer Schlüssel" });
        throw new BackupFehler("Am Ziel liegt schon ein Backup mit einem anderen Schlüssel. Bitte einen leeren Ordner wählen.", 409);
      }
      if (!keinRepository(meldung)) throw new BackupFehler(`Ziel nicht nutzbar: ${e instanceof Error ? e.message : meldung}`, 400);
      await this.o.restic.restic([...this.resticBasis(), "init"], this.repoMounts(ziel), "lesen");
    }

    this.schreib("backup.ziel", ziel);
    this.schreib("backup.zeit", eingabe.zeit);
    this.schreib("backup.aktiv", "ja");
    protokolliere(this.o.db, { benutzer, aktion: "backup.einrichten", ziel, ergebnis: "erfolg", details: `täglich ${eingabe.zeit}` });
    return { schluesselNeu };
  }

  planAendern(eingabe: { zeit: string; aktiv: boolean }, benutzer: string) {
    if (!this.ziel) throw new BackupFehler("Bitte zuerst ein Backup-Ziel einrichten.", 409);
    if (!ZEIT.test(eingabe.zeit)) throw new BackupFehler("Bitte eine Uhrzeit im Format HH:MM angeben.", 400);
    this.schreib("backup.zeit", eingabe.zeit);
    this.schreib("backup.aktiv", eingabe.aktiv ? "ja" : "nein");
    protokolliere(this.o.db, { benutzer, aktion: "backup.plan", ergebnis: "erfolg", details: eingabe.aktiv ? `täglich ${eingabe.zeit}` : "ausgeschaltet" });
    return this.status();
  }

  async schluessel(): Promise<string> {
    const s = await this.schluesselLesen();
    if (!s) throw new BackupFehler("Es gibt noch keinen Schlüssel.", 404);
    return s;
  }

  // ---- Sichern ---------------------------------------------------------------
  private starteAufgabe(art: Lauf["art"], arbeit: () => Promise<void>) {
    if (this.laufend) throw new BackupFehler(this.laufend === "sicherung" ? "Es läuft bereits eine Sicherung." : "Es läuft gerade eine Wiederherstellung.", 409);
    this.laufend = art;
    this.aufgabe = arbeit().finally(() => {
      this.laufend = null;
    });
  }

  /** Für Tests und geordnetes Herunterfahren. */
  async warte() {
    await this.aufgabe;
  }

  sichern(benutzer: string) {
    const ziel = this.ziel;
    if (!ziel) throw new BackupFehler("Bitte zuerst ein Backup-Ziel einrichten.", 409);
    this.starteAufgabe("sicherung", async () => {
      const lauf = this.starteLauf("sicherung");
      const angehalten: string[] = [];
      try {
        await this.o.zielBereitstellen?.(ziel);
        // Konsistenter Abzug der eigenen Datenbank (SQLite ist geöffnet).
        const dbOrdner = join(this.o.pfade.arbeit, "datenbank");
        await mkdir(dbOrdner, { recursive: true, mode: 0o700 });
        const abzug = join(dbOrdner, "lion.db");
        await rm(abzug, { force: true });
        this.o.db.exec(`VACUUM INTO '${abzug.replaceAll("'", "''")}'`);

        // Apps kurz anhalten, damit Datenbanken in den Apps (z. B. Nextcloud) konsistent gesichert werden.
        for (const id of this.o.apps.laufendeApps()) {
          await this.o.apps.anhalten(id);
          angehalten.push(id);
        }
        const ausgabe = await this.o.restic.restic(
          [...this.resticBasis(), "backup", C.daten, "--json", "--host", "lion", "--tag", "lion"],
          [
            ...this.repoMounts(ziel),
            { quelle: this.o.pfade.appDaten, ziel: C.apps, nurLesen: true },
            { quelle: this.o.pfade.appZustand, ziel: C.zustand, nurLesen: true },
            { quelle: dbOrdner, ziel: C.db, nurLesen: true },
          ],
          "lesen",
        );
        const z = werteZusammenfassungAus(ausgabe);
        await this.fortsetzen(angehalten);
        // Aufräumen nach Plan; ein Fehler hier macht die Sicherung selbst nicht ungültig.
        await this.o.restic.restic([...this.resticBasis(), "forget", "--tag", "lion", ...AUFBEWAHRUNG, "--prune"], this.repoMounts(ziel), "lesen").catch(() => undefined);
        this.beendeLauf(lauf, "erfolg", { sicherung: z.sicherung, bytesNeu: z.bytesNeu });
        protokolliere(this.o.db, { benutzer, aktion: "backup.sichern", ergebnis: "erfolg", details: `${z.dateienNeu} neue Dateien, ${z.bytesNeu} Bytes` });
      } catch (e) {
        await this.fortsetzen(angehalten);
        const meldung = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        this.beendeLauf(lauf, "fehler", { meldung });
        protokolliere(this.o.db, { benutzer, aktion: "backup.sichern", ergebnis: "fehler", details: meldung });
      }
    });
  }

  /** Startet angehaltene Apps wieder – jede einzeln, damit eine kaputte App die anderen nicht aufhält. */
  private async fortsetzen(ids: string[]) {
    for (const id of ids.splice(0)) await this.o.apps.fortsetzen(id).catch(() => undefined);
  }

  /** Vom Zeitgeber jede Minute aufgerufen. */
  zeitplanPruefen() {
    if (!this.ziel || !this.aktiv || this.laufend) return;
    const letzter = this.lauf("art = 'sicherung'");
    if (faellig(this.jetzt(), this.zeit, letzter ? new Date(letzter.start) : null)) this.sichern("Zeitplan");
  }

  async sicherungen(): Promise<Sicherung[]> {
    const ziel = this.ziel;
    if (!ziel) return [];
    await this.o.zielBereitstellen?.(ziel);
    const json = await this.o.restic.restic([...this.resticBasis(), "snapshots", "--json", "--tag", "lion"], this.repoMounts(ziel), "lesen");
    return werteSicherungenAus(json);
  }

  // ---- Wiederherstellen --------------------------------------------------------
  /**
   * Stellt die Daten einer App aus einer Sicherung wieder her. Nichts wird gelöscht: Die aktuellen Daten
   * werden zur Seite gelegt (…/.<app>.vor-wiederherstellung-<zeit>). Ist im Backup nichts, wird zurückgerollt.
   */
  wiederherstellen(eingabe: { sicherung: string; app: string; bestaetigung: unknown }, benutzer: string) {
    const ziel = this.ziel;
    if (!ziel) throw new BackupFehler("Bitte zuerst ein Backup-Ziel einrichten.", 409);
    if (!SICHERUNG_ID.test(eingabe.sicherung)) throw new BackupFehler("Unbekannte Sicherung.", 400);
    if (!APP_ID.test(eingabe.app)) throw new BackupFehler("Unbekannte App.", 400);
    if (eingabe.bestaetigung !== eingabe.app) throw new BackupFehler(`Zum Wiederherstellen bitte „${eingabe.app}“ als Bestätigung angeben.`, 400);
    const { app, sicherung } = eingabe;

    this.starteAufgabe("wiederherstellung", async () => {
      const lauf = this.starteLauf("wiederherstellung", app);
      const daten = join(this.o.pfade.appDaten, app);
      const beiseite = join(this.o.pfade.appDaten, `.${app}.vor-wiederherstellung-${this.jetzt().toISOString().replace(/[:.]/g, "-")}`);
      let verschoben = false;
      let angelegt = false;
      const lief = this.o.apps.laufendeApps().includes(app);
      try {
        await this.o.zielBereitstellen?.(ziel);
        if (lief) await this.o.apps.anhalten(app);
        try {
          await rename(daten, beiseite);
          verschoben = true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        await mkdir(daten, { recursive: true, mode: 0o750 });
        angelegt = true;
        await this.o.restic.restic(
          [...this.resticBasis(), "restore", sicherung, "--target", "/wiederherstellung", "--include", `${C.apps}/${app}`],
          [...this.repoMounts(ziel), { quelle: daten, ziel: `/wiederherstellung${C.apps}/${app}`, nurLesen: false }],
          "schreiben",
          // Übergeordnete Ordner liegen im Speicher, damit restic dort Rechte setzen darf (Container ist schreibgeschützt).
          ["/wiederherstellung"],
        );
        if (await istLeer(daten)) throw new BackupFehler(`In dieser Sicherung gibt es keine Daten für „${app}“.`, 404);
        this.beendeLauf(lauf, "erfolg", { sicherung });
        protokolliere(this.o.db, {
          benutzer,
          aktion: "backup.wiederherstellen",
          ziel: app,
          ergebnis: "erfolg",
          details: `sicherung=${sicherung}${verschoben ? `, vorherige Daten: ${beiseite}` : ""}`,
        });
      } catch (e) {
        // Zurückrollen: Was jetzt im Datenordner liegt (leer oder unvollständig), kommt zur Seite,
        // die vorherigen Daten zurück an ihren Platz. Ein leerer Rest wird entfernt.
        // Nur wenn wir den Ordner selbst neu angelegt haben – sonst sind es noch die Originaldaten.
        if (angelegt) {
          const rest = join(this.o.pfade.appDaten, `.${app}.fehlgeschlagen-${this.jetzt().toISOString().replace(/[:.]/g, "-")}`);
          await rename(daten, rest).catch(() => undefined);
          if (verschoben) await rename(beiseite, daten).catch(() => undefined);
          await rmdir(rest).catch(() => undefined);
        } else if (verschoben) {
          await rename(beiseite, daten).catch(() => undefined);
        }
        const meldung = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        this.beendeLauf(lauf, "fehler", { meldung, sicherung });
        protokolliere(this.o.db, { benutzer, aktion: "backup.wiederherstellen", ziel: app, ergebnis: "fehler", details: meldung });
      } finally {
        if (lief) await this.o.apps.fortsetzen(app).catch(() => undefined);
      }
    });
  }

  letzteWiederherstellung(): Lauf | null {
    return this.lauf("art = 'wiederherstellung'");
  }
}
