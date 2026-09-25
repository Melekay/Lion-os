/**
 * Fotos für den Hintergrund im Browser vorbereiten: verkleinern und neu als JPEG speichern.
 * Dabei fallen alle Metadaten weg (z. B. GPS-Standort, Kameramodell) – sie verlassen das Gerät nie.
 */
export const MAX_BREITE = 2560;
export const MAX_HOEHE = 1600;
export const MAX_DATEI_BYTES = 40 * 1024 * 1024;
const QUALITAET = 0.85;

/** Neue Größe mit gleichem Seitenverhältnis, höchstens maxBreite × maxHoehe, nie größer als das Original. */
export function zielGroesse(breite: number, hoehe: number, maxBreite = MAX_BREITE, maxHoehe = MAX_HOEHE): { breite: number; hoehe: number } {
  if (!(breite > 0) || !(hoehe > 0)) return { breite: 0, hoehe: 0 };
  const faktor = Math.min(1, maxBreite / breite, maxHoehe / hoehe);
  return { breite: Math.max(1, Math.round(breite * faktor)), hoehe: Math.max(1, Math.round(hoehe * faktor)) };
}

export class BildFehler extends Error {}

export async function fotoVorbereiten(datei: File): Promise<Blob> {
  if (!datei.type.startsWith("image/")) throw new BildFehler("Bitte eine Bilddatei wählen, zum Beispiel ein JPEG- oder PNG-Foto.");
  if (datei.size > MAX_DATEI_BYTES) throw new BildFehler("Das Foto ist größer als 40 MB. Bitte ein kleineres wählen.");
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
  } catch {
    throw new BildFehler("Dieses Bild kann der Browser nicht öffnen. Probiere ein JPEG- oder PNG-Foto.");
  }
  const { breite, hoehe } = zielGroesse(bild.width, bild.height);
  const leinwand = document.createElement("canvas");
  leinwand.width = breite;
  leinwand.height = hoehe;
  const ctx = leinwand.getContext("2d");
  if (!ctx) throw new BildFehler("Der Browser kann das Bild nicht verkleinern.");
  ctx.drawImage(bild, 0, 0, breite, hoehe);
  bild.close();
  const blob = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, "image/jpeg", QUALITAET));
  if (!blob) throw new BildFehler("Das Bild konnte nicht umgewandelt werden.");
  return blob;
}
