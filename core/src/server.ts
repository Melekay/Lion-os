import { createHash, timingSafeEqual } from "node:crypto";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { AppFehler, type AppVerwaltung } from "./apps.js";
import { letzteEintraege, protokolliere } from "./audit.js";
import type { Datenbank } from "./datenbank.js";
import { BoxName, ladeEinstellungen, speichereBoxName } from "./einstellungen.js";
import { hashePasswort, passwortRegelVerletzt, pruefePasswort } from "./passwort.js";
import { AnmeldeSperre } from "./sperre.js";
import {
  beendeAndereSitzungen,
  beendeSitzung,
  beendeSitzungMitId,
  erstelleSitzung,
  findeSitzung,
  listeSitzungen,
  SITZUNG_COOKIE,
  SITZUNG_DAUER_MS,
  type SitzungsBenutzer,
} from "./sitzungen.js";
import { systemstatus, type Systemstatus } from "./system.js";

export type ServerOptionen = {
  db: Datenbank;
  version: string;
  /** Für Tests austauschbar. */
  status?: () => Promise<Systemstatus>;
  /** Cookie nur über HTTPS senden (im Betrieb immer true, hinter Caddy). */
  sichereCookies?: boolean;
  logger?: boolean;
  apps?: AppVerwaltung;
  /** Adressen, unter denen Lion OS erreichbar ist (aus /etc/lion/adressen); für die Einstellungen. */
  adressen?: () => Promise<string[]>;
  /** Wenn gesetzt, verlangt die Einrichtung diesen Code (der Installer schreibt ihn nach /etc/lion/lion.env). */
  einrichtungsCode?: string;
};

declare module "fastify" {
  interface FastifyRequest {
    benutzer: SitzungsBenutzer | null;
  }
}

/** Schutz gegen CSRF: Ändernde Anfragen müssen diesen Header tragen (Browser setzen ihn nicht von allein). */
export const CSRF_HEADER = "x-lion-request";

const Zugangsdaten = z.object({
  name: z.string().trim().min(1).max(64),
  passwort: z.string().min(1).max(256),
});

const PasswortWechsel = z.object({
  altesPasswort: z.string().min(1).max(256),
  neuesPasswort: z.string().min(1).max(256),
});

const Einrichtung = Zugangsdaten.extend({ code: z.string().max(64).optional() });

/** Groß-/Kleinschreibung, Leerzeichen und Bindestriche spielen beim Code keine Rolle. */
function normalisiereCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

/** Vergleich in konstanter Zeit (über Hashes, damit auch die Länge nichts verrät). */
function codeStimmt(eingabe: string | undefined, erwartet: string): boolean {
  const a = createHash("sha256").update(normalisiereCode(eingabe ?? "")).digest();
  const b = createHash("sha256").update(normalisiereCode(erwartet)).digest();
  return timingSafeEqual(a, b);
}

export function baueServer(opt: ServerOptionen): FastifyInstance {
  const { db } = opt;
  const status = opt.status ?? (() => systemstatus(["/", "/srv/lion"]));
  const sperre = new AnmeldeSperre();
  const app = Fastify({ logger: opt.logger ?? false, bodyLimit: 64 * 1024, trustProxy: "127.0.0.1" });

  app.register(cookie);
  app.decorateRequest("benutzer", null);

  const cookieOptionen = {
    httpOnly: true,
    secure: opt.sichereCookies ?? true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(SITZUNG_DAUER_MS / 1000),
  };

  // Sitzung lesen + CSRF-Schutz für alle ändernden Anfragen.
  app.addHook("onRequest", async (req, reply) => {
    req.benutzer = findeSitzung(db, req.cookies[SITZUNG_COOKIE]);
    const aendernd = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (aendernd && req.headers[CSRF_HEADER] !== "1") {
      return reply.code(403).send({ fehler: "Anfrage ohne Lion-OS-Kennung abgelehnt." });
    }
  });

  const benoetigtAnmeldung = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.benutzer) return reply.code(401).send({ fehler: "Bitte zuerst anmelden." });
  };

  const herkunft = (req: FastifyRequest) => ({ geraet: req.headers["user-agent"], ip: req.ip });

  const eingerichtet = () => (db.prepare("SELECT COUNT(*) AS n FROM benutzer").get() as { n: number }).n > 0;

  // ---- Öffentlich ---------------------------------------------------------
  app.get("/api/health", async () => ({ ok: true, version: opt.version }));

  app.get("/api/setup/status", async () => ({ eingerichtet: eingerichtet(), codeNoetig: Boolean(opt.einrichtungsCode) }));

  app.post("/api/setup", async (req, reply) => {
    if (eingerichtet()) return reply.code(409).send({ fehler: "Lion OS ist bereits eingerichtet." });
    const daten = Einrichtung.safeParse(req.body);
    if (!daten.success) return reply.code(400).send({ fehler: "Name und Passwort angeben." });

    if (opt.einrichtungsCode) {
      const schluessel = `einrichtung:${req.ip}`;
      const gesperrt = sperre.gesperrtFuer(schluessel);
      if (gesperrt > 0) {
        reply.header("retry-after", Math.ceil(gesperrt / 1000));
        return reply.code(429).send({ fehler: `Zu viele Fehlversuche. Bitte in ${Math.ceil(gesperrt / 60000)} Minuten erneut versuchen.` });
      }
      if (!codeStimmt(daten.data.code, opt.einrichtungsCode)) {
        sperre.fehlversuch(schluessel);
        protokolliere(db, { benutzer: daten.data.name, aktion: "einrichtung", ergebnis: "abgelehnt", details: `ip=${req.ip}` });
        return reply.code(403).send({ fehler: "Einrichtungscode falsch. Du findest ihn am Ende der Installation." });
      }
      sperre.erfolg(schluessel);
    }
    const regel = passwortRegelVerletzt(daten.data.passwort);
    if (regel) return reply.code(400).send({ fehler: regel });

    const hash = await hashePasswort(daten.data.passwort);
    // Erneut prüfen, damit zwei gleichzeitige Einrichtungen nicht beide gewinnen.
    if (eingerichtet()) return reply.code(409).send({ fehler: "Lion OS ist bereits eingerichtet." });
    const info = db
      .prepare("INSERT INTO benutzer (name, passwort_hash, erstellt_am) VALUES (?, ?, ?)")
      .run(daten.data.name, hash, new Date().toISOString());
    protokolliere(db, { benutzer: daten.data.name, aktion: "einrichtung", ergebnis: "erfolg" });
    const token = erstelleSitzung(db, Number(info.lastInsertRowid), Date.now(), herkunft(req));
    reply.setCookie(SITZUNG_COOKIE, token, cookieOptionen);
    return reply.code(201).send({ name: daten.data.name });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const schluessel = req.ip;
    const gesperrt = sperre.gesperrtFuer(schluessel);
    if (gesperrt > 0) {
      reply.header("retry-after", Math.ceil(gesperrt / 1000));
      return reply.code(429).send({ fehler: `Zu viele Fehlversuche. Bitte in ${Math.ceil(gesperrt / 60000)} Minuten erneut versuchen.` });
    }
    const daten = Zugangsdaten.safeParse(req.body);
    if (!daten.success) return reply.code(400).send({ fehler: "Name und Passwort angeben." });

    const zeile = db.prepare("SELECT id, name, passwort_hash FROM benutzer WHERE name = ?").get(daten.data.name) as
      | { id: number; name: string; passwort_hash: string }
      | undefined;
    // Auch bei unbekanntem Namen hashen, damit die Antwortzeit nichts verrät.
    const gueltig = zeile
      ? await pruefePasswort(daten.data.passwort, zeile.passwort_hash)
      : (await hashePasswort(daten.data.passwort), false);

    if (!zeile || !gueltig) {
      sperre.fehlversuch(schluessel);
      protokolliere(db, { benutzer: daten.data.name, aktion: "anmeldung", ergebnis: "abgelehnt", details: `ip=${req.ip}` });
      return reply.code(401).send({ fehler: "Name oder Passwort falsch." });
    }
    sperre.erfolg(schluessel);
    protokolliere(db, { benutzer: zeile.name, aktion: "anmeldung", ergebnis: "erfolg", details: `ip=${req.ip}` });
    reply.setCookie(SITZUNG_COOKIE, erstelleSitzung(db, zeile.id, Date.now(), herkunft(req)), cookieOptionen);
    return { name: zeile.name };
  });

  // ---- Angemeldet ---------------------------------------------------------
  app.post("/api/auth/logout", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
    const token = req.cookies[SITZUNG_COOKIE];
    if (token) beendeSitzung(db, token);
    protokolliere(db, { benutzer: req.benutzer?.name, aktion: "abmeldung", ergebnis: "erfolg" });
    reply.clearCookie(SITZUNG_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: benoetigtAnmeldung }, async (req) => ({ name: req.benutzer?.name }));

  // ---- Konto und Sitzungen ------------------------------------------------
  app.post("/api/auth/passwort", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
    const ich = req.benutzer!;
    const schluessel = `passwort:${req.ip}`;
    const gesperrt = sperre.gesperrtFuer(schluessel);
    if (gesperrt > 0) {
      reply.header("retry-after", Math.ceil(gesperrt / 1000));
      return reply.code(429).send({ fehler: `Zu viele Fehlversuche. Bitte in ${Math.ceil(gesperrt / 60000)} Minuten erneut versuchen.` });
    }
    const daten = PasswortWechsel.safeParse(req.body);
    if (!daten.success) return reply.code(400).send({ fehler: "Altes und neues Passwort angeben." });
    const regel = passwortRegelVerletzt(daten.data.neuesPasswort);
    if (regel) return reply.code(400).send({ fehler: regel });

    const zeile = db.prepare("SELECT passwort_hash FROM benutzer WHERE id = ?").get(ich.id) as { passwort_hash: string };
    if (!(await pruefePasswort(daten.data.altesPasswort, zeile.passwort_hash))) {
      sperre.fehlversuch(schluessel);
      protokolliere(db, { benutzer: ich.name, aktion: "passwort.aendern", ergebnis: "abgelehnt", details: `ip=${req.ip}` });
      // 403 statt 401: Die Sitzung ist gültig, nur das alte Passwort stimmt nicht.
      return reply.code(403).send({ fehler: "Das bisherige Passwort stimmt nicht." });
    }
    sperre.erfolg(schluessel);
    db.prepare("UPDATE benutzer SET passwort_hash = ? WHERE id = ?").run(await hashePasswort(daten.data.neuesPasswort), ich.id);
    // Wer das alte Passwort kannte, soll nicht angemeldet bleiben: alle anderen Geräte abmelden.
    const abgemeldet = beendeAndereSitzungen(db, ich.id, ich.sitzungId);
    protokolliere(db, { benutzer: ich.name, aktion: "passwort.aendern", ergebnis: "erfolg", details: `andere Sitzungen beendet: ${abgemeldet}` });
    return { ok: true, abgemeldet };
  });

  app.get("/api/auth/sitzungen", { preHandler: benoetigtAnmeldung }, async (req) => ({
    sitzungen: listeSitzungen(db, req.benutzer!.id, req.benutzer!.sitzungId),
  }));

  app.post("/api/auth/sitzungen/abmelden", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
    const ich = req.benutzer!;
    const daten = z.object({ id: z.number().int().positive().optional() }).safeParse(req.body ?? {});
    if (!daten.success) return reply.code(400).send({ fehler: "Ungültige Sitzung." });
    if (daten.data.id === undefined) {
      const anzahl = beendeAndereSitzungen(db, ich.id, ich.sitzungId);
      protokolliere(db, { benutzer: ich.name, aktion: "sitzungen.abmelden", ergebnis: "erfolg", details: `alle anderen: ${anzahl}` });
      return { ok: true, abgemeldet: anzahl };
    }
    if (daten.data.id === ich.sitzungId) return reply.code(400).send({ fehler: "Diese Sitzung beendest du über „Abmelden“." });
    if (!beendeSitzungMitId(db, ich.id, daten.data.id)) return reply.code(404).send({ fehler: "Sitzung nicht gefunden." });
    protokolliere(db, { benutzer: ich.name, aktion: "sitzungen.abmelden", ergebnis: "erfolg", details: `sitzung=${daten.data.id}` });
    return { ok: true, abgemeldet: 1 };
  });

  // ---- Einstellungen ------------------------------------------------------
  app.get("/api/einstellungen", { preHandler: benoetigtAnmeldung }, async () => ({
    ...ladeEinstellungen(db),
    version: opt.version,
    adressen: opt.adressen ? await opt.adressen() : [],
  }));

  app.post("/api/einstellungen", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
    const daten = z.object({ boxName: BoxName }).safeParse(req.body);
    if (!daten.success) return reply.code(400).send({ fehler: daten.error.issues[0]?.message ?? "Ungültige Eingabe." });
    speichereBoxName(db, daten.data.boxName);
    protokolliere(db, { benutzer: req.benutzer?.name, aktion: "einstellungen.aendern", ziel: "boxName", ergebnis: "erfolg" });
    return ladeEinstellungen(db);
  });

  app.get("/api/system", { preHandler: benoetigtAnmeldung }, async () => status());

  app.get("/api/audit", { preHandler: benoetigtAnmeldung }, async (req) => {
    const anzahl = Number((req.query as { anzahl?: string }).anzahl ?? 100);
    return { eintraege: letzteEintraege(db, Number.isFinite(anzahl) ? anzahl : 100) };
  });

  // ---- Apps ---------------------------------------------------------------
  const apps = opt.apps;
  if (apps) {
    const mitFehlern = (arbeit: (req: FastifyRequest) => Promise<unknown> | unknown, code = 202) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        try {
          const ergebnis = await arbeit(req);
          return reply.code(code).send(ergebnis ?? { ok: true });
        } catch (e) {
          if (e instanceof AppFehler) return reply.code(e.code).send({ fehler: e.message });
          throw e;
        }
      };
    const id = (req: FastifyRequest) => (req.params as { id: string }).id;
    const name = (req: FastifyRequest) => req.benutzer?.name ?? "unbekannt";

    app.get("/api/apps", { preHandler: benoetigtAnmeldung }, async () => ({ apps: await apps.liste() }));
    app.post("/api/apps/:id/installieren", { preHandler: benoetigtAnmeldung }, mitFehlern((req) => apps.installieren(id(req), name(req))));
    app.post("/api/apps/:id/starten", { preHandler: benoetigtAnmeldung }, mitFehlern((req) => apps.starten(id(req), name(req))));
    app.post("/api/apps/:id/stoppen", { preHandler: benoetigtAnmeldung }, mitFehlern((req) => apps.stoppen(id(req), name(req))));
    app.post(
      "/api/apps/:id/entfernen",
      { preHandler: benoetigtAnmeldung },
      mitFehlern((req) => apps.entfernen(id(req), name(req), (req.body as { bestaetigung?: unknown } | undefined)?.bestaetigung)),
    );
  }

  return app;
}
