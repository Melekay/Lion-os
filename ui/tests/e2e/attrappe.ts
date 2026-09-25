import type { Page, Route } from "@playwright/test";
import type { AppAnsicht, AuditEintrag, Systemstatus } from "../../lib/typen";

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
  ];

  protokoll: AuditEintrag[] = [
    { id: 2, zeit: "2026-09-25T10:00:00.000Z", benutzer: "admin", aktion: "anmeldung", ziel: null, ergebnis: "erfolg", details: "ip=192.168.1.5" },
    { id: 1, zeit: "2026-09-25T09:59:00.000Z", benutzer: "gast", aktion: "anmeldung", ziel: null, ergebnis: "abgelehnt", details: "ip=192.168.1.9" },
  ];

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
    const body = req.postData() ? JSON.parse(req.postData() as string) : undefined;
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
      if (body?.passwort !== "richtiges-passwort") return this.json(route, 401, { fehler: "Name oder Passwort falsch." });
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
    if (pfad === "/api/audit") return this.json(route, 200, { eintraege: this.protokoll });
    if (pfad === "/api/apps") {
      this.weiterzaehlen();
      return this.json(route, 200, { apps: this.apps });
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
