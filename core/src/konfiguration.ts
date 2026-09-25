import { z } from "zod";

/** Laufzeit-Konfiguration aus Umgebungsvariablen (im Betrieb: /etc/lion/lion.env). */
const Schema = z.object({
  LION_SECRET: z.string().min(32, "LION_SECRET muss mindestens 32 Zeichen haben."),
  LION_DB: z.string().default("/var/lib/lion/lion.db"),
  LION_HOST: z.string().default("127.0.0.1"),
  LION_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LION_VERSION: z.string().default("0.1.0-dev"),
  LION_KATALOG: z.string().default("/opt/lion/apps"),
  LION_APPS_ZUSTAND: z.string().default("/var/lib/lion/apps"),
  LION_APPS_DATEN: z.string().default("/srv/lion/apps"),
  LION_MEDIEN: z.string().default("/srv/lion/medien"),
  LION_CADDY_APPS: z.string().default("/opt/lion/stack/apps"),
  LION_ADRESSEN: z.string().default("/etc/lion/adressen"),
  LION_BACKUP_ARBEIT: z.string().default("/var/lib/lion/backup"),
  LION_BACKUP_ZIELE: z.string().default("/mnt,/media"),
  LION_SETUP_CODE: z.string().min(8, "LION_SETUP_CODE muss mindestens 8 Zeichen haben.").optional(),
});

export type Konfiguration = {
  geheimnis: string;
  datenbank: string;
  host: string;
  port: number;
  version: string;
  katalog: string;
  appsZustand: string;
  appsDaten: string;
  medien: string;
  caddyApps: string;
  adressen: string;
  einrichtungsCode?: string;
  backupArbeit: string;
  backupZiele: string[];
};

export function ladeKonfiguration(umgebung: NodeJS.ProcessEnv = process.env): Konfiguration {
  const ergebnis = Schema.safeParse(umgebung);
  if (!ergebnis.success) {
    const fehler = ergebnis.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ungültige Konfiguration – ${fehler}`);
  }
  const k = ergebnis.data;
  return {
    geheimnis: k.LION_SECRET,
    datenbank: k.LION_DB,
    host: k.LION_HOST,
    port: k.LION_PORT,
    version: k.LION_VERSION,
    katalog: k.LION_KATALOG,
    appsZustand: k.LION_APPS_ZUSTAND,
    appsDaten: k.LION_APPS_DATEN,
    medien: k.LION_MEDIEN,
    caddyApps: k.LION_CADDY_APPS,
    adressen: k.LION_ADRESSEN,
    einrichtungsCode: k.LION_SETUP_CODE,
    backupArbeit: k.LION_BACKUP_ARBEIT,
    backupZiele: k.LION_BACKUP_ZIELE.split(",").map((z) => z.trim()).filter(Boolean),
  };
}
