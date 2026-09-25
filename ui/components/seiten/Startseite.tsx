"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { besteAdresse, beschaeftigt, statusAnzeige, type Ton } from "@/lib/apps";
import { useHostname } from "@/lib/browser";
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
  arbeitet: "bg-gold text-gold puls",
};

const KACHEL =
  "group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-karte border border-white/[0.06] bg-flaeche/70 p-3 text-center shadow-karte backdrop-blur-md transition hover:-translate-y-0.5 hover:border-gold/40 hover:bg-flaeche-2/90 focus-visible:-translate-y-0.5";

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

function AppKachel({ app, hostname }: { app: AppAnsicht; hostname: string }) {
  const st = statusAnzeige(app);
  const adresse = app.installiert?.status === "laeuft" ? besteAdresse(app.installiert.adressen, hostname) : null;
  return (
    <li>
      <Kachel
        href={adresse ?? `/apps/#${app.id}`}
        extern={Boolean(adresse)}
        label={adresse ? app.name : `${app.name} – ${st.text}, im App Store verwalten`}
      >
        <AppSymbol id={app.id} kategorie={app.kategorie} />
        <span className="line-clamp-2 text-sm font-semibold">{app.name}</span>
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
  const protokoll = useAbfrage(() => lion.protokoll(3), 30_000);
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
            className="block min-h-13 w-full rounded-karte border border-white/[0.06] bg-flaeche/80 pl-11 pr-4 text-base shadow-karte backdrop-blur-md placeholder:text-gedaempft focus:border-gold/60 focus:outline-none"
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
            className="grid h-10 w-10 place-items-center rounded-full text-gedaempft transition hover:bg-flaeche-2 hover:text-gold"
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
            <AppKachel key={a.id} app={a} hostname={hostname} />
          ))}
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
          <p className="rounded-karte border border-dashed border-white/10 p-5 text-sm text-gedaempft">
            Noch keine App installiert. Öffne den <strong className="text-text">App Store</strong> – zum Beispiel Uptime Kuma: Es überwacht deine Dienste und
            meldet Ausfälle.
          </p>
        )}
        {begriff && sichtbar.length === 0 && !passt("App Store") && !passt("Protokoll") && !passt("Einstellungen") && (
          <p className="text-sm text-gedaempft">Keine App gefunden für „{suche.trim()}“.</p>
        )}
      </section>
    </div>
  );
}
