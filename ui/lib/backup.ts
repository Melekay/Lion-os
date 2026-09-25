import type { Ton } from "./apps";
import type { BackupStatus } from "./typen";

const STUNDE = 60 * 60 * 1000;

/** Zustand des Backups in einem Ton + Text – für Kachel und Statuskarte. Reine Funktion. */
export function backupZustand(s: BackupStatus | undefined, jetztMs: number): { ton: Ton; text: string } {
  if (!s) return { ton: "neutral", text: "Wird geladen …" };
  if (s.laeuft === "sicherung") return { ton: "arbeitet", text: "Sicherung läuft …" };
  if (s.laeuft === "wiederherstellung") return { ton: "arbeitet", text: "Wiederherstellung läuft …" };
  if (!s.eingerichtet) return { ton: "gelb", text: "Nicht eingerichtet" };
  if (s.letzter?.status === "fehler") return { ton: "rot", text: "Letztes Backup fehlgeschlagen" };
  if (!s.letzterErfolg) return { ton: "gelb", text: "Noch kein Backup" };
  const alter = jetztMs - new Date(s.letzterErfolg.start).getTime();
  if (alter > 7 * 24 * STUNDE) return { ton: "rot", text: "Letztes Backup über eine Woche alt" };
  if (alter > 48 * STUNDE) return { ton: "gelb", text: "Letztes Backup älter als 2 Tage" };
  return { ton: "gruen", text: "Gesichert" };
}

/** „12,3 MB“ – Binär-Einheiten wie bei Dateigrößen üblich. */
export function groesse(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "–";
  const einheiten = ["B", "KB", "MB", "GB", "TB"];
  let w = Math.max(0, bytes);
  let i = 0;
  while (w >= 1024 && i < einheiten.length - 1) {
    w /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: i === 0 || w >= 100 ? 0 : 1 }).format(w)} ${einheiten[i]}`;
}

/** „heute um 03:00“, „morgen um 03:00“, sonst Datum. */
export function wannText(iso: string, jetzt: Date): string {
  const d = new Date(iso);
  const uhr = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
  const tag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((tag(d) - tag(jetzt)) / (24 * STUNDE));
  if (diff === 0) return d.getTime() <= jetzt.getTime() + 60_000 ? "jetzt gleich" : `heute um ${uhr}`;
  if (diff === 1) return `morgen um ${uhr}`;
  if (diff === -1) return `gestern um ${uhr}`;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
