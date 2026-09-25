import type { Netzwerk } from "./typen";

export type Punkt = { runter: number; hoch: number };
export type Verlauf = { letzter: { zeit: number; schnittstelle: string; rx: number; tx: number } | null; punkte: Punkt[] };

export const LEERER_VERLAUF: Verlauf = { letzter: null, punkte: [] };

/**
 * Nimmt neue Zählerstände von lion-core auf und berechnet daraus Bytes pro Sekunde.
 * Zähler, die kleiner werden (Neustart, andere Karte), beginnen neu statt negative Werte zu liefern.
 */
export function neuerVerlauf(v: Verlauf, netz: Netzwerk | null, jetztMs: number, max = 30): Verlauf {
  if (!netz) return v;
  const letzter = { zeit: jetztMs, schnittstelle: netz.schnittstelle, rx: netz.empfangenBytes, tx: netz.gesendetBytes };
  const l = v.letzter;
  const sekunden = l ? (jetztMs - l.zeit) / 1000 : 0;
  if (!l || sekunden <= 0 || l.schnittstelle !== netz.schnittstelle || netz.empfangenBytes < l.rx || netz.gesendetBytes < l.tx) {
    return { letzter, punkte: v.punkte };
  }
  const punkt = { runter: (netz.empfangenBytes - l.rx) / sekunden, hoch: (netz.gesendetBytes - l.tx) / sekunden };
  return { letzter, punkte: [...v.punkte, punkt].slice(-max) };
}

/** „12 kB/s“ – Dezimal-Einheiten wie in Netzwerk-Anzeigen üblich. */
export function rate(bytesProSekunde: number): string {
  const b = Math.max(0, bytesProSekunde);
  const fmt = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
  if (b >= 1e9) return `${fmt(b / 1e9)} GB/s`;
  if (b >= 1e6) return `${fmt(b / 1e6)} MB/s`;
  if (b >= 1e3) return `${fmt(b / 1e3)} kB/s`;
  return `${Math.round(b)} B/s`;
}

/** Punkte für eine SVG-Linie (0…100 × 0…hoehe), gemeinsamer Maßstab für beide Richtungen. */
export function linie(werte: number[], maximum: number, hoehe = 40): string {
  if (werte.length < 2) return "";
  const max = maximum > 0 ? maximum : 1;
  return werte
    .map((w, i) => `${((i / (werte.length - 1)) * 100).toFixed(1)},${(hoehe - (Math.min(w, max) / max) * (hoehe - 2) - 1).toFixed(1)}`)
    .join(" ");
}
