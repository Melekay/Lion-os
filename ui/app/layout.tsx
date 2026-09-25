import type { Metadata, Viewport } from "next";
import { HINTERGRUND_SKRIPT } from "@/lib/hintergrund";
import { bodyFont, displayFont, monoFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lion OS", template: "%s · Lion OS" },
  description: "Dein Heimserver: Apps, Systemstatus und Sicherheit an einem Ort.",
  applicationName: "Lion OS",
  // Die Oberfläche gehört ins Heimnetz, nicht in Suchmaschinen.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c1a4a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* Gewählten Hintergrund vor dem ersten Zeichnen setzen (kein Flackern). */}
        <script dangerouslySetInnerHTML={{ __html: HINTERGRUND_SKRIPT }} />
      </head>
      <body>
        <a
          href="#inhalt"
          className="sr-only z-50 rounded-full bg-gold px-4 py-2 font-semibold text-auf-gold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Zum Inhalt springen
        </a>
        {children}
      </body>
    </html>
  );
}
