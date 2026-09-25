"use client";

import { Gauge, LayoutGrid, LogOut, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { Geschuetzt, useSitzung } from "./Sitzung";

const NAVIGATION = [
  { href: "/", text: "Übersicht", icon: Gauge },
  { href: "/apps/", text: "Apps", icon: LayoutGrid },
  { href: "/protokoll/", text: "Protokoll", icon: ScrollText },
] as const;

function Navigation({ quer = false }: { quer?: boolean }) {
  const pfad = usePathname();
  const aktiv = (href: string) => (href === "/" ? pfad === "/" : pfad.startsWith(href.replace(/\/$/, "")));
  return (
    <ul className={quer ? "flex gap-1" : "space-y-1"}>
      {NAVIGATION.map(({ href, text, icon: Icon }) => (
        <li key={href} className={quer ? "flex-1" : undefined}>
          <Link
            href={href}
            aria-current={aktiv(href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-feld px-3 py-2.5 text-sm font-semibold transition ${
              quer ? "min-h-11 justify-center" : ""
            } ${aktiv(href) ? "bg-flaeche-3 text-text shadow-karte" : "text-gedaempft hover:bg-flaeche-2 hover:text-text"}`}
          >
            <Icon className={`h-4.5 w-4.5 ${aktiv(href) ? "text-gold" : ""}`} aria-hidden="true" />
            {text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Benutzer() {
  const { name, abmelden } = useSitzung();
  return (
    <div className="flex items-center justify-between gap-2 rounded-feld border border-linie bg-flaeche-2/60 p-2 pl-3">
      <span className="min-w-0 truncate text-sm">
        <span className="sr-only">Angemeldet als </span>
        <span className="font-semibold">{name}</span>
      </span>
      <button
        type="button"
        onClick={abmelden}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-gedaempft transition hover:bg-flaeche-3 hover:text-text"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Abmelden
      </button>
    </div>
  );
}

/** Rahmen aller Seiten nach der Anmeldung: Seitenleiste (Desktop) bzw. Kopfzeile + Reiter (Handy). */
export function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <Geschuetzt>
      <div className="lg:grid lg:min-h-dvh lg:grid-cols-[16rem_1fr]">
        <aside className="hidden border-r border-linie bg-nacht/60 backdrop-blur lg:flex lg:flex-col lg:gap-8 lg:p-5">
          <Link href="/" className="rounded-lg px-1 py-1">
            <Logo />
          </Link>
          <nav aria-label="Hauptnavigation">
            <Navigation />
          </nav>
          <div className="mt-auto">
            <Benutzer />
          </div>
        </aside>

        <div className="sticky top-0 z-20 border-b border-linie bg-nacht/85 px-4 pb-2 pt-3 backdrop-blur lg:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Link href="/" className="rounded-lg">
              <Logo klein />
            </Link>
            <BenutzerKurz />
          </div>
          <nav aria-label="Hauptnavigation">
            <Navigation quer />
          </nav>
        </div>

        <main id="inhalt" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {children}
        </main>
      </div>
    </Geschuetzt>
  );
}

function BenutzerKurz() {
  const { abmelden } = useSitzung();
  return (
    <button
      type="button"
      onClick={abmelden}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-gedaempft hover:bg-flaeche-2 hover:text-text"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Abmelden
    </button>
  );
}
