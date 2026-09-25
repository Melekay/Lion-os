import type { AppAnsicht, AppStatus } from "./typen";

export type Ton = "gruen" | "gelb" | "rot" | "neutral" | "arbeitet";

export type Aktion = "installieren" | "oeffnen" | "starten" | "stoppen" | "entfernen";

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
      return ["oeffnen", "stoppen", "entfernen"];
    case "teilweise":
    case "unbekannt":
      return ["oeffnen", "starten", "stoppen", "entfernen"];
    case "gestoppt":
    case "fehler":
      return ["starten", "entfernen"];
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
};

/** Kürzel aus lion-app.yaml → lesbarer Name (unbekannte Kürzel bleiben, wie sie sind). */
export function kategorieText(kategorie: string): string {
  return KATEGORIEN[kategorie] ?? kategorie;
}
