/**
 * Wählbarer Hintergrund der Oberfläche. Die Wahl gilt nur in diesem Browser (localStorage) –
 * jedes Gerät darf seinen eigenen haben. Die Farbverläufe stehen in app/globals.css (--hg-…).
 * Ein eigenes Foto liegt auf der Box (lion-core); hier merkt sich der Browser nur dessen Adresse.
 */
export const HINTERGRUENDE = [
  { id: "sonnenuntergang", name: "Sonnenuntergang" },
  { id: "ozean", name: "Ozean" },
  { id: "aurora", name: "Polarlicht" },
  { id: "nebel", name: "Nebel" },
] as const;

export type HintergrundId = (typeof HINTERGRUENDE)[number]["id"] | "foto";

export const STANDARD_HINTERGRUND: HintergrundId = "sonnenuntergang";
export const SPEICHER_SCHLUESSEL = "lion-hintergrund";
export const FOTO_SCHLUESSEL = "lion-hintergrund-foto";

/** Nur diese Foto-Adressen landen im CSS: das Foto von lion-core oder (in der Demo) ein eingebettetes JPEG. */
const FOTO_ADRESSE = /^(\/api\/hintergrund\?v=\d+|data:image\/jpeg;base64,[A-Za-z0-9+/]+=*)$/;

export function istHintergrund(wert: unknown): wert is HintergrundId {
  return wert === "foto" || HINTERGRUENDE.some((h) => h.id === wert);
}

export function istFotoAdresse(wert: unknown): wert is string {
  return typeof wert === "string" && FOTO_ADRESSE.test(wert);
}

function lies(schluessel: string): string | null {
  try {
    return localStorage.getItem(schluessel);
  } catch {
    return null;
  }
}

function schreib(schluessel: string, wert: string | null) {
  try {
    if (wert === null) localStorage.removeItem(schluessel);
    else localStorage.setItem(schluessel, wert);
  } catch {
    /* ohne Speicher gilt die Wahl nur bis zum Neuladen */
  }
}

export function gespeicherterHintergrund(): HintergrundId {
  const wert = lies(SPEICHER_SCHLUESSEL);
  if (wert === "foto" && !istFotoAdresse(lies(FOTO_SCHLUESSEL))) return STANDARD_HINTERGRUND;
  return istHintergrund(wert) ? wert : STANDARD_HINTERGRUND;
}

const hoerer = new Set<() => void>();
let aktueller: HintergrundId | null = null;

function melden() {
  for (const h of hoerer) h();
}

/** Setzt den Hintergrund sofort und merkt ihn sich (wenn der Browser das erlaubt). */
export function setzeHintergrund(id: HintergrundId) {
  document.documentElement.dataset.hintergrund = id;
  aktueller = id;
  schreib(SPEICHER_SCHLUESSEL, id);
  melden();
}

/** Adresse des eigenen Fotos setzen (null: es gibt keins). Unbekannte Adressen werden ignoriert. */
export function setzeFotoAdresse(adresse: string | null) {
  const gueltig = istFotoAdresse(adresse) ? adresse : null;
  schreib(FOTO_SCHLUESSEL, gueltig);
  if (gueltig) document.documentElement.style.setProperty("--hg-foto", `url("${gueltig}")`);
  else document.documentElement.style.removeProperty("--hg-foto");
}

/**
 * Abgleich mit dem Stand der Box (nach dem Laden der Einstellungen): neue Version übernehmen,
 * und wenn das Foto gelöscht wurde, zurück zum Standard-Verlauf.
 */
export function gleicheFotoAb(adresse: string | null | undefined) {
  setzeFotoAdresse(adresse ?? null);
  if (!istFotoAdresse(adresse) && gespeicherteWahlIstFoto()) setzeHintergrund(STANDARD_HINTERGRUND);
}

function gespeicherteWahlIstFoto() {
  return lies(SPEICHER_SCHLUESSEL) === "foto" || document.documentElement.dataset.hintergrund === "foto";
}

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
 * Bewusst ohne Importe und mit fester Prüfung – die Werte kommen aus localStorage.
 */
export const HINTERGRUND_SKRIPT = `try{var d=document.documentElement,h=localStorage.getItem(${JSON.stringify(SPEICHER_SCHLUESSEL)}),f=localStorage.getItem(${JSON.stringify(FOTO_SCHLUESSEL)});if(h==="foto"){if(f&&${FOTO_ADRESSE.toString()}.test(f)){d.style.setProperty("--hg-foto",'url("'+f+'")');d.dataset.hintergrund=h}}else if(${JSON.stringify(HINTERGRUENDE.map((x) => x.id))}.indexOf(h)>=0)d.dataset.hintergrund=h}catch(e){}`;
