import { zahl } from "./format";

/** „2 TB“, „64 GB“, „512 MB“ (Herstellerangabe: 1 GB = 10⁹ Byte, wie auf der Verpackung). */
export function groesseText(bytes: number): string {
  if (!(bytes > 0)) return "–";
  if (bytes >= 1e12) return `${zahl(bytes / 1e12, bytes >= 1e13 ? 0 : 1)} TB`;
  if (bytes >= 1e9) return `${zahl(bytes / 1e9, 0)} GB`;
  return `${zahl(bytes / 1e6, 0)} MB`;
}

/** Liegt ein Backup-Ziel auf einem von lion-helper eingehängten Datenträger? Dann dessen Kennung. */
export function uuidAusZiel(ziel: string | null | undefined): string | null {
  const t = /^\/media\/lion\/([A-Za-z0-9](?:[A-Za-z0-9-]{2,62}[A-Za-z0-9]))(\/|$)/.exec(ziel ?? "");
  return t ? t[1]! : null;
}
