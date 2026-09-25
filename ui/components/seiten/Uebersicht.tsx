"use client";

import { ArrowRight, Cpu, ExternalLink, HardDrive, MemoryStick, Thermometer } from "lucide-react";
import Link from "next/link";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { besteAdresse, statusAnzeige } from "@/lib/apps";
import { useHostname, useStunde } from "@/lib/browser";
import { AMPEL_TEXT, begruessung, dauer, kennzahlen } from "@/lib/format";
import type { Ampel } from "@/lib/typen";
import { useSitzung } from "../Sitzung";
import { Hinweis, Karte, Lader, Messbalken, StatusPille } from "../ui";

const AMPEL_STIL: Record<Ampel, { ring: string; punkt: string }> = {
  gruen: { ring: "border-gruen/30 bg-gruen-flaeche/60", punkt: "bg-gruen shadow-[0_0_24px_4px] shadow-gruen/40" },
  gelb: { ring: "border-gelb/40 bg-gelb-flaeche/70", punkt: "bg-gelb shadow-[0_0_24px_4px] shadow-gelb/40" },
  rot: { ring: "border-rot/40 bg-rot-flaeche/70", punkt: "bg-rot shadow-[0_0_24px_4px] shadow-rot/40" },
};

function Kachel({
  titel,
  icon: Icon,
  wert,
  detail,
  children,
}: {
  titel: string;
  icon: typeof Cpu;
  wert: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <Karte as="article" className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gedaempft">{titel}</h3>
        <Icon className="h-4.5 w-4.5 text-gold" aria-hidden="true" />
      </div>
      <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">{wert}</p>
      {children}
      <p className="text-sm text-gedaempft">{detail}</p>
    </Karte>
  );
}

export function Uebersicht() {
  const { name } = useSitzung();
  const system = useAbfrage(lion.system, 10_000);
  const apps = useAbfrage(lion.apps, 15_000);
  const stunde = useStunde();
  const hostname = useHostname();
  const gruss = stunde === null ? "Hallo" : begruessung(stunde);

  const s = system.daten;
  const k = s ? kennzahlen(s) : null;
  const installiert = apps.daten?.apps.filter((a) => a.installiert) ?? [];

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">Übersicht</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {gruss}, <span className="text-gold-verlauf">{name}</span>
        </h1>
        <p className="text-gedaempft">{s ? `Lion OS läuft seit ${dauer(s.laufzeitS)}` : "Systemstatus wird geladen …"}</p>
      </header>

      {system.fehler && <Hinweis ton="rot" titel="Systemstatus nicht verfügbar">{system.fehler}</Hinweis>}

      {!s || !k ? (
        !system.fehler && <Lader text="Messe Systemwerte …" />
      ) : (
        <>
          <section aria-labelledby="zustand" className={`einblenden rounded-karte border p-6 ${AMPEL_STIL[s.ampel].ring}`}>
            <div className="flex items-start gap-5">
              <span className={`mt-1.5 h-4 w-4 shrink-0 rounded-full ${AMPEL_STIL[s.ampel].punkt}`} aria-hidden="true" />
              <div className="space-y-2">
                <h2 id="zustand" className="text-xl font-semibold">
                  {AMPEL_TEXT[s.ampel].titel}
                </h2>
                <p className="text-text/85">{AMPEL_TEXT[s.ampel].text}</p>
                {s.hinweise.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {s.hinweise.map((h) => (
                      <li key={h.text} className="flex gap-2 text-sm">
                        <span className={h.stufe === "rot" ? "text-rot" : "text-gelb"} aria-hidden="true">
                          ●
                        </span>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="messwerte" className="space-y-4">
            <h2 id="messwerte" className="text-lg font-semibold">
              Messwerte
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
              <Kachel titel="Prozessor" icon={Cpu} wert={k.cpu.wert} detail={k.cpu.detail}>
                <Messbalken anteil={k.cpu.anteil} ton={k.cpu.ton} label="Prozessor-Auslastung" />
              </Kachel>
              <Kachel titel="Arbeitsspeicher" icon={MemoryStick} wert={k.ram.wert} detail={k.ram.detail}>
                <Messbalken anteil={k.ram.anteil} ton={k.ram.ton} label="Arbeitsspeicher belegt" />
              </Kachel>
              {k.speicher.map((sp) => (
                <Kachel key={sp.pfad} titel={`Speicher ${sp.pfad}`} icon={HardDrive} wert={sp.wert} detail={sp.detail}>
                  <Messbalken anteil={sp.anteil} ton={sp.ton} label={`Speicher ${sp.pfad} belegt`} />
                </Kachel>
              ))}
              <Kachel
                titel="Temperatur"
                icon={Thermometer}
                wert={k.temperatur?.wert ?? "–"}
                detail={k.temperatur?.detail ?? "Kein Sensor gefunden"}
              >
                {k.temperatur && <Messbalken anteil={k.temperatur.anteil} ton={k.temperatur.ton} label="Temperatur" />}
              </Kachel>
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="deine-apps" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="deine-apps" className="text-lg font-semibold">
            Deine Apps
          </h2>
          <Link href="/apps/" className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-gold hover:text-gold-hell">
            Alle Apps <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {apps.fehler && <Hinweis ton="rot">{apps.fehler}</Hinweis>}
        {apps.daten && installiert.length === 0 && (
          <Karte className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="font-semibold">Noch keine App installiert.</p>
              <p className="text-sm text-gedaempft">Starte mit Uptime Kuma: Es überwacht deine Dienste und meldet Ausfälle.</p>
            </div>
            <Link href="/apps/" className="inline-flex min-h-11 items-center gap-2 rounded-feld bg-gold px-4 text-sm font-semibold text-auf-gold hover:bg-gold-hell">
              Zu den Apps <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Karte>
        )}
        {installiert.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {installiert.map((a) => {
              const st = statusAnzeige(a);
              const adresse = a.installiert?.status === "laeuft" ? besteAdresse(a.installiert.adressen, hostname) : null;
              return (
                <li key={a.id}>
                  <Karte as="div" className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate font-semibold">{a.name}</p>
                      <StatusPille ton={st.ton}>{st.text}</StatusPille>
                    </div>
                    {adresse && (
                      <a
                        href={adresse}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-feld border border-linie-hell px-3 text-sm font-semibold hover:border-gold/60"
                      >
                        Öffnen <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">(neuer Tab)</span>
                      </a>
                    )}
                  </Karte>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
