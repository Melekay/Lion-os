import type { Page, Route } from "@playwright/test";
import type { AppAnsicht, Datentraeger, AuditEintrag, BackupLauf, BackupStatus, Sicherung, SitzungsAnsicht, Systemstatus } from "../../lib/typen";

/**
 * Nachgebildetes lion-core im Browser: So lassen sich Zustände prüfen, die mit echtem Docker
 * schwer herzustellen sind (Installation läuft, Fehler, volle Platte …).
 */
export class Attrappe {
  eingerichtet = true;
  angemeldet = true;
  anfragen: { methode: string; pfad: string; csrf: string | undefined; body: unknown }[] = [];
  /** Wie oft /api/apps noch „installiere“ bzw. „entferne“ liefert, bevor die Aktion fertig ist. */
  schritte = 2;
  fehlerBeiAktion: string | null = null;

  system: Systemstatus = {
    cpuKerne: 4,
    last1: 0.6,
    ramGesamtMb: 16000,
    ramFreiMb: 12000,
    speicher: [{ pfad: "/", gesamtGb: 500, freiGb: 320 }],
    temperaturC: 48,
    laufzeitS: 3 * 86400 + 5 * 3600,
    netzwerk: { schnittstelle: "eth0", empfangenBytes: 1_000_000, gesendetBytes: 200_000 },
    ampel: "gruen",
    hinweise: [],
  };

  apps: AppAnsicht[] = [
    {
      id: "uptime-kuma",
      name: "Uptime Kuma",
      beschreibung: "Überwacht Websites und Dienste.",
      kategorie: "ueberwachung",
      version: "1.23.16",
      sicherheitsstufe: "normal",
      hinweise: ["Beim ersten Öffnen legst du ein eigenes Konto an."],
      installiert: null,
    },
    {
      id: "vaultwarden",
      name: "Vaultwarden",
      beschreibung: "Passwort-Manager.",
      kategorie: "sicherheit",
      version: "1.34.3",
      sicherheitsstufe: "sensibel",
      hinweise: [],
      installiert: null,
    },
    {
      id: "filebrowser",
      name: "Dateien",
      beschreibung: "Dateimanager für den Medienordner.",
      kategorie: "dateien",
      version: "2.63.23",
      sicherheitsstufe: "normal",
      medien: "schreiben",
      hinweise: [],
      installiert: null,
    },
    {
      id: "jellyfin",
      name: "Jellyfin",
      beschreibung: "Filme und Serien streamen.",
      kategorie: "medien",
      version: "10.11.11",
      sicherheitsstufe: "normal",
      medien: "lesen",
      logo: "/api/apps/jellyfin/logo",
      hinweise: [],
      installiert: null,
    },
  ];

  ressourcen: Record<string, { cpuProzent: number; ramMb: number }> = {};
  foto: Buffer | null = null;
  /** null = lion-helper läuft nicht (503) */
  datentraeger: Datentraeger[] | null = [
    { uuid: "ABCD-1234", name: "WD Elements", groesseBytes: 2_000_398_934_016, dateisystem: "ext4", geraet: "/dev/sda1", eingehaengt: null, backupOrdner: "/media/lion/ABCD-1234/lion-backup" },
  ];
  fotoVersion = 0;

  appProtokolle: Record<string, string[]> = {
    filebrowser: ["app-1  | 2026/09/25 10:00:00 User 'admin' initialized with randomly generated password: Xy7-geheim"],
  };

  protokoll: AuditEintrag[] = [
    { id: 2, zeit: "2026-09-25T10:00:00.000Z", benutzer: "admin", aktion: "anmeldung", ziel: null, ergebnis: "erfolg", details: "ip=192.168.1.5" },
    { id: 1, zeit: "2026-09-25T09:59:00.000Z", benutzer: "gast", aktion: "anmeldung", ziel: null, ergebnis: "abgelehnt", details: "ip=192.168.1.9" },
  ];

  boxName = "Lion OS";
  passwort = "richtiges-passwort";
  sitzungen: SitzungsAnsicht[] = [
    { id: 1, erstelltAm: "2026-09-25T09:00:00.000Z", laeuftAb: "2026-10-02T09:00:00.000Z", geraet: "Mozilla/5.0 (Windows NT 10.0) Firefox/140.0", ip: "192.168.1.5", aktuell: true },
    { id: 2, erstelltAm: "2026-09-24T18:00:00.000Z", laeuftAb: "2026-10-01T18:00:00.000Z", geraet: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", ip: "192.168.1.23", aktuell: false },
    { id: 3, erstelltAm: null, laeuftAb: "2026-10-01T18:00:00.000Z", geraet: null, ip: null, aktuell: false },
  ];

  backup: BackupStatus = {
    eingerichtet: false, ziel: null, zeit: "03:00", aktiv: true, laeuft: null,
    letzter: null, letzterErfolg: null, letzteWiederherstellung: null, naechster: null,
  };
  sicherungenListe: Sicherung[] = [];
  backupSchluessel = "ABCD-EFGH-JKLM-NPQR-STUV-WXYZ";
  private backupRest = 0;
  private backupApp: string | null = null;

  private backupWeiter() {
    if (!this.backup.laeuft || this.backupRest-- > 0) return;
    const jetzt = new Date().toISOString();
    const lauf = (art: BackupLauf["art"]): BackupLauf => ({ id: Date.now(), art, start: jetzt, ende: jetzt, status: "erfolg", meldung: null, sicherung: "abcdef12", bytesNeu: 13_000_000, app: this.backupApp });
    if (this.backup.laeuft === "sicherung") {
      this.backup.letzter = this.backup.letzterErfolg = lauf("sicherung");
      this.sicherungenListe = [{ id: "abcdef12".padEnd(64, "0"), kurz: "abcdef12", zeit: jetzt, pfade: ["/daten"] }, ...this.sicherungenListe];
    } else {
      this.backup.letzteWiederherstellung = lauf("wiederherstellung");
    }
    this.backup.laeuft = null;
  }

  private laufend = new Map<string, { ziel: "laeuft" | "weg"; rest: number }>();

  async verbinden(page: Page) {
    await page.route("**/api/**", (route) => this.antworten(route));
  }

  app(id: string) {
    const a = this.apps.find((x) => x.id === id);
    if (!a) throw new Error(`Unbekannte App ${id}`);
    return a;
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  }

  private weiterzaehlen() {
    for (const [id, l] of this.laufend) {
      if (l.rest-- > 0) continue;
      const a = this.app(id);
      if (l.ziel === "weg") a.installiert = null;
      else if (a.installiert) a.installiert.status = "laeuft";
      this.laufend.delete(id);
    }
  }

  private async antworten(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const pfad = url.pathname;
    const methode = req.method();
    const json = (req.headers()["content-type"] ?? "").includes("application/json");
    const body = json && req.postData() ? JSON.parse(req.postData() as string) : undefined;
    this.anfragen.push({ methode, pfad, csrf: req.headers()["x-lion-request"], body });

    if (methode !== "GET" && req.headers()["x-lion-request"] !== "1") return this.json(route, 403, { fehler: "CSRF" });
    if (pfad === "/api/setup/status") return this.json(route, 200, { eingerichtet: this.eingerichtet, codeNoetig: true });
    if (pfad === "/api/setup") {
      if (body?.code !== "ABCD-EFGH-JKLM") return this.json(route, 403, { fehler: "Einrichtungscode falsch. Du findest ihn am Ende der Installation." });
      this.eingerichtet = true;
      this.angemeldet = true;
      return this.json(route, 201, { name: body.name });
    }
    if (pfad === "/api/auth/login") {
      if (body?.passwort !== this.passwort) return this.json(route, 401, { fehler: "Name oder Passwort falsch." });
      this.angemeldet = true;
      return this.json(route, 200, { name: body.name });
    }
    if (!this.angemeldet) return this.json(route, 401, { fehler: "Bitte zuerst anmelden." });

    if (pfad === "/api/auth/logout") {
      this.angemeldet = false;
      return this.json(route, 200, { ok: true });
    }
    if (pfad === "/api/auth/me") return this.json(route, 200, { name: "emil" });
    if (pfad === "/api/system") {
      // Zähler wachsen bei jeder Abfrage – so entsteht ein Verlauf im Netzwerk-Widget.
      const n = this.system.netzwerk;
      if (n) this.system.netzwerk = { ...n, empfangenBytes: n.empfangenBytes + 250_000, gesendetBytes: n.gesendetBytes + 40_000 };
      return this.json(route, 200, this.system);
    }
    if (pfad === "/api/einstellungen" && methode === "GET") {
      return this.json(route, 200, { boxName: this.boxName, version: "0.1.0-dev", adressen: ["localhost", "box.local", "192.168.1.20"], hintergrundFoto: this.foto ? `/api/hintergrund?v=${this.fotoVersion}` : null });
    }
    if (pfad === "/api/einstellungen") {
      const name = String(body?.boxName ?? "").trim();
      if (!name || name.length > 40 || /[<>]/.test(name)) return this.json(route, 400, { fehler: "Erlaubt sind Buchstaben, Ziffern, Leerzeichen und - _ . '" });
      this.boxName = name;
      return this.json(route, 200, { boxName: name });
    }
    if (pfad === "/api/auth/passwort") {
      if (body?.altesPasswort !== this.passwort) return this.json(route, 403, { fehler: "Das bisherige Passwort stimmt nicht." });
      this.passwort = body.neuesPasswort;
      const abgemeldet = this.sitzungen.filter((s) => !s.aktuell).length;
      this.sitzungen = this.sitzungen.filter((s) => s.aktuell);
      return this.json(route, 200, { ok: true, abgemeldet });
    }
    if (pfad === "/api/auth/sitzungen") return this.json(route, 200, { sitzungen: this.sitzungen });
    if (pfad === "/api/auth/sitzungen/abmelden") {
      const vorher = this.sitzungen.length;
      this.sitzungen = this.sitzungen.filter((s) => s.aktuell || (body?.id !== undefined && s.id !== body.id));
      return this.json(route, 200, { ok: true, abgemeldet: vorher - this.sitzungen.length });
    }
    if (pfad === "/api/backup") {
      this.backupWeiter();
      return this.json(route, 200, this.backup);
    }
    if (pfad === "/api/backup/einrichten") {
      if (!/^\/(mnt|media)\//.test(String(body?.ziel ?? ""))) return this.json(route, 400, { fehler: "Backups sind nur in Unterordnern von /mnt oder /media erlaubt." });
      const neu = !this.backup.eingerichtet;
      this.backup = { ...this.backup, eingerichtet: true, ziel: body.ziel, zeit: body.zeit, naechster: new Date(Date.now() + 3_600_000).toISOString() };
      return this.json(route, 200, { schluesselNeu: neu ? this.backupSchluessel : null, status: this.backup });
    }
    if (pfad === "/api/backup/plan") {
      this.backup = { ...this.backup, zeit: body.zeit, aktiv: body.aktiv };
      return this.json(route, 200, this.backup);
    }
    if (pfad === "/api/backup/jetzt") {
      this.backup.laeuft = "sicherung";
      this.backupRest = this.schritte;
      return this.json(route, 202, { ok: true });
    }
    if (pfad === "/api/backup/sicherungen") return this.json(route, 200, { sicherungen: this.sicherungenListe });
    if (pfad === "/api/backup/wiederherstellen") {
      if (body?.bestaetigung !== body?.app) return this.json(route, 400, { fehler: "Bestätigung fehlt." });
      this.backup.laeuft = "wiederherstellung";
      this.backupApp = body.app;
      this.backupRest = this.schritte;
      return this.json(route, 202, { ok: true });
    }
    if (pfad === "/api/backup/schluessel") {
      if (body?.passwort !== this.passwort) return this.json(route, 403, { fehler: "Das Passwort stimmt nicht." });
      return this.json(route, 200, { schluessel: this.backupSchluessel });
    }
    if (pfad === "/api/audit") return this.json(route, 200, { eintraege: this.protokoll });
    if (pfad === "/api/apps") {
      this.weiterzaehlen();
      return this.json(route, 200, { apps: this.apps });
    }

    if (pfad === "/api/datentraeger") {
      return this.datentraeger ? this.json(route, 200, { datentraeger: this.datentraeger }) : this.json(route, 503, { fehler: "lion-helper läuft nicht." });
    }
    if (pfad === "/api/datentraeger/einhaengen" || pfad === "/api/datentraeger/aushaengen") {
      const d = this.datentraeger?.find((x) => x.uuid === body?.uuid);
      if (!d) return this.json(route, 409, { fehler: "Diesen Datenträger gibt es nicht (mehr)." });
      if (pfad.endsWith("aushaengen")) {
        d.eingehaengt = null;
        return this.json(route, 200, { ok: true });
      }
      d.eingehaengt = `/media/lion/${d.uuid}`;
      return this.json(route, 200, { einhaengepunkt: d.eingehaengt, backupOrdner: d.backupOrdner });
    }
    if (pfad === "/api/hintergrund" && methode === "POST") {
      const daten = req.postDataBuffer();
      if (!daten || daten[0] !== 0xff || daten[1] !== 0xd8 || daten[2] !== 0xff) return this.json(route, 415, { fehler: "Bitte ein Foto als JPEG senden." });
      this.foto = daten;
      this.fotoVersion++;
      return this.json(route, 200, { hintergrundFoto: `/api/hintergrund?v=${this.fotoVersion}` });
    }
    if (pfad === "/api/hintergrund") {
      return this.foto ? route.fulfill({ status: 200, contentType: "image/jpeg", body: this.foto }) : this.json(route, 404, { fehler: "Kein Foto." });
    }
    if (pfad === "/api/hintergrund/entfernen") {
      this.foto = null;
      return this.json(route, 200, { ok: true });
    }
    if (pfad === "/api/apps/ressourcen") return this.json(route, 200, { apps: this.ressourcen });
    if (pfad === "/api/apps/jellyfin/logo") {
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#7c3aed"/></svg>' });
    }
    const protokoll = pfad.match(/^\/api\/apps\/([^/]+)\/protokoll$/);
    if (protokoll && methode === "GET") {
      const a = this.app(decodeURIComponent(protokoll[1]!));
      if (!a.installiert) return this.json(route, 404, { fehler: "Diese App ist nicht installiert." });
      return this.json(route, 200, { zeilen: this.appProtokolle[a.id] ?? [] });
    }

    const aktion = pfad.match(/^\/api\/apps\/([^/]+)\/(installieren|starten|stoppen|entfernen)$/);
    if (aktion) {
      if (this.fehlerBeiAktion) return this.json(route, 409, { fehler: this.fehlerBeiAktion });
      const [, id, was] = aktion as unknown as [string, string, string];
      const a = this.app(decodeURIComponent(id));
      if (was === "installieren") {
        a.installiert = {
          status: "installiere",
          meldung: null,
          adressen: [`https://localhost:8101`, `https://box.local:8101`, `https://192.168.1.20:8101`],
          datenordner: `/srv/lion/apps/${a.id}`,
        };
        this.laufend.set(a.id, { ziel: "laeuft", rest: this.schritte });
      } else if (was === "entfernen") {
        if (body?.bestaetigung !== a.id) return this.json(route, 400, { fehler: "Bestätigung fehlt." });
        if (a.installiert) a.installiert.status = "entferne";
        this.laufend.set(a.id, { ziel: "weg", rest: this.schritte });
      } else if (a.installiert) {
        a.installiert.status = was === "stoppen" ? "gestoppt" : "laeuft";
      }
      return this.json(route, 202, { ok: true });
    }
    return this.json(route, 404, { fehler: "Nicht gefunden." });
  }
}
