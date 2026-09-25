"use client";

import { ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Geschuetzt, useSitzung } from "./Sitzung";

function Kopfzeile() {
  const { name, boxName, abmelden } = useSitzung();
  const startseite = usePathname() === "/";
  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 pt-5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label={`${boxName === "Lion OS" ? "Lion OS" : `Lion OS ${boxName}`} – Startseite`}>
          <Logo klein />
          {boxName !== "Lion OS" && (
            <span className="hidden max-w-[14rem] truncate border-l border-linie-hell pl-2.5 text-sm font-semibold text-gedaempft sm:inline">{boxName}</span>
          )}
        </Link>
        {!startseite && (
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-glas bg-flaeche/70 px-3.5 text-sm font-semibold text-gedaempft backdrop-blur hover:border-gold/40 hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Startseite
          </Link>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-full border border-glas bg-flaeche/70 p-1 pl-4 backdrop-blur">
        <span className="max-w-[10rem] truncate text-sm">
          <span className="sr-only">Angemeldet als </span>
          <span className="font-semibold">{name}</span>
        </span>
        <button
          type="button"
          onClick={abmelden}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-gedaempft transition-colors hover:bg-flaeche-3 hover:text-text"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Abmelden
        </button>
      </div>
    </header>
  );
}

/** Rahmen aller Seiten nach der Anmeldung: schlanke Kopfzeile, darunter die volle Fläche – wie ein Schreibtisch. */
export function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <Geschuetzt>
      <Kopfzeile />
      <main id="inhalt" className="einblenden mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </Geschuetzt>
  );
}
