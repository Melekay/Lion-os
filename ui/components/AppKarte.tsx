"use client";

import { ExternalLink, Film, FolderOpen, MemoryStick, Play, Plus, ScrollText, ShieldAlert, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { lion } from "@/lib/api";
import { aktionen, besteAdresse, kategorieText, medienText, ramText, ramWarnung, sicherheitsHinweis, statusAnzeige } from "@/lib/apps";
import type { AppAnsicht, Systemstatus } from "@/lib/typen";
import { AppSymbol } from "./AppSymbol";
import { EntfernenDialog } from "./EntfernenDialog";
import { ProtokollDialog } from "./ProtokollDialog";
import { Hinweis, Karte, Knopf, StatusPille } from "./ui";

export function AppKarte({
  app,
  hostname,
  system,
  onGeaendert,
}: {
  app: AppAnsicht;
  hostname: string;
  /** Aktuelle Messwerte für die RAM-Warnung (fehlen sie, gibt es keine Warnung). */
  system?: Systemstatus | null;
  onGeaendert: () => void;
}) {
  const [sendet, setSendet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [protokoll, setProtokoll] = useState(false);
  const [ramBestaetigen, setRamBestaetigen] = useState(false);

  const status = statusAnzeige(app);
  const knoepfe = aktionen(app);
  const stufe = sicherheitsHinweis(app.sicherheitsstufe);
  const adresse = app.installiert ? besteAdresse(app.installiert.adressen, hostname) : null;
  const medien = medienText(app.medien);
  const ram = app.installiert ? null : ramWarnung(app.ramMinMb, system);
  const installieren = () => ausfuehren("installieren", () => lion.appAktion(app.id, "installieren"));

  async function ausfuehren(name: string, aufruf: () => Promise<unknown>) {
    setSendet(name);
    setFehler(null);
    try {
      await aufruf();
      setDialog(false);
      setRamBestaetigen(false);
      onGeaendert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setSendet(null);
    }
  }

  return (
    <Karte as="article" className="flex scroll-mt-24 flex-col gap-5 p-6" id={app.id}>
      <div className="flex items-start gap-4">
        <AppSymbol id={app.id} kategorie={app.kategorie} logo={app.logo} groesse="klein" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-lg font-semibold leading-tight">{app.name}</h2>
            <p className="text-sm text-gedaempft">
              {kategorieText(app.kategorie)} · <span className="whitespace-nowrap font-mono">v{app.version}</span>
            </p>
          </div>
          <StatusPille ton={status.ton}>{status.text}</StatusPille>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-text/90">{app.beschreibung}</p>

      {stufe && (
        <p className="flex gap-2 rounded-feld border border-gold/30 bg-gold/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-akzent" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-akzent">{stufe.text}:</strong> {stufe.erklaerung}
          </span>
        </p>
      )}

      {app.installiert?.status === "installiere" && (
        <p className="text-sm text-gedaempft" role="status">
          Das Image wird geladen und gestartet. Das kann einige Minuten dauern – du kannst die Seite solange verlassen.
        </p>
      )}
      {app.installiert?.status === "fehler" && app.installiert.meldung && (
        <Hinweis ton="rot" titel="Letzte Aktion fehlgeschlagen">
          <span className="break-words font-mono text-xs">{app.installiert.meldung}</span>
        </Hinweis>
      )}
      {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}

      {app.hinweise.length > 0 && (
        <details className="group rounded-feld border border-linie bg-grund/40 p-3 text-sm">
          <summary className="cursor-pointer font-semibold marker:text-akzent">Wichtige Hinweise ({app.hinweise.length})</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-text/90">
            {app.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}

      {!app.installiert && ram && (
        <Hinweis ton={ram.stufe} titel={ram.titel} rolle="note">
          {ram.text}
        </Hinweis>
      )}

      {app.ramMinMb ? (
        <p className="flex items-center gap-2 text-xs text-gedaempft">
          <MemoryStick className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Empfohlen: ab {ramText(app.ramMinMb)} freier Arbeitsspeicher</span>
        </p>
      ) : null}

      {medien && (
        <p className="flex items-center gap-2 text-xs text-gedaempft">
          <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{medien}</span>
        </p>
      )}

      {app.installiert && (
        <p className="flex items-center gap-2 text-xs text-gedaempft">
          <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">Datenordner:</span>
          <code className="break-all">{app.installiert.datenordner}</code>
        </p>
      )}

      {knoepfe.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-linie pt-5">
          {knoepfe.includes("installieren") && !ramBestaetigen && (
            <Knopf laedt={sendet === "installieren"} onClick={() => (ram ? setRamBestaetigen(true) : installieren())}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Installieren
            </Knopf>
          )}
          {knoepfe.includes("installieren") && ramBestaetigen && (
            <div className="w-full space-y-3" role="group" aria-label="Installation trotz Warnung bestätigen">
              <p className="text-sm font-semibold">
                {ram?.stufe === "rot" ? "Wirklich installieren? Die App wird auf diesem Gerät kaum laufen." : "Trotz knappem Arbeitsspeicher installieren?"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Knopf art={ram?.stufe === "rot" ? "gefahr" : "gold"} laedt={sendet === "installieren"} onClick={installieren}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Trotzdem installieren
                </Knopf>
                <Knopf art="rahmen" onClick={() => setRamBestaetigen(false)}>
                  Abbrechen
                </Knopf>
              </div>
            </div>
          )}
          {knoepfe.includes("oeffnen") && adresse && (
            <a
              href={adresse}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-feld bg-gold px-4 text-sm font-semibold text-auf-gold shadow-gold hover:bg-gold-hell"
            >
              Öffnen <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">(neuer Tab)</span>
            </a>
          )}
          {knoepfe.includes("starten") && (
            <Knopf art="rahmen" laedt={sendet === "starten"} onClick={() => ausfuehren("starten", () => lion.appAktion(app.id, "starten"))}>
              <Play className="h-4 w-4" aria-hidden="true" /> Starten
            </Knopf>
          )}
          {knoepfe.includes("stoppen") && (
            <Knopf art="rahmen" laedt={sendet === "stoppen"} onClick={() => ausfuehren("stoppen", () => lion.appAktion(app.id, "stoppen"))}>
              <Square className="h-4 w-4" aria-hidden="true" /> Stoppen
            </Knopf>
          )}
          {knoepfe.includes("protokoll") && (
            <Knopf art="rahmen" onClick={() => setProtokoll(true)}>
              <ScrollText className="h-4 w-4" aria-hidden="true" /> Protokoll
            </Knopf>
          )}
          {knoepfe.includes("entfernen") && (
            <Knopf art="leise" className="ml-auto" onClick={() => setDialog(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Entfernen
            </Knopf>
          )}
        </div>
      )}

      {app.installiert && <ProtokollDialog app={app} offen={protokoll} onSchliessen={() => setProtokoll(false)} />}
      {app.installiert && (
        <EntfernenDialog
          app={app}
          offen={dialog}
          laedt={sendet === "entfernen"}
          onSchliessen={() => setDialog(false)}
          onBestaetigen={(b) => ausfuehren("entfernen", () => lion.appEntfernen(app.id, b))}
        />
      )}
    </Karte>
  );
}
