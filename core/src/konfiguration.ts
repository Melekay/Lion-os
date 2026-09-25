import { z } from "zod";

/** Laufzeit-Konfiguration aus Umgebungsvariablen (im Betrieb: /etc/lion/lion.env). */
const Schema = z.object({
  LION_SECRET: z.string().min(32, "LION_SECRET muss mindestens 32 Zeichen haben."),
  LION_DB: z.string().default("/var/lib/lion/lion.db"),
  LION_HOST: z.string().default("127.0.0.1"),
  LION_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LION_VERSION: z.string().default("0.1.0-dev"),
});

export type Konfiguration = {
  geheimnis: string;
  datenbank: string;
  host: string;
  port: number;
  version: string;
};

export function ladeKonfiguration(umgebung: NodeJS.ProcessEnv = process.env): Konfiguration {
  const ergebnis = Schema.safeParse(umgebung);
  if (!ergebnis.success) {
    const fehler = ergebnis.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ungültige Konfiguration – ${fehler}`);
  }
  const k = ergebnis.data;
  return { geheimnis: k.LION_SECRET, datenbank: k.LION_DB, host: k.LION_HOST, port: k.LION_PORT, version: k.LION_VERSION };
}
