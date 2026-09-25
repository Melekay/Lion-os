"use client";

import { Archive, CalendarClock, Check, Copy, HardDrive, History, KeyRound, RefreshCw, ShieldCheck, Usb } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useAbfrage } from "@/lib/abfrage";
import { ApiFehler, lion } from "@/lib/api";
import { backupZustand, groesse, wannText } from "@/lib/backup";
import { useJetzt } from "@/lib/browser";
import { groesseText, uuidAusZiel } from "@/lib/datentraeger";
import { zeitpunkt } from "@/lib/format";
import type { AppAnsicht, BackupStatus, Sicherung } from "@/lib/typen";
import { Feld, Hinweis, Knopf, Lader, SeitenKopf, StatusPille } from "../ui";

function Abschnitt({ titel, icon: Icon, text, children }: { titel: string; icon: typeof Archive; text?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-karte border border-glas bg-flaeche/80 p-5 shadow-karte backdrop-blur-md">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-glas bg-flaeche-2" aria-hidden="true">
          <Icon className="h-5 w-5 text-akzent" />
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

/** Wird genau einmal nach dem Einrichten gezeigt: Ohne diesen Schlüssel ist ein Backup auf einer neuen Box wertlos. */
function SchluesselKarte({ schluessel, onFertig }: { schluessel: string; onFertig?: () => void }) {
  const [notiert, setNotiert] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  return (
    <section aria-labelledby="schluessel-titel" className="rounded-karte border-2 border-gold/60 bg-gold/[0.06] p-6 shadow-gold">
      <h2 id="schluessel-titel" className="flex items-center gap-2 text-xl font-semibold">
        <KeyRound className="h-5 w-5 text-akzent" aria-hidden="true" /> Dein Wiederherstellungsschlüssel
      </h2>
      <p className="mt-2 text-sm text-text/90">
        Alle Sicherungen sind damit verschlüsselt. Geht diese Box kaputt, brauchst du ihn, um deine Daten auf einer neuen Box zurückzuholen.{" "}
        <strong>Schreib ihn auf Papier oder speichere ihn im Passwort-Manager – nicht nur auf dieser Box.</strong>
      </p>
      <p className="my-5 select-all break-all rounded-feld border border-linie bg-grund/80 p-4 text-center font-mono text-xl tracking-wider sm:text-2xl" aria-label="Schlüssel">
        {schluessel}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Knopf
          art="rahmen"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(schluessel);
              setKopiert(true);
            } catch {
              setKopiert(false);
            }
          }}
        >
          {kopiert ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {kopiert ? "Kopiert" : "Kopieren"}
        </Knopf>
      </div>
      {onFertig && (
        <div className="mt-5 space-y-4 border-t border-linie pt-5">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={notiert} onChange={(e) => setNotiert(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--gold)]" />
            Ich habe den Schlüssel sicher notiert – außerhalb dieser Box.
          </label>
          <Knopf disabled={!notiert} onClick={onFertig}>
            Weiter
          </Knopf>
        </div>
      )}
    </section>
  );
}

/** USB-Datenträger zur Auswahl (über lion-helper). Ohne Helper bleibt die Eingabe von Hand. */
function UsbAuswahl({ gewaehlt, onGewaehlt }: { gewaehlt: string; onGewaehlt: (ordner: string) => void }) {
  const liste = useAbfrage(lion.datentraeger, 10_000);
  const [sendet, setSendet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const titelId = useId();

  if (liste.fehler && !liste.daten) {
    return (
      <Hinweis titel="USB-Festplatten werden hier nicht erkannt" rolle="note">
        Dafür braucht Lion OS den Dienst lion-helper ({liste.fehler}). Einen bereits eingehängten Ordner kannst du unten von Hand eintragen.
      </Hinweis>
    );
  }
  const platten = liste.daten?.datentraeger ?? [];
  return (
    <section aria-labelledby={titelId} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={titelId} className="text-sm font-semibold">
          Angeschlossene USB-Festplatten
        </h3>
        <Knopf art="leise" className="min-h-9 px-2.5 text-xs" onClick={() => void liste.neuLaden()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Neu suchen
        </Knopf>
      </div>
      {!liste.daten && <Lader text="Suche Datenträger …" />}
      {liste.daten && platten.length === 0 && (
        <p className="rounded-feld border border-dashed border-linie-hell p-4 text-sm text-gedaempft">
          Keine USB-Festplatte gefunden. Schließe eine an – sie erscheint hier nach ein paar Sekunden.
        </p>
      )}
      {platten.length > 0 && (
        <ul className="space-y-2">
          {platten.map((d) => {
            const aktiv = gewaehlt === d.backupOrdner;
            return (
              <li key={d.uuid} className={`flex flex-wrap items-center gap-3 rounded-feld border p-3 ${aktiv ? "border-gold bg-gold/[0.06]" : "border-linie bg-flaeche-2"}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-sky-400 to-blue-700 text-white" aria-hidden="true">
                  <HardDrive className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold">{d.name}</p>
                  <p className="text-xs text-gedaempft">
                    {groesseText(d.groesseBytes)} · {d.dateisystem} · {d.eingehaengt ? "eingehängt" : "nicht eingehängt"}
                  </p>
                </div>
                {aktiv ? (
                  <StatusPille ton="gruen">Ausgewählt</StatusPille>
                ) : (
                  <Knopf
                    art="rahmen"
                    laedt={sendet === d.uuid}
                    disabled={sendet !== null}
                    onClick={async () => {
                      setSendet(d.uuid);
                      setFehler(null);
                      try {
                        const r = await lion.datentraegerEinhaengen(d.uuid);
                        onGewaehlt(r.backupOrdner);
                        void liste.neuLaden();
                      } catch (e) {
                        setFehler(e instanceof Error ? e.message : "Einhängen fehlgeschlagen.");
                      } finally {
                        setSendet(null);
                      }
                    }}
                  >
                    <Usb className="h-4 w-4" aria-hidden="true" /> Verwenden
                  </Knopf>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
    </section>
  );
}

function Einrichten({ vorher, onFertig }: { vorher: BackupStatus; onFertig: (schluessel: string | null) => void }) {
  const [ziel, setZiel] = useState(vorher.ziel ?? "");
  const [zeit, setZeit] = useState(vorher.zeit);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  return (
    <Abschnitt titel={vorher.eingerichtet ? "Ziel ändern" : "Backup einrichten"} icon={Archive} text="Tägliche, verschlüsselte Sicherung auf eine zweite Festplatte.">
      <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-text/90">
        <li>Zweite Festplatte per USB anschließen und unten auf „Verwenden“ tippen.</li>
        <li>Uhrzeit wählen.</li>
        <li>Den Wiederherstellungsschlüssel aufschreiben.</li>
      </ol>
      <div className="mb-5">
        <UsbAuswahl gewaehlt={ziel} onGewaehlt={setZiel} />
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSendet(true);
          setFehler(null);
          try {
            const r = await lion.backupEinrichten({ ziel, zeit });
            onFertig(r.schluesselNeu);
          } catch (err) {
            setFehler(err instanceof Error ? err.message : "Einrichten fehlgeschlagen.");
          } finally {
            setSendet(false);
          }
        }}
      >
        <Feld
          id="ziel"
          label="Ordner auf der Backup-Festplatte"
          placeholder="/mnt/usb-backup"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={ziel}
          onChange={(e) => setZiel(e.target.value)}
          hilfe="Wird bei „Verwenden“ automatisch ausgefüllt. Von Hand: unter /mnt oder /media, auf einer anderen Festplatte als deine Daten."
        />
        <Feld id="zeit" label="Tägliche Uhrzeit" type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} hilfe="Am besten nachts – die Apps werden kurz angehalten." />
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <Knopf type="submit" laedt={sendet} disabled={!ziel.trim()}>
          {vorher.eingerichtet ? "Ziel übernehmen" : "Backup einrichten"}
        </Knopf>
      </form>
    </Abschnitt>
  );
}

function SicherEntfernen({ uuid, gesperrt }: { uuid: string; gesperrt: boolean }) {
  const [zustand, setZustand] = useState<"bereit" | "laeuft" | "fertig">("bereit");
  const [fehler, setFehler] = useState<string | null>(null);
  if (zustand === "fertig") {
    return (
      <Hinweis ton="gruen" titel="Du kannst die Festplatte jetzt abziehen">
        Vor dem nächsten Backup hängt Lion OS sie automatisch wieder ein – sie muss dann nur angeschlossen sein.
      </Hinweis>
    );
  }
  return (
    <div className="space-y-2">
      <Knopf
        art="rahmen"
        laedt={zustand === "laeuft"}
        disabled={gesperrt}
        onClick={async () => {
          setZustand("laeuft");
          setFehler(null);
          try {
            await lion.datentraegerAushaengen(uuid);
            setZustand("fertig");
          } catch (e) {
            setFehler(e instanceof ApiFehler || e instanceof Error ? e.message : "Aushängen fehlgeschlagen.");
            setZustand("bereit");
          }
        }}
      >
        <Usb className="h-4 w-4" aria-hidden="true" /> Festplatte sicher entfernen
      </Knopf>
      {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
    </div>
  );
}

function Status({ s, onJetzt }: { s: BackupStatus; onJetzt: () => void }) {
  const jetzt = useJetzt();
  const z = backupZustand(s, jetzt ?? 0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const usb = uuidAusZiel(s.ziel);
  return (
    <Abschnitt titel="Status" icon={ShieldCheck}>
      <div className="space-y-4">
        <StatusPille ton={z.ton}>{z.text}</StatusPille>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-gedaempft">Letztes Backup</dt>
          <dd>
            {s.letzterErfolg ? (
              <>
                {zeitpunkt(s.letzterErfolg.start)} <span className="text-gedaempft">· {groesse(s.letzterErfolg.bytesNeu)} neu</span>
              </>
            ) : (
              "noch keins"
            )}
          </dd>
          <dt className="text-gedaempft">Nächstes</dt>
          <dd>{s.naechster && jetzt !== null ? wannText(s.naechster, new Date(jetzt)) : s.aktiv ? "–" : "Zeitplan ausgeschaltet"}</dd>
          <dt className="text-gedaempft">Ziel</dt>
          <dd className="break-all font-mono text-xs leading-5">{s.ziel}</dd>
        </dl>
        {s.letzter?.status === "fehler" && (
          <Hinweis ton="rot" titel="Das letzte Backup ist fehlgeschlagen">
            <span className="break-words font-mono text-xs">{s.letzter.meldung}</span>
          </Hinweis>
        )}
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <div className="flex flex-wrap items-center gap-3 border-t border-linie pt-4">
          <Knopf
            laedt={sendet || s.laeuft === "sicherung"}
            disabled={s.laeuft !== null}
            onClick={async () => {
              setSendet(true);
              setFehler(null);
              try {
                await lion.backupJetzt();
                onJetzt();
              } catch (err) {
                setFehler(err instanceof Error ? err.message : "Start fehlgeschlagen.");
              } finally {
                setSendet(false);
              }
            }}
          >
            Jetzt sichern
          </Knopf>
          <p className="text-xs text-gedaempft">Laufende Apps werden währenddessen kurz angehalten.</p>
        </div>
        {usb && <SicherEntfernen uuid={usb} gesperrt={s.laeuft !== null} />}
      </div>
    </Abschnitt>
  );
}

function Zeitplan({ s, onGespeichert }: { s: BackupStatus; onGespeichert: () => void }) {
  const [zeit, setZeit] = useState(s.zeit);
  const [aktiv, setAktiv] = useState(s.aktiv);
  const [meldung, setMeldung] = useState<{ ton: "gruen" | "rot"; text: string } | null>(null);
  return (
    <Abschnitt titel="Zeitplan" icon={CalendarClock}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setMeldung(null);
          try {
            await lion.backupPlan({ zeit, aktiv });
            setMeldung({ ton: "gruen", text: "Zeitplan gespeichert." });
            onGespeichert();
          } catch (err) {
            setMeldung({ ton: "rot", text: err instanceof Error ? err.message : "Speichern fehlgeschlagen." });
          }
        }}
      >
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" checked={aktiv} onChange={(e) => setAktiv(e.target.checked)} className="h-5 w-5 accent-[var(--gold)]" />
          Täglich automatisch sichern
        </label>
        <Feld id="plan-zeit" label="Uhrzeit" type="time" value={zeit} onChange={(e) => setZeit(e.target.value)} disabled={!aktiv} />
        {meldung && <Hinweis ton={meldung.ton}>{meldung.text}</Hinweis>}
        <Knopf type="submit" art="rahmen">
          Speichern
        </Knopf>
      </form>
    </Abschnitt>
  );
}

function WiederherstellenDialog({
  sicherung,
  apps,
  onSchliessen,
  onGestartet,
}: {
  sicherung: Sicherung | null;
  apps: AppAnsicht[];
  onSchliessen: () => void;
  onGestartet: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [app, setApp] = useState("");
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (sicherung && !d.open) d.showModal();
    if (!sicherung && d.open) d.close();
  }, [sicherung]);

  const passt = app !== "" && eingabe.trim() === app;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titel`}
      onClose={() => {
        setApp("");
        setEingabe("");
        setFehler(null);
        onSchliessen();
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-karte border border-linie-hell bg-flaeche p-0 text-text shadow-karte"
    >
      {sicherung && (
        <form
          className="space-y-5 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!passt) return;
            setSendet(true);
            setFehler(null);
            try {
              await lion.wiederherstellen({ sicherung: sicherung.kurz, app, bestaetigung: eingabe.trim() });
              ref.current?.close();
              onGestartet();
            } catch (err) {
              setFehler(err instanceof Error ? err.message : "Start fehlgeschlagen.");
            } finally {
              setSendet(false);
            }
          }}
        >
          <h2 id={`${id}-titel`} className="text-xl font-semibold">
            Aus der Sicherung vom {zeitpunkt(sicherung.zeit)} wiederherstellen
          </h2>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-app`} className="block text-sm font-semibold">
              Welche App?
            </label>
            <select
              id={`${id}-app`}
              value={app}
              onChange={(e) => setApp(e.target.value)}
              className="block min-h-12 w-full rounded-feld border border-linie-hell bg-grund/60 px-3 text-base focus:border-gold focus:outline-none"
            >
              <option value="">Bitte wählen …</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {app && (
            <div className="space-y-3 text-sm text-text/90">
              <p>Die App wird kurz angehalten, ihre Daten aus der Sicherung zurückgeholt und danach wieder gestartet.</p>
              <p>
                <strong className="text-akzent">Nichts wird gelöscht:</strong> Die jetzigen Daten werden beiseitegelegt nach{" "}
                <code className="break-all rounded bg-grund px-1.5 py-0.5 text-xs">/srv/lion/apps/.{app}.vor-wiederherstellung-…</code>
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor={`${id}-eingabe`} className="block text-sm font-semibold">
              Zur Bestätigung {app ? <code className="rounded bg-grund px-1.5 py-0.5 text-akzent">{app}</code> : "die App-ID"} eintippen
            </label>
            <input
              id={`${id}-eingabe`}
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="block min-h-12 w-full rounded-feld border border-linie-hell bg-grund/60 px-3.5 font-mono text-base focus:border-gold focus:outline-none"
            />
          </div>
          {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
          <div className="flex flex-wrap justify-end gap-3">
            <Knopf art="rahmen" onClick={() => ref.current?.close()}>
              Abbrechen
            </Knopf>
            <Knopf type="submit" art="gefahr" disabled={!passt} laedt={sendet}>
              Wiederherstellen
            </Knopf>
          </div>
        </form>
      )}
    </dialog>
  );
}

function Sicherungen({ status, liste, fehler, apps, onGestartet }: { status: BackupStatus; liste: Sicherung[] | undefined; fehler: string | null; apps: AppAnsicht[]; onGestartet: () => void }) {
  const [gewaehlt, setGewaehlt] = useState<Sicherung | null>(null);
  const w = status.letzteWiederherstellung;
  return (
    <Abschnitt titel="Sicherungen" icon={History} text="Aufbewahrt: 7 tägliche, 4 wöchentliche und 6 monatliche.">
      {status.laeuft === "wiederherstellung" && (
        <Hinweis titel="Wiederherstellung läuft …">Die App ist währenddessen nicht erreichbar.</Hinweis>
      )}
      {!status.laeuft && w && (
        <Hinweis ton={w.status === "erfolg" ? "gruen" : "rot"} titel={w.status === "erfolg" ? `${w.app} wiederhergestellt` : `Wiederherstellung von ${w.app} fehlgeschlagen`}>
          {w.status === "erfolg" ? `Am ${zeitpunkt(w.ende ?? w.start)}. Die vorherigen Daten liegen beiseitegelegt im Datenordner.` : w.meldung}
        </Hinweis>
      )}
      {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
      {!liste && !fehler && <Lader text="Lese Sicherungen …" />}
      {liste && liste.length === 0 && <p className="text-sm text-gedaempft">Noch keine Sicherung vorhanden.</p>}
      {liste && liste.length > 0 && (
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {liste.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="text-sm">
                <p className="font-semibold">{zeitpunkt(s.zeit)}</p>
                <p className="font-mono text-xs text-gedaempft">{s.kurz}</p>
              </div>
              <Knopf art="rahmen" disabled={status.laeuft !== null} onClick={() => setGewaehlt(s)} aria-label={`Sicherung vom ${zeitpunkt(s.zeit)} wiederherstellen`}>
                Wiederherstellen
              </Knopf>
            </li>
          ))}
        </ul>
      )}
      <WiederherstellenDialog sicherung={gewaehlt} apps={apps} onSchliessen={() => setGewaehlt(null)} onGestartet={onGestartet} />
    </Abschnitt>
  );
}

function SchluesselAnzeigen() {
  const [passwort, setPasswort] = useState("");
  const [schluessel, setSchluessel] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  if (schluessel) return <SchluesselKarte schluessel={schluessel} />;
  return (
    <Abschnitt titel="Wiederherstellungsschlüssel" icon={KeyRound} text="Zum Anzeigen brauchst du dein Passwort.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setFehler(null);
          try {
            setSchluessel((await lion.backupSchluessel(passwort)).schluessel);
          } catch (err) {
            setFehler(err instanceof Error ? err.message : "Anzeigen fehlgeschlagen.");
            setPasswort("");
          }
        }}
      >
        <Feld id="schluessel-passwort" label="Dein Passwort" type="password" autoComplete="current-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} />
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <Knopf type="submit" art="rahmen" disabled={!passwort}>
          Schlüssel anzeigen
        </Knopf>
      </form>
    </Abschnitt>
  );
}

export function Backup() {
  const sicherungenNeu = useRef<() => void>(() => {});
  const vorher = useRef<BackupStatus["laeuft"]>(null);
  const status = useAbfrage(
    async () => {
      const s = await lion.backup();
      // Wenn eine Aktion gerade fertig geworden ist: Liste der Sicherungen neu lesen.
      if (vorher.current && !s.laeuft) sicherungenNeu.current();
      vorher.current = s.laeuft;
      return s;
    },
    (d) => (d?.laeuft ? 2_000 : 15_000),
  );
  // Ohne Ziel liefert lion-core eine leere Liste.
  const sicherungen = useAbfrage(lion.sicherungen, 0);
  const apps = useAbfrage(lion.apps, 0);
  const [neuerSchluessel, setNeuerSchluessel] = useState<string | null>(null);
  const [zielAendern, setZielAendern] = useState(false);

  useEffect(() => {
    sicherungenNeu.current = () => void sicherungen.neuLaden();
  });

  const s = status.daten;
  const aktualisieren = () => {
    void status.neuLaden();
    void sicherungen.neuLaden();
  };

  return (
    <>
      <SeitenKopf titel="Backup" text="Deine Apps und Einstellungen – jede Nacht verschlüsselt auf eine zweite Festplatte gesichert." />
      {status.fehler && <Hinweis ton="rot">{status.fehler}</Hinweis>}
      {!s && !status.fehler && <Lader text="Lade Backup-Status …" />}
      {s && neuerSchluessel && (
        <SchluesselKarte
          schluessel={neuerSchluessel}
          onFertig={() => {
            setNeuerSchluessel(null);
            aktualisieren();
          }}
        />
      )}
      {s && !neuerSchluessel && (!s.eingerichtet || zielAendern) && (
        <div className="max-w-2xl">
          <Einrichten
            vorher={s}
            onFertig={(schluessel) => {
              setZielAendern(false);
              if (schluessel) setNeuerSchluessel(schluessel);
              aktualisieren();
            }}
          />
        </div>
      )}
      {s && !neuerSchluessel && s.eingerichtet && !zielAendern && (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="space-y-5">
            <Status s={s} onJetzt={() => void status.neuLaden()} />
            <Zeitplan s={s} onGespeichert={() => void status.neuLaden()} />
            <Knopf art="leise" onClick={() => setZielAendern(true)}>
              Backup-Ziel ändern …
            </Knopf>
          </div>
          <div className="space-y-5">
            <Sicherungen
              status={s}
              liste={sicherungen.daten?.sicherungen}
              fehler={sicherungen.fehler}
              apps={apps.daten?.apps ?? []}
              onGestartet={() => void status.neuLaden()}
            />
            <SchluesselAnzeigen />
          </div>
        </div>
      )}
    </>
  );
}
