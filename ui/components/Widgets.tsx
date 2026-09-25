"use client";

import { ArrowDown, ArrowUp, ChevronRight, HardDrive } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useJetzt } from "@/lib/browser";
import { aktionText, AMPEL_TEXT, dauer, datumLang, ERGEBNIS_TEXT, kennzahlen, speicherName, speicherZustand, uhrzeit, zahl, zeitpunkt } from "@/lib/format";
import { linie, rate, type Verlauf } from "@/lib/netz";
import type { Ampel, AuditEintrag, Systemstatus } from "@/lib/typen";
import { Messbalken, StatusPille } from "./ui";

/* ---------------------------------------------------------------------------
   Widgets der Startseite (linke Spalte) – bewusst schlicht wie bei ZimaOS:
   ein Thema pro Kachel, große Zahlen, Details erst beim Klick.
   --------------------------------------------------------------------------- */

export function Widget({ titel, aktion, children, className = "" }: { titel?: string; aktion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={titel}
      className={`rounded-karte border border-white/[0.06] bg-flaeche/80 p-5 shadow-karte backdrop-blur-md ${className}`}
    >
      {titel && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{titel}</h2>
          {aktion}
        </div>
      )}
      {children}
    </section>
  );
}

export function UhrWidget() {
  const jetzt = useJetzt();
  const d = jetzt === null ? null : new Date(jetzt);
  return (
    <Widget>
      <p className="font-display text-4xl font-semibold tracking-tight tabular-nums">{d ? uhrzeit(d) : "––:––"}</p>
      <p className="mt-1 text-sm text-gedaempft">{d ? datumLang(d) : " "}</p>
    </Widget>
  );
}

const RING_FARBE: Record<Ampel, string> = { gruen: "stroke-gold", gelb: "stroke-gelb", rot: "stroke-rot" };

/** Ring-Anzeige wie bei ZimaOS, mit role="meter" für Screenreader. */
function Ring({ anteil, ton, wert, name, label, unter }: { anteil: number; ton: Ampel; wert: string; name: string; label: string; unter: string }) {
  const r = 34;
  const umfang = 2 * Math.PI * r;
  const bogen = umfang * 0.75; // offener Ring (270°), unten offen
  const prozent = Math.round(anteil * 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={prozent}
        className="relative h-24 w-24"
      >
        <svg viewBox="0 0 80 80" className="h-full w-full rotate-[135deg]" aria-hidden="true">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-flaeche-3" strokeDasharray={`${bogen} ${umfang}`} />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className={`${RING_FARBE[ton]} transition-[stroke-dasharray] duration-700`}
            strokeDasharray={`${Math.max(bogen * anteil, 0.5)} ${umfang}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center pt-1 font-display text-2xl font-semibold tabular-nums">{wert}</span>
      </div>
      <span className="text-sm font-semibold">{name}</span>
      <span className="text-xs text-gedaempft">{unter}</span>
    </div>
  );
}

const AMPEL_PUNKT: Record<Ampel, string> = { gruen: "bg-gruen", gelb: "bg-gelb", rot: "bg-rot" };

export function SystemWidget({ s }: { s: Systemstatus }) {
  const k = kennzahlen(s);
  return (
    <Widget titel="System">
      <div className="grid grid-cols-2 gap-2">
        <Ring anteil={k.cpu.anteil} ton={k.cpu.ton} wert={k.cpu.wert.replace(" ", "")} name="CPU" label="Prozessor-Auslastung" unter={k.temperatur ? k.temperatur.wert : `${s.cpuKerne} Kerne`} />
        <Ring anteil={k.ram.anteil} ton={k.ram.ton} wert={k.ram.wert.replace(" ", "")} name="RAM" label="Arbeitsspeicher belegt" unter={`${zahl(k.ramGesamtGb, 0)} GB`} />
      </div>
      <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${AMPEL_PUNKT[s.ampel]}`} aria-hidden="true" />
          {AMPEL_TEXT[s.ampel].titel}
        </p>
        {s.hinweise.map((h) => (
          <p key={h.text} className="text-text/85">
            {h.text}
          </p>
        ))}
        <p className="text-xs text-gedaempft">Lion OS läuft seit {dauer(s.laufzeitS)}</p>
      </div>
    </Widget>
  );
}

const ZUSTAND_TON = { gruen: "gruen", gelb: "gelb", rot: "rot" } as const;

export function SpeicherWidget({ s }: { s: Systemstatus }) {
  const k = kennzahlen(s);
  return (
    <Widget titel="Speicher">
      <ul className="space-y-5">
        {k.speicher.map((sp) => (
          <li key={sp.pfad} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-stone-300 to-stone-500 shadow-karte" aria-hidden="true">
                <HardDrive className="h-5.5 w-5.5 text-stone-900" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold" title={sp.pfad}>
                    {speicherName(sp.pfad)}
                  </span>
                  <StatusPille ton={ZUSTAND_TON[sp.ton]}>{speicherZustand(sp.ton)}</StatusPille>
                </div>
                <p className="mt-1 tabular-nums">
                  {zahl(sp.belegtGb)} von {zahl(sp.gesamtGb)} GB belegt
                </p>
              </div>
            </div>
            <Messbalken anteil={sp.anteil} ton={sp.ton} label={`Speicher ${speicherName(sp.pfad)} belegt`} />
          </li>
        ))}
      </ul>
    </Widget>
  );
}

export function NetzwerkWidget({ verlauf }: { verlauf: Verlauf }) {
  const p = verlauf.punkte;
  const letzter = p.at(-1);
  const max = Math.max(1, ...p.map((x) => Math.max(x.runter, x.hoch)));
  const runter = linie(
    p.map((x) => x.runter),
    max,
  );
  const hoch = linie(
    p.map((x) => x.hoch),
    max,
  );
  return (
    <Widget titel="Netzwerk" aktion={verlauf.letzter && <code className="text-xs text-gedaempft">{verlauf.letzter.schnittstelle}</code>}>
      {!verlauf.letzter ? (
        <p className="text-sm text-gedaempft">Keine Netzwerkdaten verfügbar.</p>
      ) : (
        <>
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="h-24 w-full"
            role="img"
            aria-label={`Netzwerk-Verlauf. Empfangen ${rate(letzter?.runter ?? 0)}, gesendet ${rate(letzter?.hoch ?? 0)}.`}
          >
            {[10, 20, 30].map((y) => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-white/[0.06]" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}
            {runter && <polyline points={runter} fill="none" className="stroke-gold" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
            {hoch && <polyline points={hoch} fill="none" className="stroke-sky-400" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
          {p.length < 2 && <p className="text-xs text-gedaempft">Messe … der Verlauf erscheint in wenigen Sekunden.</p>}
          <p className="mt-2 flex gap-5 text-sm tabular-nums">
            <span className="flex items-center gap-1.5">
              <ArrowDown className="h-4 w-4 text-gold" aria-hidden="true" />
              <span className="sr-only">Empfangen:</span>
              {rate(letzter?.runter ?? 0)}
            </span>
            <span className="flex items-center gap-1.5">
              <ArrowUp className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <span className="sr-only">Gesendet:</span>
              {rate(letzter?.hoch ?? 0)}
            </span>
          </p>
        </>
      )}
    </Widget>
  );
}

export function AktivitaetWidget({ eintraege }: { eintraege: AuditEintrag[] | undefined }) {
  return (
    <Widget
      titel="Aktivität"
      aktion={
        <Link href="/protokoll/" className="inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-gold hover:text-gold-hell">
          Protokoll <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      {!eintraege ? (
        <p className="text-sm text-gedaempft">Lade …</p>
      ) : eintraege.length === 0 ? (
        <p className="text-sm text-gedaempft">Noch keine Einträge.</p>
      ) : (
        <ul className="space-y-3">
          {eintraege.slice(0, 3).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {aktionText(e.aktion)}
                  {e.ziel && <span className="font-normal text-gedaempft"> · {e.ziel}</span>}
                </p>
                <p className="font-mono text-xs text-gedaempft">{zeitpunkt(e.zeit)}</p>
              </div>
              <StatusPille ton={ERGEBNIS_TEXT[e.ergebnis].ton}>{ERGEBNIS_TEXT[e.ergebnis].text}</StatusPille>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
