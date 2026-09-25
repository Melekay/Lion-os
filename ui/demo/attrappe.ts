import katalogRoh from "virtual:lion-katalog";
import type { AppAnsicht, AuditEintrag, BackupLauf, BackupStatus, Sicherung, SitzungsAnsicht, Systemstatus } from "../lib/typen";

/**
 * Beispiel-lion-core im Browser. Ersetzt fetch() für /api/… und verhält sich wie der echte Kern:
 * Installationen dauern ein paar Sekunden, Aktionen landen im Protokoll, der Arbeitsspeicher
 * sinkt mit jeder laufenden App. Der Zustand bleibt beim Neuladen erhalten (localStorage).
 */
type Katalogeintrag = Omit<AppAnsicht, "installiert">;
const katalog = katalogRoh as Katalogeintrag[];

type Zustand = {
  angemeldet: boolean;
  boxName: string;
  installiert: Record<string, { status: "installiere" | "laeuft" | "gestoppt" | "entferne"; seit: number; nummer: number }>;
  protokoll: AuditEintrag[];
  sitzungen: SitzungsAnsicht[];
  backup: BackupStatus;
  sicherungen: Sicherung[];
  foto?: string | null;
};

const SPEICHER_SCHLUESSEL = "lion-demo-zustand-v1";
const RAM_GESAMT_MB = 7884; // typischer Mini-PC mit „8 GB“
const RAM_GRUNDLAST_MB = 3300; // System, Docker, Caddy, lion-core
const DAUER_MS = 4000; // so lange „installiert“ bzw. „entfernt“ eine App
const SCHLUESSEL = "K7QM-4XPA-9TRD-HW3N-ZE8B-2FYC";
const START = Date.now();

function jetztIso(abzugMin = 0) {
  return new Date(Date.now() - abzugMin * 60_000).toISOString();
}

function anfangszustand(): Zustand {
  const t = Date.now();
  return {
    angemeldet: true,
    boxName: "Lion OS",
    installiert: {
      "uptime-kuma": { status: "laeuft", seit: t, nummer: 1 },
      jellyfin: { status: "laeuft", seit: t, nummer: 2 },
      "home-assistant": { status: "laeuft", seit: t, nummer: 3 },
      vaultwarden: { status: "gestoppt", seit: t, nummer: 4 },
    },
    protokoll: [
      { id: 4, zeit: jetztIso(12), benutzer: "demo", aktion: "anmeldung", ziel: null, ergebnis: "erfolg", details: "ip=192.168.1.23" },
      { id: 3, zeit: jetztIso(95), benutzer: "demo", aktion: "app.installieren", ziel: "home-assistant", ergebnis: "erfolg", details: null },
      { id: 2, zeit: jetztIso(140), benutzer: "demo", aktion: "app.installieren", ziel: "jellyfin", ergebnis: "erfolg", details: null },
      { id: 1, zeit: jetztIso(600), benutzer: null, aktion: "anmeldung", ziel: null, ergebnis: "abgelehnt", details: "ip=192.168.1.77" },
    ],
    sitzungen: [
      { id: 1, erstelltAm: jetztIso(12), laeuftAb: jetztIso(-7 * 24 * 60), geraet: navigator.userAgent, ip: "192.168.1.23", aktuell: true },
      { id: 2, erstelltAm: jetztIso(60 * 20), laeuftAb: jetztIso(-5 * 24 * 60), geraet: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", ip: "192.168.1.41", aktuell: false },
    ],
    backup: { eingerichtet: false, ziel: null, zeit: "03:00", aktiv: true, laeuft: null, letzter: null, letzterErfolg: null, letzteWiederherstellung: null, naechster: null },
    sicherungen: [],
  };
}

function antwort(status: number, body: unknown) {
  return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function blobAlsDatenAdresse(b: Blob): Promise<string> {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsDataURL(b);
  });
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoApi {
  private z: Zustand;
  private netz = { empfangen: 48_000_000_000, gesendet: 9_000_000_000, zeit: Date.now() };

  constructor() {
    this.z = this.laden() ?? anfangszustand();
  }

  private laden(): Zustand | null {
    try {
      const text = localStorage.getItem(SPEICHER_SCHLUESSEL);
      return text ? (JSON.parse(text) as Zustand) : null;
    } catch {
      return null;
    }
  }

  private speichern() {
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(this.z));
    } catch {
      /* ohne Speicher geht die Demo trotzdem – nur ohne Erinnerung */
    }
  }

  zuruecksetzen() {
    try {
      localStorage.removeItem(SPEICHER_SCHLUESSEL);
    } catch {
      /* egal */
    }
    this.z = anfangszustand();
  }

  verbinden() {
    const original = window.fetch.bind(window);
    window.fetch = async (eingabe: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof eingabe === "string" ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url, location.href);
      if (!url.pathname.startsWith("/api/")) return original(eingabe, init);
      await warte(120 + Math.random() * 180);
      let body: Record<string, unknown> | undefined;
      if (init?.body instanceof Blob) {
        // Foto-Upload: in der Demo als data:-Adresse im Browser behalten.
        body = { daten: await blobAlsDatenAdresse(init.body) };
      } else {
        try {
          body = init?.body ? JSON.parse(String(init.body)) : undefined;
        } catch {
          body = undefined;
        }
      }
      const ergebnis = this.antworten(init?.method ?? "GET", url.pathname, url.searchParams, body ?? {});
      this.speichern();
      return ergebnis;
    };
  }

  private protokolliere(aktion: string, ziel: string | null, ergebnis: AuditEintrag["ergebnis"] = "erfolg", details: string | null = null) {
    const id = (this.z.protokoll[0]?.id ?? 0) + 1;
    this.z.protokoll.unshift({ id, zeit: new Date().toISOString(), benutzer: "demo", aktion, ziel, ergebnis, details });
  }

  /** Installationen und Entfernungen schreiten mit der Zeit voran. */
  private fortschreiten() {
    for (const [id, a] of Object.entries(this.z.installiert)) {
      if (Date.now() - a.seit < DAUER_MS) continue;
      if (a.status === "installiere") {
        a.status = "laeuft";
        this.protokolliere("app.installieren", id);
      } else if (a.status === "entferne") {
        delete this.z.installiert[id];
        this.protokolliere("app.entfernen", id, "erfolg", "Daten behalten");
      }
    }
    const b = this.z.backup;
    if (b.laeuft && b.letzter && Date.now() - Date.parse(b.letzter.start) > DAUER_MS) {
      const fertig: BackupLauf = { ...b.letzter, ende: new Date().toISOString(), status: "erfolg", bytesNeu: 184_000_000 };
      if (b.laeuft === "sicherung") {
        b.letzterErfolg = fertig;
        const id = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        this.z.sicherungen.unshift({ id, kurz: id.slice(0, 8), zeit: fertig.start, pfade: ["/srv/lion/apps", "/var/lib/lion"] });
        this.protokolliere("backup.sichern", null);
      } else {
        b.letzteWiederherstellung = fertig;
        this.protokolliere("backup.wiederherstellen", fertig.app);
      }
      b.letzter = fertig;
      b.laeuft = null;
    }
  }

  private system(): Systemstatus {
    const laufend = Object.entries(this.z.installiert).filter(([, a]) => a.status === "laeuft" || a.status === "installiere");
    const belegt = laufend.reduce((summe, [id]) => summe + (katalog.find((k) => k.id === id)?.ramMinMb ?? 256) * 0.35, RAM_GRUNDLAST_MB);
    const ramFreiMb = Math.max(RAM_GESAMT_MB - Math.round(belegt + Math.random() * 120), 200);
    const vergangen = (Date.now() - this.netz.zeit) / 1000;
    this.netz = {
      empfangen: this.netz.empfangen + Math.round(vergangen * (1_500_000 + Math.random() * 4_000_000)),
      gesendet: this.netz.gesendet + Math.round(vergangen * (200_000 + Math.random() * 600_000)),
      zeit: Date.now(),
    };
    const hinweise: Systemstatus["hinweise"] = [];
    if (!this.z.backup.eingerichtet) hinweise.push({ bereich: "backup", stufe: "gelb", text: "Es gibt noch kein Backup. Richte es unter „Backup“ ein." });
    return {
      cpuKerne: 4,
      last1: 0.4 + Math.random() * 0.8,
      ramGesamtMb: RAM_GESAMT_MB,
      ramFreiMb,
      speicher: [
        { pfad: "/", gesamtGb: 234, freiGb: 181 },
        { pfad: "/srv", gesamtGb: 1863, freiGb: 1204 },
      ],
      temperaturC: 46 + Math.round(Math.random() * 6),
      laufzeitS: 4 * 86400 + 7 * 3600 + Math.round((Date.now() - START) / 1000),
      netzwerk: { schnittstelle: "enp1s0", empfangenBytes: this.netz.empfangen, gesendetBytes: this.netz.gesendet },
      ampel: hinweise.length ? "gelb" : "gruen",
      hinweise,
    };
  }

  private apps(): AppAnsicht[] {
    return katalog.map((k) => {
      const a = this.z.installiert[k.id];
      return {
        ...k,
        installiert: a
          ? {
              status: a.status,
              meldung: null,
              adressen: [`https://lion.local:${8100 + a.nummer}`, `https://192.168.1.20:${8100 + a.nummer}`],
              datenordner: `/srv/lion/apps/${k.id}`,
            }
          : null,
      };
    });
  }

  /** Plausible, leicht schwankende Live-Werte für laufende Apps. */
  private ressourcen(): Record<string, { cpuProzent: number; ramMb: number }> {
    const ergebnis: Record<string, { cpuProzent: number; ramMb: number }> = {};
    for (const [id, a] of Object.entries(this.z.installiert)) {
      if (a.status !== "laeuft") continue;
      const basis = katalog.find((k) => k.id === id)?.ramMinMb ?? 256;
      ergebnis[id] = {
        ramMb: Math.round(basis * 0.35 * (0.9 + Math.random() * 0.2)),
        cpuProzent: Math.round((0.3 + Math.random() * (basis >= 2048 ? 12 : 4)) * 10) / 10,
      };
    }
    return ergebnis;
  }

  private appProtokoll(id: string): string[] {
    const zeit = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    const zeilen = [
      `app-1  | ${zeit(300)} Container gestartet`,
      `app-1  | ${zeit(298)} Konfiguration geladen`,
      `app-1  | ${zeit(290)} Lausche auf Port ${katalog.find((k) => k.id === id)?.id === "filebrowser" ? 80 : 8080}`,
    ];
    if (id === "filebrowser") zeilen.push(`app-1  | ${zeit(289)} User 'admin' initialized with randomly generated password: pX7-demo-Qm4t`);
    zeilen.push(`app-1  | ${zeit(5)} Alles in Ordnung`);
    return zeilen;
  }

  private naechsteNummer() {
    const belegt = new Set(Object.values(this.z.installiert).map((a) => a.nummer));
    let n = 1;
    while (belegt.has(n)) n++;
    return n;
  }

  private antworten(methode: string, pfad: string, suche: URLSearchParams, body: Record<string, unknown>): Response {
    this.fortschreiten();
    const z = this.z;

    if (pfad === "/api/health") return antwort(200, { ok: true });
    if (pfad === "/api/setup/status") return antwort(200, { eingerichtet: true, codeNoetig: true });
    if (pfad === "/api/setup") return antwort(409, { fehler: "Die Demo ist schon eingerichtet." });
    if (pfad === "/api/auth/login") {
      if (!body.passwort) return antwort(400, { fehler: "Bitte Passwort eingeben." });
      z.angemeldet = true;
      this.protokolliere("anmeldung", null, "erfolg", "ip=192.168.1.23");
      return antwort(200, { name: String(body.name || "demo") });
    }
    if (!z.angemeldet) return antwort(401, { fehler: "Bitte melde dich an." });
    if (pfad === "/api/auth/logout") {
      z.angemeldet = false;
      return antwort(200, { ok: true });
    }
    if (pfad === "/api/auth/me") return antwort(200, { name: "demo" });
    if (pfad === "/api/auth/passwort") {
      const neu = String(body.neuesPasswort ?? "");
      if (neu.length < 12) return antwort(400, { fehler: "Das neue Passwort braucht mindestens 12 Zeichen." });
      const abgemeldet = z.sitzungen.filter((s) => !s.aktuell).length;
      z.sitzungen = z.sitzungen.filter((s) => s.aktuell);
      this.protokolliere("passwort.aendern", null);
      return antwort(200, { ok: true, abgemeldet });
    }
    if (pfad === "/api/auth/sitzungen") return antwort(200, { sitzungen: z.sitzungen });
    if (pfad === "/api/auth/sitzungen/abmelden") {
      const vorher = z.sitzungen.length;
      z.sitzungen = body.id === undefined ? z.sitzungen.filter((s) => s.aktuell) : z.sitzungen.filter((s) => s.aktuell || s.id !== body.id);
      return antwort(200, { ok: true, abgemeldet: vorher - z.sitzungen.length });
    }
    if (pfad === "/api/system") return antwort(200, this.system());
    if (pfad === "/api/einstellungen" && methode === "GET") {
      return antwort(200, { boxName: z.boxName, version: "0.1.0-demo", adressen: ["lion.local", "192.168.1.20"], hintergrundFoto: z.foto ?? null });
    }
    if (pfad === "/api/einstellungen") {
      const name = String(body.boxName ?? "").trim();
      if (!name || name.length > 40 || /[<>]/.test(name)) return antwort(400, { fehler: "Erlaubt sind Buchstaben, Ziffern, Leerzeichen und - _ . '" });
      z.boxName = name;
      this.protokolliere("einstellungen.aendern", null);
      return antwort(200, { boxName: name });
    }
    if (pfad === "/api/hintergrund") {
      const daten = String(body.daten ?? "");
      if (!daten.startsWith("data:image/jpeg;base64,")) return antwort(415, { fehler: "Bitte ein Foto als JPEG senden." });
      z.foto = daten;
      this.protokolliere("hintergrund.hochladen", null);
      return antwort(200, { hintergrundFoto: daten });
    }
    if (pfad === "/api/hintergrund/entfernen") {
      z.foto = null;
      this.protokolliere("hintergrund.entfernen", null);
      return antwort(200, { ok: true });
    }
    if (pfad === "/api/audit") return antwort(200, { eintraege: z.protokoll.slice(0, Number(suche.get("anzahl") ?? 100)) });

    // ---- Apps
    if (pfad === "/api/apps") return antwort(200, { apps: this.apps() });
    if (pfad === "/api/apps/ressourcen") return antwort(200, { apps: this.ressourcen() });
    const appPfad = pfad.match(/^\/api\/apps\/([^/]+)\/([a-z]+)$/);
    if (appPfad) {
      const id = decodeURIComponent(appPfad[1]!);
      const aktion = appPfad[2]!;
      if (!katalog.some((k) => k.id === id)) return antwort(404, { fehler: `Unbekannte App: ${id}` });
      const a = z.installiert[id];
      if (aktion === "protokoll") return a ? antwort(200, { zeilen: this.appProtokoll(id) }) : antwort(404, { fehler: "Diese App ist nicht installiert." });
      if (aktion === "installieren") {
        if (a) return antwort(409, { fehler: "Die App ist bereits installiert." });
        z.installiert[id] = { status: "installiere", seit: Date.now(), nummer: this.naechsteNummer() };
        return antwort(202, { ok: true });
      }
      if (!a) return antwort(404, { fehler: "Diese App ist nicht installiert." });
      if (aktion === "starten" || aktion === "stoppen") {
        a.status = aktion === "starten" ? "laeuft" : "gestoppt";
        this.protokolliere(`app.${aktion}`, id);
        return antwort(202, { ok: true });
      }
      if (aktion === "entfernen") {
        if (body.bestaetigung !== id) return antwort(400, { fehler: `Zum Entfernen bitte „${id}“ als Bestätigung angeben.` });
        a.status = "entferne";
        a.seit = Date.now();
        return antwort(202, { ok: true });
      }
    }

    // ---- Backup
    const b = z.backup;
    if (pfad === "/api/backup") return antwort(200, b);
    if (pfad === "/api/backup/einrichten") {
      const ziel = String(body.ziel ?? "");
      if (!/^\/(mnt|media)\/[A-Za-z0-9._/-]+$/.test(ziel)) return antwort(400, { fehler: "Backups sind nur in Unterordnern von /mnt oder /media erlaubt." });
      const neu = !b.eingerichtet;
      Object.assign(b, { eingerichtet: true, ziel, zeit: String(body.zeit ?? "03:00"), naechster: jetztIso(-8 * 60) });
      this.protokolliere("backup.einrichten", null, "erfolg", ziel);
      return antwort(200, { schluesselNeu: neu ? SCHLUESSEL : null, status: b });
    }
    if (pfad === "/api/backup/plan") {
      Object.assign(b, { zeit: String(body.zeit ?? b.zeit), aktiv: Boolean(body.aktiv) });
      return antwort(200, b);
    }
    const starteLauf = (art: BackupLauf["art"], app: string | null) => {
      b.laeuft = art;
      b.letzter = { id: Date.now(), art, start: new Date().toISOString(), ende: null, status: "laeuft", meldung: null, sicherung: null, bytesNeu: null, app };
    };
    if (pfad === "/api/backup/jetzt") {
      if (!b.eingerichtet) return antwort(409, { fehler: "Bitte zuerst ein Backup-Ziel einrichten." });
      if (b.laeuft) return antwort(409, { fehler: "Es läuft bereits eine Sicherung." });
      starteLauf("sicherung", null);
      return antwort(202, { ok: true });
    }
    if (pfad === "/api/backup/sicherungen") return antwort(200, { sicherungen: z.sicherungen });
    if (pfad === "/api/backup/wiederherstellen") {
      if (body.bestaetigung !== body.app) return antwort(400, { fehler: "Zur Bestätigung bitte die App-ID eintippen." });
      starteLauf("wiederherstellung", String(body.app));
      return antwort(202, { ok: true });
    }
    if (pfad === "/api/backup/schluessel") {
      if (!body.passwort) return antwort(403, { fehler: "Das Passwort stimmt nicht." });
      return antwort(200, { schluessel: SCHLUESSEL });
    }
    return antwort(404, { fehler: "Nicht gefunden." });
  }
}
