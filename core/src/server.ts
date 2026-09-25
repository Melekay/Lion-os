import { createHash, timingSafeEqual } from "node:crypto";
import { cpus } from "node:os";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { AppFehler, type AppVerwaltung } from "./apps.js";
import { BackupFehler, type BackupVerwaltung } from "./backup/backup.js";
import { ResticFehler } from "./backup/restic.js";
import { letzteEintraege, protokolliere } from "./audit.js";
import type { Datenbank } from "./datenbank.js";
import { BoxName, ladeEinstellungen, speichereBoxName } from "./einstellungen.js";
import { type HintergrundFoto, istJpeg, MAX_FOTO_BYTES } from "./hintergrund.js";
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
import { schlimmer, systemstatus, type Systemstatus } from "./system.js";

export type ServerOptionen = {
  db: Datenbank;
  version: string;
  /** Für Tests austauschbar. */
  status?: () => Promise<Systemstatus>;
  /** Cookie nur über HTTPS senden (im Betrieb immer true, hinter Caddy). */
  sichereCookies?: boolean;
  logger?: boolean;
  apps?: AppVerwaltung;
  backup?: BackupVerwaltung;
  /** Adressen, unter denen Lion OS erreichbar ist (aus /etc/lion/adressen); für die Einstellungen. */
  adressen?: () => Promise<string[]>;
  /** Wenn gesetzt, verlangt die Einrichtung diesen Code (der Installer schreibt ihn nach /etc/lion/lion.env). */
  einrichtungsCode?: string;
  /** Eigenes Hintergrundfoto (fehlt es, gibt es die Funktion nicht). */
  hintergrund?: HintergrundFoto;
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
  app.get("/api/einstellungen", { preHandler: benoetigtAnmeldung }, async () => {
    const fotoVersion = opt.hintergrund ? await opt.hintergrund.version() : null;
    return {
      ...ladeEinstellungen(db),
      version: opt.version,
      adressen: opt.adressen ? await opt.adressen() : [],
      hintergrundFoto: fotoVersion === null ? null : `/api/hintergrund?v=${fotoVersion}`,
    };
  });

  // ---- Eigenes Hintergrundfoto --------------------------------------------
  const hintergrund = opt.hintergrund;
  if (hintergrund) {
    // Nur für diese Route: rohes JPEG als Buffer annehmen (sonst gilt das kleine JSON-Limit).
    app.addContentTypeParser("image/jpeg", { parseAs: "buffer", bodyLimit: MAX_FOTO_BYTES }, (_req, body, fertig) => fertig(null, body));

    app.get("/api/hintergrund", { preHandler: benoetigtAnmeldung }, async (_req, reply) => {
      const foto = await hintergrund.lesen();
      if (!foto) return reply.code(404).send({ fehler: "Es gibt kein eigenes Hintergrundfoto." });
      return reply
        .header("content-type", "image/jpeg")
        .header("x-content-type-options", "nosniff")
        .header("content-security-policy", "default-src 'none'; sandbox")
        .header("cache-control", "private, max-age=31536000, immutable")
        .send(foto);
    });

    app.post("/api/hintergrund", { preHandler: benoetigtAnmeldung, bodyLimit: MAX_FOTO_BYTES }, async (req, reply) => {
      const daten = req.body;
      if (!Buffer.isBuffer(daten) || !istJpeg(daten)) {
        return reply.code(415).send({ fehler: "Bitte ein Foto als JPEG senden." });
      }
      const version = await hintergrund.speichern(daten);
      protokolliere(db, { benutzer: req.benutzer?.name, aktion: "hintergrund.hochladen", ergebnis: "erfolg", details: `${Math.round(daten.length / 1024)} KB` });
      return { hintergrundFoto: `/api/hintergrund?v=${version}` };
    });

    app.post("/api/hintergrund/entfernen", { preHandler: benoetigtAnmeldung }, async (req) => {
      const gab = await hintergrund.entfernen();
      if (gab) protokolliere(db, { benutzer: req.benutzer?.name, aktion: "hintergrund.entfernen", ergebnis: "erfolg" });
      return { ok: true };
    });
  }

  app.post("/api/einstellungen", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
    const daten = z.object({ boxName: BoxName }).safeParse(req.body);
    if (!daten.success) return reply.code(400).send({ fehler: daten.error.issues[0]?.message ?? "Ungültige Eingabe." });
    speichereBoxName(db, daten.data.boxName);
    protokolliere(db, { benutzer: req.benutzer?.name, aktion: "einstellungen.aendern", ziel: "boxName", ergebnis: "erfolg" });
    return ladeEinstellungen(db);
  });

  // Systemstatus plus Backup-Hinweis: Ein fehlendes oder fehlgeschlagenes Backup gehört in die Ampel.
  app.get("/api/system", { preHandler: benoetigtAnmeldung }, async () => {
    const s = await status();
    const h = opt.backup?.hinweis();
    if (!h) return s;
    return { ...s, hinweise: [...s.hinweise, h], ampel: schlimmer(s.ampel, h.stufe) };
  });

  // ---- Backup ---------------------------------------------------------------
  const backup = opt.backup;
  if (backup) {
    const backupFehler = async (reply: FastifyReply, arbeit: () => Promise<unknown> | unknown, code = 200) => {
      try {
        return reply.code(code).send((await arbeit()) ?? { ok: true });
      } catch (e) {
        if (e instanceof BackupFehler) return reply.code(e.code).send({ fehler: e.message });
        if (e instanceof ResticFehler) return reply.code(502).send({ fehler: `Backup-Ziel nicht lesbar: ${e.message}` });
        throw e;
      }
    };
    const wer = (req: FastifyRequest) => req.benutzer?.name ?? "unbekannt";

    app.get("/api/backup", { preHandler: benoetigtAnmeldung }, async () => backup.status());

    app.post("/api/backup/einrichten", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
      const d = z.object({ ziel: z.string().max(200), zeit: z.string().max(5) }).safeParse(req.body);
      if (!d.success) return reply.code(400).send({ fehler: "Ziel und Uhrzeit angeben." });
      return backupFehler(reply, async () => ({ ...(await backup.einrichten(d.data, wer(req))), status: backup.status() }));
    });

    app.post("/api/backup/plan", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
      const d = z.object({ zeit: z.string().max(5), aktiv: z.boolean() }).safeParse(req.body);
      if (!d.success) return reply.code(400).send({ fehler: "Uhrzeit und An/Aus angeben." });
      return backupFehler(reply, () => backup.planAendern(d.data, wer(req)));
    });

    app.post("/api/backup/jetzt", { preHandler: benoetigtAnmeldung }, async (req, reply) =>
      backupFehler(reply, () => backup.sichern(wer(req)), 202),
    );

    app.get("/api/backup/sicherungen", { preHandler: benoetigtAnmeldung }, async (_req, reply) =>
      backupFehler(reply, async () => ({ sicherungen: await backup.sicherungen() })),
    );

    app.post("/api/backup/wiederherstellen", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
      const d = z.object({ sicherung: z.string().max(64), app: z.string().max(64), bestaetigung: z.unknown() }).safeParse(req.body);
      if (!d.success) return reply.code(400).send({ fehler: "Sicherung und App angeben." });
      return backupFehler(reply, () => backup.wiederherstellen(d.data, wer(req)), 202);
    });

    // Der Schlüssel entschlüsselt alle Sicherungen – nur nach erneuter Passworteingabe.
    app.post("/api/backup/schluessel", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
      const ich = req.benutzer!;
      const schluessel = `schluessel:${req.ip}`;
      const gesperrt = sperre.gesperrtFuer(schluessel);
      if (gesperrt > 0) {
        reply.header("retry-after", Math.ceil(gesperrt / 1000));
        return reply.code(429).send({ fehler: `Zu viele Fehlversuche. Bitte in ${Math.ceil(gesperrt / 60000)} Minuten erneut versuchen.` });
      }
      const d = z.object({ passwort: z.string().min(1).max(256) }).safeParse(req.body);
      if (!d.success) return reply.code(400).send({ fehler: "Bitte dein Passwort eingeben." });
      const zeile = db.prepare("SELECT passwort_hash FROM benutzer WHERE id = ?").get(ich.id) as { passwort_hash: string };
      if (!(await pruefePasswort(d.data.passwort, zeile.passwort_hash))) {
        sperre.fehlversuch(schluessel);
        protokolliere(db, { benutzer: ich.name, aktion: "backup.schluessel", ergebnis: "abgelehnt", details: `ip=${req.ip}` });
        return reply.code(403).send({ fehler: "Das Passwort stimmt nicht." });
      }
      sperre.erfolg(schluessel);
      protokolliere(db, { benutzer: ich.name, aktion: "backup.schluessel", ergebnis: "erfolg", details: `ip=${req.ip}` });
      return backupFehler(reply, async () => ({ schluessel: await backup.schluessel() }));
    });
  }

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
    app.get("/api/apps/ressourcen", { preHandler: benoetigtAnmeldung }, async () => ({
      apps: await apps.ressourcen(cpus().length),
    }));
    app.get("/api/apps/:id/logo", { preHandler: benoetigtAnmeldung }, async (req, reply) => {
      try {
        const logo = apps.logo(id(req));
        if (logo === null) return reply.code(404).send({ fehler: "Diese App hat kein Logo." });
        // SVG kann Skripte enthalten: zusätzlich zur Katalog-Prüfung eine Sperr-CSP und kein MIME-Raten.
        return reply
          .header("content-type", "image/svg+xml; charset=utf-8")
          .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
          .header("x-content-type-options", "nosniff")
          .header("cache-control", "private, max-age=86400")
          .send(logo);
      } catch (e) {
        if (e instanceof AppFehler) return reply.code(e.code).send({ fehler: e.message });
        throw e;
      }
    });
    app.get("/api/apps/:id/protokoll", { preHandler: benoetigtAnmeldung }, mitFehlern((req) => apps.protokoll(id(req)), 200));
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
