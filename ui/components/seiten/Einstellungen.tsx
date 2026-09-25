"use client";

import { ExternalLink, KeyRound, LogOut, Monitor, RefreshCw, Server, Smartphone, Users } from "lucide-react";
import { useId, useState } from "react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { zeitpunkt } from "@/lib/format";
import { geraetText, istMobil } from "@/lib/geraet";
import { MIN_LAENGE, passwortPruefen } from "@/lib/passwort";
import type { EinstellungenAntwort, SitzungsAnsicht } from "@/lib/typen";
import { useSitzung } from "../Sitzung";
import { Feld, Hinweis, Knopf, Lader, SeitenKopf, StatusPille } from "../ui";

function Abschnitt({ titel, icon: Icon, text, children }: { titel: string; icon: typeof Server; text?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-karte border border-white/[0.06] bg-flaeche/80 p-5 shadow-karte backdrop-blur-md">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-flaeche-2" aria-hidden="true">
          <Icon className="h-5 w-5 text-gold" />
        </span>
        <div>
          <h2 id={id} className="text-lg font-semibold">
            {titel}
          </h2>
          {text && <p className="text-sm text-gedaempft">{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function DieseBox({ e }: { e: EinstellungenAntwort }) {
  const { setBoxName } = useSitzung();
  const [name, setName] = useState(e.boxName);
  const [meldung, setMeldung] = useState<{ ton: "gruen" | "rot"; text: string } | null>(null);
  const [sendet, setSendet] = useState(false);
  const adressen = e.adressen.filter((a) => a !== "localhost");

  return (
    <Abschnitt titel="Diese Box" icon={Server} text="Name, Version und Adressen deiner Lion OS Box.">
      <form
        className="space-y-4"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setSendet(true);
          setMeldung(null);
          try {
            const neu = await lion.einstellungenSpeichern({ boxName: name });
            setName(neu.boxName);
            setBoxName(neu.boxName);
            setMeldung({ ton: "gruen", text: "Name gespeichert." });
          } catch (err) {
            setMeldung({ ton: "rot", text: err instanceof Error ? err.message : "Speichern fehlgeschlagen." });
          } finally {
            setSendet(false);
          }
        }}
      >
        <Feld
          id="boxname"
          label="Name der Box"
          maxLength={40}
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          hilfe="Erscheint oben neben dem Logo, z. B. „Wohnzimmer“ oder „Büro“."
        />
        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}
        <Knopf type="submit" art="rahmen" laedt={sendet} disabled={!name.trim()}>
          Speichern
        </Knopf>
      </form>

      <dl className="mt-6 space-y-4 border-t border-white/[0.06] pt-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gedaempft">Version</dt>
          <dd className="font-mono">{e.version}</dd>
        </div>
        <div className="space-y-2">
          <dt className="text-gedaempft">Im Heimnetz erreichbar unter</dt>
          <dd>
            <ul className="space-y-1.5">
              {adressen.length === 0 && <li className="text-gedaempft">Keine Adressen bekannt.</li>}
              {adressen.map((a) => (
                <li key={a}>
                  <a
                    href={`https://${a}`}
                    className="inline-flex items-center gap-1.5 break-all font-mono text-gold hover:text-gold-hell"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    https://{a} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">(neuer Tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </Abschnitt>
  );
}

function PasswortAendern({ onGeaendert }: { onGeaendert: () => void }) {
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<{ ton: "gruen" | "rot"; text: string } | null>(null);
  const pruefung = passwortPruefen(neu, wiederholung);
  const zeigen = gesendet || wiederholung.length > 0;

  return (
    <Abschnitt titel="Passwort ändern" icon={KeyRound} text="Danach werden alle anderen Geräte abgemeldet.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (ev) => {
          ev.preventDefault();
          setGesendet(true);
          setMeldung(null);
          if (!alt || !pruefung.ok) return;
          setSendet(true);
          try {
            const r = await lion.passwortAendern({ altesPasswort: alt, neuesPasswort: neu });
            setAlt("");
            setNeu("");
            setWiederholung("");
            setGesendet(false);
            setMeldung({
              ton: "gruen",
              text:
                r.abgemeldet === 0
                  ? "Passwort geändert."
                  : `Passwort geändert. ${r.abgemeldet} ${r.abgemeldet === 1 ? "anderes Gerät wurde" : "andere Geräte wurden"} abgemeldet.`,
            });
            onGeaendert();
          } catch (err) {
            setMeldung({ ton: "rot", text: err instanceof Error ? err.message : "Ändern fehlgeschlagen." });
          } finally {
            setSendet(false);
          }
        }}
      >
        <Feld
          id="alt"
          label="Bisheriges Passwort"
          type="password"
          autoComplete="current-password"
          value={alt}
          onChange={(ev) => setAlt(ev.target.value)}
          fehler={gesendet && !alt ? "Bitte das bisherige Passwort eingeben." : null}
        />
        <Feld
          id="neu"
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          value={neu}
          onChange={(ev) => setNeu(ev.target.value)}
          hilfe={neu.length < MIN_LAENGE ? `Mindestens ${MIN_LAENGE} Zeichen. Noch ${MIN_LAENGE - neu.length}.` : "Lang genug."}
          fehler={zeigen ? pruefung.passwort : null}
        />
        <Feld
          id="neu-wiederholen"
          label="Neues Passwort wiederholen"
          type="password"
          autoComplete="new-password"
          value={wiederholung}
          onChange={(ev) => setWiederholung(ev.target.value)}
          fehler={zeigen ? pruefung.wiederholung : null}
        />
        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}
        <Knopf type="submit" laedt={sendet}>
          Passwort ändern
        </Knopf>
      </form>
    </Abschnitt>
  );
}

function Geraete({ sitzungen, neuLaden }: { sitzungen: SitzungsAnsicht[] | undefined; neuLaden: () => void }) {
  const [sendet, setSendet] = useState<number | "alle" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const andere = sitzungen?.filter((s) => !s.aktuell).length ?? 0;

  async function abmelden(id?: number) {
    setSendet(id ?? "alle");
    setFehler(null);
    try {
      await lion.sitzungenAbmelden(id);
      neuLaden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Abmelden fehlgeschlagen.");
    } finally {
      setSendet(null);
    }
  }

  return (
    <Abschnitt titel="Angemeldete Geräte" icon={Users} text="Unbekanntes Gerät dabei? Melde es ab und ändere dein Passwort.">
      {!sitzungen ? (
        <Lader text="Lade Geräte …" />
      ) : (
        <>
          <ul className="divide-y divide-white/[0.06]">
            {sitzungen.map((s) => {
              const Icon = istMobil(s.geraet) ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3.5">
                  <Icon className="h-5 w-5 shrink-0 text-gedaempft" aria-hidden="true" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {geraetText(s.geraet)}
                      {s.aktuell && <StatusPille ton="gruen">Dieses Gerät</StatusPille>}
                    </p>
                    <p className="text-xs text-gedaempft">
                      {s.ip ? <span className="font-mono">{s.ip}</span> : "IP unbekannt"} ·{" "}
                      {s.erstelltAm ? `angemeldet seit ${zeitpunkt(s.erstelltAm)}` : "Anmeldezeit unbekannt"}
                    </p>
                  </div>
                  {!s.aktuell && (
                    <Knopf art="leise" laedt={sendet === s.id} onClick={() => abmelden(s.id)} aria-label={`${geraetText(s.geraet)} abmelden`}>
                      <LogOut className="h-4 w-4" aria-hidden="true" /> Abmelden
                    </Knopf>
                  )}
                </li>
              );
            })}
          </ul>
          {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
          <Knopf art="gefahr" className="mt-4" disabled={andere === 0} laedt={sendet === "alle"} onClick={() => abmelden()}>
            Alle anderen Geräte abmelden
          </Knopf>
        </>
      )}
    </Abschnitt>
  );
}

export function Einstellungen() {
  const einstellungen = useAbfrage(lion.einstellungen, 0);
  const sitzungen = useAbfrage(lion.sitzungen, 30_000);

  return (
    <>
      <SeitenKopf titel="Einstellungen" text="Deine Box, dein Konto und wer gerade angemeldet ist." />
      {einstellungen.fehler && <Hinweis ton="rot">{einstellungen.fehler}</Hinweis>}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          {einstellungen.daten ? <DieseBox e={einstellungen.daten} /> : !einstellungen.fehler && <Lader text="Lade Einstellungen …" />}
          <Abschnitt titel="Updates" icon={RefreshCw}>
            <p className="text-sm leading-relaxed text-text/90">
              Updates per Knopfdruck kommen in einer späteren Version. Bis dahin auf dem Server im Lion-OS-Ordner:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-feld border border-white/[0.06] bg-nacht/70 p-3 font-mono text-xs">
              git pull{"\n"}sudo ./installer/install.sh
            </pre>
            <p className="mt-2 text-xs text-gedaempft">Deine Einstellungen, Apps und Daten bleiben dabei erhalten.</p>
          </Abschnitt>
        </div>
        <div className="space-y-5">
          <PasswortAendern onGeaendert={() => void sitzungen.neuLaden()} />
          <Geraete sitzungen={sitzungen.daten?.sitzungen} neuLaden={() => void sitzungen.neuLaden()} />
        </div>
      </div>
    </>
  );
}
