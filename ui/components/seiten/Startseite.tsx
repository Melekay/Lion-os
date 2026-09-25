"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { besteAdresse, beschaeftigt, type LiveAnzeige, liveAnzeige, statusAnzeige, type Ton } from "@/lib/apps";
import { backupZustand } from "@/lib/backup";
import { useHostname, useJetzt } from "@/lib/browser";
import { LEERER_VERLAUF, neuerVerlauf } from "@/lib/netz";
import type { AppAnsicht } from "@/lib/typen";
import { AppSymbol } from "../AppSymbol";
import { Hinweis } from "../ui";
import { AktivitaetWidget, NetzwerkWidget, SpeicherWidget, SystemWidget, UhrWidget, Widget } from "../Widgets";

const PUNKT: Record<Ton, string> = {
  gruen: "bg-gruen",
  gelb: "bg-gelb",
  rot: "bg-rot",
  neutral: "bg-gedaempft",
  arbeitet: "bg-gold text-akzent puls",
};

const KACHEL =
  "group relative flex h-full min-h-38 flex-col items-center justify-center gap-3 rounded-karte border border-glas bg-flaeche/70 p-3 text-center shadow-karte backdrop-blur-md transition hover:-translate-y-0.5 hover:border-gold/40 hover:bg-flaeche-2/90 focus-visible:-translate-y-0.5";

function Kachel({ href, extern, children, label }: { href: string; extern?: boolean; children: React.ReactNode; label: string }) {
  if (extern) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={KACHEL} aria-label={`${label} öffnen (neuer Tab)`}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={KACHEL} aria-label={label}>
      {children}
    </Link>
  );
}

/** Mini-Balken für Live-Werte in der Kachel (rein optisch – die Werte stehen im Namen der Kachel). */
function MiniWert({ name, text, anteil, farbe }: { name: string; text: string; anteil: number; farbe: string }) {
  return (
    <span className="block w-full">
      <span className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
        <span className="font-semibold uppercase tracking-wider text-gedaempft">{name}</span>
        <span className="font-semibold tabular-nums">{text}</span>
      </span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-flaeche-3">
        <span className={`block h-full rounded-full bg-linear-to-r transition-[width] duration-700 ${farbe}`} style={{ width: `${Math.max(anteil * 100, 3)}%` }} />
      </span>
    </span>
  );
}

function AppKachel({ app, hostname, live }: { app: AppAnsicht; hostname: string; live: LiveAnzeige | null }) {
  const st = statusAnzeige(app);
  const laeuft = app.installiert?.status === "laeuft";
  const adresse = laeuft ? besteAdresse(app.installiert!.adressen, hostname) : null;
  const werte = laeuft ? live : null;
  const name = werte ? `${app.name} (${werte.satz})` : app.name;
  return (
    <li>
      <Kachel
        href={adresse ?? `/apps/#${app.id}`}
        extern={Boolean(adresse)}
        label={adresse ? name : `${name} – ${st.text}, im App Store verwalten`}
      >
        <AppSymbol id={app.id} kategorie={app.kategorie} logo={app.logo} groesse={werte ? "klein" : "gross"} />
        <span className="line-clamp-2 text-sm font-semibold">{app.name}</span>
        {werte && (
          <span className="block w-full space-y-1.5 px-1" aria-hidden="true">
            <MiniWert name="RAM" text={werte.ramText} anteil={werte.ramAnteil} farbe="from-emerald-400 to-cyan-400" />
            <MiniWert name="CPU" text={werte.cpuText} anteil={werte.cpuAnteil} farbe="from-fuchsia-400 to-violet-400" />
          </span>
        )}
        <span className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${PUNKT[st.ton]}`} title={st.text} aria-hidden="true" />
      </Kachel>
    </li>
  );
}

export function Startseite() {
  const verlauf = useRef(LEERER_VERLAUF);
  const system = useAbfrage(async () => {
    const s = await lion.system();
    verlauf.current = neuerVerlauf(verlauf.current, s.netzwerk, Date.now());
    return { s, verlauf: verlauf.current };
  }, 5_000);
  const apps = useAbfrage(lion.apps, (d) => (d && beschaeftigt(d.apps) ? 2_000 : 15_000));
  // Live-Werte der laufenden Apps (lion-core fragt Docker höchstens alle 10 s).
  const live = useAbfrage(lion.appRessourcen, 10_000);
  const protokoll = useAbfrage(() => lion.protokoll(3), 30_000);
  const backup = useAbfrage(lion.backup, (d) => (d?.laeuft ? 5_000 : 60_000));
  const jetzt = useJetzt();
  const backupStand = backupZustand(backup.daten, jetzt ?? 0);
  const hostname = useHostname();
  const [suche, setSuche] = useState("");

  const installiert = apps.daten?.apps.filter((a) => a.installiert) ?? [];
  const begriff = suche.trim().toLowerCase();
  const passt = (name: string) => !begriff || name.toLowerCase().includes(begriff);
  const sichtbar = installiert.filter((a) => passt(a.name));

  return (
    <div className="grid gap-6 lg:grid-cols-[21rem_1fr] lg:items-start">
      <h1 className="sr-only">Startseite</h1>

      <div className="order-2 space-y-5 lg:order-1">
        <UhrWidget />
        {system.fehler && <Hinweis ton="rot" titel="Systemstatus nicht verfügbar">{system.fehler}</Hinweis>}
        {system.daten ? (
          <>
            <SystemWidget s={system.daten.s} />
            <SpeicherWidget s={system.daten.s} />
            <NetzwerkWidget verlauf={system.daten.verlauf} />
          </>
        ) : (
          !system.fehler && (
            <Widget titel="System">
              <p className="text-sm text-gedaempft">Messe Systemwerte …</p>
            </Widget>
          )
        )}
        <AktivitaetWidget eintraege={protokoll.daten?.eintraege} />
      </div>

      <section aria-labelledby="apps-titel" className="order-1 space-y-5 lg:order-2">
        <label className="relative block">
          <span className="sr-only">Apps suchen</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gedaempft" aria-hidden="true" />
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Apps suchen …"
            className="block min-h-13 w-full rounded-karte border border-glas bg-flaeche/80 pl-11 pr-4 text-base shadow-karte backdrop-blur-md placeholder:text-gedaempft focus:border-gold/60 focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between">
          <h2 id="apps-titel" className="text-xl font-semibold">
            Apps
          </h2>
          <Link
            href="/apps/"
            aria-label="App hinzufügen"
            title="App hinzufügen"
            className="grid h-10 w-10 place-items-center rounded-full text-gedaempft transition hover:bg-flaeche-2 hover:text-akzent"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        {apps.fehler && <Hinweis ton="rot">{apps.fehler}</Hinweis>}

        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-4">
          {passt("App Store") && (
            <li>
              <Kachel href="/apps/" label="App Store">
                <AppSymbol id="app-store" />
                <span className="text-sm font-semibold">App Store</span>
              </Kachel>
            </li>
          )}
          {sichtbar.map((a) => (
            <AppKachel key={a.id} app={a} hostname={hostname} live={liveAnzeige(live.daten?.apps[a.id], system.daten?.s.ramGesamtMb)} />
          ))}
          {passt("Backup") && (
            <li>
              <Kachel href="/backup/" label={`Backup – ${backupStand.text}`}>
                <AppSymbol id="backup" />
                <span className="text-sm font-semibold">Backup</span>
                {backup.daten && <span className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${PUNKT[backupStand.ton]}`} title={backupStand.text} aria-hidden="true" />}
              </Kachel>
            </li>
          )}
          {passt("Protokoll") && (
            <li>
              <Kachel href="/protokoll/" label="Protokoll">
                <AppSymbol id="protokoll" />
                <span className="text-sm font-semibold">Protokoll</span>
              </Kachel>
            </li>
          )}
          {passt("Einstellungen") && (
            <li>
              <Kachel href="/einstellungen/" label="Einstellungen">
                <AppSymbol id="einstellungen" />
                <span className="text-sm font-semibold">Einstellungen</span>
              </Kachel>
            </li>
          )}
        </ul>

        {apps.daten && installiert.length === 0 && !begriff && (
          <p className="rounded-karte border border-dashed border-linie-hell p-5 text-sm text-gedaempft">
            Noch keine App installiert. Öffne den <strong className="text-text">App Store</strong> – zum Beispiel Uptime Kuma: Es überwacht deine Dienste und
            meldet Ausfälle.
          </p>
        )}
        {begriff && sichtbar.length === 0 && !passt("App Store") && !passt("Backup") && !passt("Protokoll") && !passt("Einstellungen") && (
          <p className="text-sm text-gedaempft">Keine App gefunden für „{suche.trim()}“.</p>
        )}
      </section>
    </div>
  );
}
