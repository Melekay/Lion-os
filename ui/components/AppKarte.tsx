"use client";

import { ExternalLink, Film, FolderOpen, Play, Plus, ScrollText, ShieldAlert, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { lion } from "@/lib/api";
import { aktionen, besteAdresse, kategorieText, medienText, sicherheitsHinweis, statusAnzeige } from "@/lib/apps";
import type { AppAnsicht } from "@/lib/typen";
import { AppSymbol } from "./AppSymbol";
import { EntfernenDialog } from "./EntfernenDialog";
import { ProtokollDialog } from "./ProtokollDialog";
import { Hinweis, Karte, Knopf, StatusPille } from "./ui";

export function AppKarte({ app, hostname, onGeaendert }: { app: AppAnsicht; hostname: string; onGeaendert: () => void }) {
  const [sendet, setSendet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [protokoll, setProtokoll] = useState(false);

  const status = statusAnzeige(app);
  const knoepfe = aktionen(app);
  const stufe = sicherheitsHinweis(app.sicherheitsstufe);
  const adresse = app.installiert ? besteAdresse(app.installiert.adressen, hostname) : null;
  const medien = medienText(app.medien);

  async function ausfuehren(name: string, aufruf: () => Promise<unknown>) {
    setSendet(name);
    setFehler(null);
    try {
      await aufruf();
      setDialog(false);
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
        <AppSymbol id={app.id} kategorie={app.kategorie} groesse="klein" />
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
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-gold">{stufe.text}:</strong> {stufe.erklaerung}
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
        <details className="group rounded-feld border border-linie bg-nacht/40 p-3 text-sm">
          <summary className="cursor-pointer font-semibold marker:text-gold">Wichtige Hinweise ({app.hinweise.length})</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-text/90">
            {app.hinweise.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}

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
          {knoepfe.includes("installieren") && (
            <Knopf laedt={sendet === "installieren"} onClick={() => ausfuehren("installieren", () => lion.appAktion(app.id, "installieren"))}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Installieren
            </Knopf>
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
