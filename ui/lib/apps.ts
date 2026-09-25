import { zahl } from "./format";
import type { AppAnsicht, AppRessourcen, AppStatus, Systemstatus } from "./typen";

export type Ton = "gruen" | "gelb" | "rot" | "neutral" | "arbeitet";

export type Aktion = "installieren" | "oeffnen" | "starten" | "stoppen" | "protokoll" | "entfernen";

const STATUS: Record<AppStatus, { text: string; ton: Ton }> = {
  installiere: { text: "Wird installiert …", ton: "arbeitet" },
  entferne: { text: "Wird entfernt …", ton: "arbeitet" },
  laeuft: { text: "Läuft", ton: "gruen" },
  gestoppt: { text: "Gestoppt", ton: "neutral" },
  teilweise: { text: "Läuft teilweise", ton: "gelb" },
  fehler: { text: "Fehler", ton: "rot" },
  unbekannt: { text: "Status unbekannt", ton: "gelb" },
};

export function statusAnzeige(app: AppAnsicht): { text: string; ton: Ton } {
  if (!app.installiert) return { text: "Nicht installiert", ton: "neutral" };
  return STATUS[app.installiert.status] ?? { text: app.installiert.status, ton: "gelb" };
}

/** Läuft gerade irgendwo eine Aktion? Dann fragt die Oberfläche häufiger nach. */
export function beschaeftigt(apps: AppAnsicht[]): boolean {
  return apps.some((a) => a.installiert?.status === "installiere" || a.installiert?.status === "entferne");
}

/** Welche Knöpfe zeigt die Karte? Die Reihenfolge ist die Anzeige-Reihenfolge. */
export function aktionen(app: AppAnsicht): Aktion[] {
  const s = app.installiert?.status;
  switch (s) {
    case undefined:
      return ["installieren"];
    case "laeuft":
      return ["oeffnen", "stoppen", "protokoll", "entfernen"];
    case "teilweise":
    case "unbekannt":
      return ["oeffnen", "starten", "stoppen", "protokoll", "entfernen"];
    case "gestoppt":
    case "fehler":
      return ["starten", "protokoll", "entfernen"];
    default:
      return [];
  }
}

/**
 * Die passende Adresse für diesen Browser: gleicher Hostname wie die Oberfläche,
 * sonst die erste Adresse, die nicht localhost ist.
 */
export function besteAdresse(adressen: string[], hostname: string): string | null {
  const host = (a: string) => {
    try {
      return new URL(a).hostname;
    } catch {
      return "";
    }
  };
  return (
    adressen.find((a) => host(a) === hostname) ??
    adressen.find((a) => host(a) !== "localhost" && host(a) !== "") ??
    adressen[0] ??
    null
  );
}

export function sicherheitsHinweis(stufe: string): { text: string; erklaerung: string } | null {
  if (stufe === "sensibel") {
    return { text: "Sensible Daten", erklaerung: "Diese App speichert vertrauliche Daten. Sichere sie regelmäßig und nutze ein starkes Passwort." };
  }
  if (stufe === "vollzugriff") {
    return { text: "Vollzugriff", erklaerung: "Diese App bekommt weitreichende Rechte auf dem System. Nur installieren, wenn du ihr vertraust." };
  }
  return null;
}

const KATEGORIEN: Record<string, string> = {
  ueberwachung: "Überwachung",
  sicherheit: "Sicherheit",
  dateien: "Dateien",
  medien: "Medien",
  smarthome: "Smart Home",
  produktivitaet: "Produktivität",
  fotos: "Fotos",
  dokumente: "Dokumente",
  haushalt: "Haushalt",
  ki: "KI",
};

/** Kürzel aus lion-app.yaml → lesbarer Name (unbekannte Kürzel bleiben, wie sie sind). */
export function kategorieText(kategorie: string): string {
  return KATEGORIEN[kategorie] ?? kategorie;
}

/** Kategorien, die im Katalog vorkommen – sortiert nach lesbarem Namen, ohne Doppelte. */
export function kategorien(apps: AppAnsicht[]): string[] {
  return [...new Set(apps.map((a) => a.kategorie))].sort((a, b) => kategorieText(a).localeCompare(kategorieText(b), "de"));
}

/** Kurzer Hinweis, ob eine App den gemeinsamen Medienordner nutzt. */
export function medienText(medien: AppAnsicht["medien"]): string | null {
  if (medien === "lesen") return "Liest den Medienordner (nur lesen)";
  if (medien === "schreiben") return "Verwaltet den Medienordner";
  return null;
}

/** „512 MB“, „4 GB“, „1,5 GB“ */
export function ramText(mb: number): string {
  if (mb < 1024) return `${zahl(mb)} MB`;
  const gb = mb / 1024;
  return `${zahl(gb, Number.isInteger(gb) ? 0 : 1)} GB`;
}

export type RamWarnung = { stufe: "gelb" | "rot"; titel: string; text: string };

/**
 * Warnt vor der Installation, wenn eine App mehr Arbeitsspeicher braucht, als das Gerät hat (rot)
 * oder als gerade frei ist (gelb). Ohne Messwerte oder ohne Angabe der App: keine Warnung.
 */
export function ramWarnung(ramMinMb: number | undefined, system: Pick<Systemstatus, "ramGesamtMb" | "ramFreiMb"> | null | undefined): RamWarnung | null {
  if (!ramMinMb || !system || !(system.ramGesamtMb > 0)) return null;
  const braucht = ramText(ramMinMb);
  if (ramMinMb > system.ramGesamtMb) {
    return {
      stufe: "rot",
      titel: "Zu wenig Arbeitsspeicher",
      text: `Diese App braucht mindestens ${braucht}. Dein Gerät hat insgesamt nur ${ramText(system.ramGesamtMb)}. Sie startet wahrscheinlich nicht oder bremst alles aus.`,
    };
  }
  if (ramMinMb > system.ramFreiMb) {
    return {
      stufe: "gelb",
      titel: "Arbeitsspeicher knapp",
      text: `Diese App braucht mindestens ${braucht}, frei sind gerade ${ramText(Math.max(system.ramFreiMb, 0))}. Stoppe vorher andere Apps, sonst kann das Gerät langsam werden.`,
    };
  }
  return null;
}

export type LiveAnzeige = {
  ramText: string;
  cpuText: string;
  /** Anteil am gesamten Arbeitsspeicher bzw. an der ganzen CPU, 0…1 */
  ramAnteil: number;
  cpuAnteil: number;
  /** Für Screenreader und Tooltips */
  satz: string;
};

/** Live-Werte einer App für Kachel und Karte. Ohne Messung (App gestoppt, Docker langsam): null. */
export function liveAnzeige(r: AppRessourcen | undefined, ramGesamtMb: number | undefined): LiveAnzeige | null {
  if (!r) return null;
  const cpuText = `${zahl(r.cpuProzent, r.cpuProzent > 0 && r.cpuProzent < 10 ? 1 : 0)} %`;
  const ramText = ramTextLive(r.ramMb);
  return {
    ramText,
    cpuText,
    ramAnteil: ramGesamtMb && ramGesamtMb > 0 ? Math.min(1, Math.max(0, r.ramMb / ramGesamtMb)) : 0,
    cpuAnteil: Math.min(1, Math.max(0, r.cpuProzent / 100)),
    satz: `${ramText} Arbeitsspeicher, ${cpuText} CPU`,
  };
}

/** Wie ramText, aber mit einer Nachkommastelle ab 1 GB („1,2 GB“). */
function ramTextLive(mb: number): string {
  if (mb < 1024) return `${zahl(Math.round(mb))} MB`;
  return `${zahl(mb / 1024, 1)} GB`;
}
