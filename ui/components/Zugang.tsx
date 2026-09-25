import { Logo } from "./Logo";

/** Rahmen für Anmeldung und Einrichtung: zentrierte Karte, ruhiger Hintergrund. */
export function Zugang({ titel, text, children }: { titel: string; text: React.ReactNode; children: React.ReactNode }) {
  return (
    <main id="inhalt" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="einblenden w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="rounded-karte border border-linie bg-flaeche/90 p-6 shadow-karte backdrop-blur sm:p-8">
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold">{titel}</h1>
            <div className="text-sm leading-relaxed text-gedaempft">{text}</div>
          </div>
          {children}
        </div>
        <p className="text-center text-xs text-gedaempft">Nur im Heimnetz erreichbar · Verbindung verschlüsselt</p>
      </div>
    </main>
  );
}
