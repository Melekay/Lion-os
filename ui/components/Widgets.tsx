"use client";

import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useJetzt } from "@/lib/browser";
import { aktionText, AMPEL_TEXT, dauer, datumLang, ERGEBNIS_TEXT, kennzahlen, speicherName, speicherZustand, uhrzeit, zahl, zeitpunkt } from "@/lib/format";
import { linie, rate, type Verlauf } from "@/lib/netz";
import type { Ampel, AuditEintrag, Systemstatus } from "@/lib/typen";
import { Kennzahl, StatusPille } from "./ui";

/** „24 %“ → „24“, „48 °C“ → „48“ – die Einheit steht in der Kachel kleiner daneben. */
const ohneEinheit = (text: string) => text.replace(/\s*(%|°C)$/, "");

/* ---------------------------------------------------------------------------
   Widgets der Startseite (linke Spalte) – bewusst schlicht wie bei ZimaOS:
   ein Thema pro Kachel, große Zahlen, Details erst beim Klick.
   --------------------------------------------------------------------------- */

export function Widget({ titel, aktion, children, className = "" }: { titel?: string; aktion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={titel}
      className={`rounded-karte border border-glas bg-flaeche/80 p-5 shadow-karte backdrop-blur-md ${className}`}
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

const AMPEL_PUNKT: Record<Ampel, string> = { gruen: "bg-gruen", gelb: "bg-gelb", rot: "bg-rot" };

export function SystemWidget({ s }: { s: Systemstatus }) {
  const k = kennzahlen(s);
  return (
    <Widget titel="System">
      <div className="grid grid-cols-2 gap-3">
        <Kennzahl
          titel="CPU"
          wert={ohneEinheit(k.cpu.wert)}
          einheit="%"
          anteil={k.cpu.anteil}
          ton={k.cpu.ton}
          label="Prozessor-Auslastung"
          chips={[`${s.cpuKerne} ${s.cpuKerne === 1 ? "Kern" : "Kerne"}`]}
        />
        <Kennzahl
          titel="RAM"
          wert={ohneEinheit(k.ram.wert)}
          einheit="%"
          anteil={k.ram.anteil}
          ton={k.ram.ton}
          label="Arbeitsspeicher belegt"
          chips={[`${zahl(k.ramGesamtGb, 0)} GB`]}
        />
        {k.temperatur && (
          <div className="col-span-2">
            <Kennzahl
              titel="Temperatur"
              wert={ohneEinheit(k.temperatur.wert)}
              einheit="°C"
              anteil={k.temperatur.anteil}
              ton={k.temperatur.ton}
              label="Temperatur"
              chips={[k.temperatur.detail]}
            />
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2 border-t border-linie pt-4 text-sm">
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
      <ul className="space-y-3">
        {k.speicher.map((sp) => (
          <li key={sp.pfad}>
            <Kennzahl
              titel={speicherName(sp.pfad)}
              wert={ohneEinheit(sp.wert)}
              einheit="%"
              anteil={sp.anteil}
              ton={sp.ton}
              label={`Speicher ${speicherName(sp.pfad)} belegt`}
              rechts={<StatusPille ton={ZUSTAND_TON[sp.ton]}>{speicherZustand(sp.ton)}</StatusPille>}
              chips={[`${zahl(sp.gesamtGb - sp.belegtGb)} GB frei`, `${zahl(sp.gesamtGb)} GB gesamt`]}
            />
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
              <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-white/[0.08]" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}
            {runter && <polyline points={runter} fill="none" className="stroke-fuchsia-400" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
            {hoch && <polyline points={hoch} fill="none" className="stroke-cyan-300" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
          {p.length < 2 && <p className="text-xs text-gedaempft">Messe … der Verlauf erscheint in wenigen Sekunden.</p>}
          <p className="mt-2 flex gap-5 text-sm tabular-nums">
            <span className="flex items-center gap-1.5">
              <ArrowDown className="h-4 w-4 text-fuchsia-300" aria-hidden="true" />
              <span className="sr-only">Empfangen:</span>
              {rate(letzter?.runter ?? 0)}
            </span>
            <span className="flex items-center gap-1.5">
              <ArrowUp className="h-4 w-4 text-cyan-300" aria-hidden="true" />
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
        <Link href="/protokoll/" className="inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-akzent hover:text-akzent-stark">
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
