/**
 * Wählbarer Hintergrund der Oberfläche. Gespeichert nur in diesem Browser (localStorage) –
 * jedes Gerät darf seinen eigenen haben. Die Farben stehen in app/globals.css (--hg-…).
 */
export const HINTERGRUENDE = [
  { id: "sonnenuntergang", name: "Sonnenuntergang" },
  { id: "ozean", name: "Ozean" },
  { id: "aurora", name: "Polarlicht" },
  { id: "nebel", name: "Nebel" },
] as const;

export type HintergrundId = (typeof HINTERGRUENDE)[number]["id"];

export const STANDARD_HINTERGRUND: HintergrundId = "sonnenuntergang";
export const SPEICHER_SCHLUESSEL = "lion-hintergrund";

export function istHintergrund(wert: unknown): wert is HintergrundId {
  return HINTERGRUENDE.some((h) => h.id === wert);
}

export function gespeicherterHintergrund(): HintergrundId {
  try {
    const wert = localStorage.getItem(SPEICHER_SCHLUESSEL);
    return istHintergrund(wert) ? wert : STANDARD_HINTERGRUND;
  } catch {
    return STANDARD_HINTERGRUND;
  }
}

const hoerer = new Set<() => void>();

/** Setzt den Hintergrund sofort und merkt ihn sich (wenn der Browser das erlaubt). */
export function setzeHintergrund(id: HintergrundId) {
  document.documentElement.dataset.hintergrund = id;
  aktueller = id;
  for (const h of hoerer) h();
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, id);
  } catch {
    /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
  }
}

let aktueller: HintergrundId | null = null;

/** Für useSyncExternalStore: Änderungen abonnieren und die aktuelle Wahl lesen. */
export function abonniereHintergrund(h: () => void) {
  hoerer.add(h);
  return () => {
    hoerer.delete(h);
  };
}

export function aktuellerHintergrund(): HintergrundId {
  return (aktueller ??= gespeicherterHintergrund());
}

/**
 * Läuft vor dem ersten Zeichnen (als Inline-Skript im Layout), damit der Hintergrund nicht flackert.
 * Bewusst ohne Importe und mit fester Prüfung – der Wert kommt aus localStorage.
 */
export const HINTERGRUND_SKRIPT = `try{var h=localStorage.getItem(${JSON.stringify(SPEICHER_SCHLUESSEL)});if(${JSON.stringify(HINTERGRUENDE.map((h) => h.id))}.indexOf(h)>=0)document.documentElement.dataset.hintergrund=h}catch(e){}`;
