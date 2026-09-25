import localFont from "next/font/local";

/**
 * Schriften liegen auf der Box selbst (kein Abruf bei Google – Lion OS funktioniert auch ohne Internet).
 * Space Grotesk für Überschriften, Manrope für Text, JetBrains Mono für Zahlen und Pfade.
 */
export const displayFont = localFont({
  src: "../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-display-face",
  weight: "300 700",
  display: "swap",
});

export const bodyFont = localFont({
  src: "../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-body-face",
  weight: "200 800",
  display: "swap",
});

export const monoFont = localFont({
  src: "../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono-face",
  weight: "100 800",
  display: "swap",
  preload: false,
});
