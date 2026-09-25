/**
 * Antworten von lion-core. Spiegel der Typen in core/src (system.ts, apps.ts, audit.ts, server.ts).
 * Bei Änderungen an der API beide Seiten anpassen.
 */

export type Ampel = "gruen" | "gelb" | "rot";

export type Hinweis = { bereich: "cpu" | "ram" | "speicher" | "temperatur" | "backup"; stufe: Ampel; text: string };

export type Netzwerk = { schnittstelle: string; empfangenBytes: number; gesendetBytes: number };

export type Systemstatus = {
  cpuKerne: number;
  last1: number;
  ramGesamtMb: number;
  ramFreiMb: number;
  speicher: { pfad: string; gesamtGb: number; freiGb: number }[];
  temperaturC: number | null;
  laufzeitS: number;
  netzwerk: Netzwerk | null;
  ampel: Ampel;
  hinweise: Hinweis[];
};

export type AppStatus = "installiere" | "laeuft" | "gestoppt" | "fehler" | "entferne" | "teilweise" | "unbekannt";

export type AppAnsicht = {
  id: string;
  name: string;
  beschreibung: string;
  kategorie: string;
  version: string;
  sicherheitsstufe: "normal" | "sensibel" | "vollzugriff" | string;
  hinweise: string[];
  /** Zugriff auf den gemeinsamen Medienordner. */
  medien?: "keine" | "lesen" | "schreiben";
  /** Empfohlener freier Arbeitsspeicher in MB. */
  ramMinMb?: number;
  installiert: null | {
    status: AppStatus;
    meldung: string | null;
    adressen: string[];
    datenordner: string;
  };
};

export type AuditEintrag = {
  id: number;
  zeit: string;
  benutzer: string | null;
  aktion: string;
  ziel: string | null;
  ergebnis: "erfolg" | "fehler" | "abgelehnt";
  details: string | null;
};

export type SetupStatus = { eingerichtet: boolean; codeNoetig: boolean };

export type SitzungsAnsicht = {
  id: number;
  erstelltAm: string | null;
  laeuftAb: string;
  geraet: string | null;
  ip: string | null;
  aktuell: boolean;
};

export type EinstellungenAntwort = { boxName: string; version: string; adressen: string[] };

export type BackupLauf = {
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
  laeuft: BackupLauf["art"] | null;
  letzter: BackupLauf | null;
  letzterErfolg: BackupLauf | null;
  letzteWiederherstellung: BackupLauf | null;
  naechster: string | null;
};

export type Sicherung = { id: string; kurz: string; zeit: string; pfade: string[] };
