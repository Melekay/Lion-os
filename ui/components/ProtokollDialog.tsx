"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { lion } from "@/lib/api";
import type { AppAnsicht } from "@/lib/typen";
import { Hinweis, Knopf } from "./ui";

/**
 * Zeigt die letzten Zeilen aus dem Protokoll der App-Container.
 * Nützlich für Start-Passwörter (z. B. FileBrowser) und bei Fehlern.
 */
export function ProtokollDialog({ app, offen, onSchliessen }: { app: AppAnsicht; offen: boolean; onSchliessen: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const endeRef = useRef<HTMLDivElement>(null);
  const [zeilen, setZeilen] = useState<string[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const id = useId();

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      setZeilen((await lion.appProtokoll(app.id)).zeilen);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setLaedt(false);
    }
  }, [app.id]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offen && !d.open) {
      d.showModal();
      void laden();
    }
    if (!offen && d.open) d.close();
  }, [offen, laden]);

  // Neueste Zeilen sind unten – dorthin scrollen.
  useEffect(() => {
    endeRef.current?.scrollIntoView({ block: "end" });
  }, [zeilen]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titel`}
      onClose={() => {
        setZeilen(null);
        onSchliessen();
      }}
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-karte border border-linie-hell bg-flaeche p-0 text-text shadow-karte"
    >
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-titel`} className="text-xl font-semibold">
              Protokoll: {app.name}
            </h2>
            <p className="text-sm text-gedaempft">Die letzten 300 Zeilen, neueste unten. Enthält es ein Passwort, ändere es nach der Anmeldung.</p>
          </div>
          <Knopf art="rahmen" laedt={laedt} onClick={() => void laden()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Aktualisieren
          </Knopf>
        </div>
        {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
        <div
          role="log"
          aria-label={`Protokoll von ${app.name}`}
          tabIndex={0}
          className="max-h-[60vh] overflow-auto rounded-feld border border-linie bg-grund p-3 font-mono text-xs leading-relaxed focus:border-gold focus:outline-none"
        >
          {zeilen === null && !fehler && <p className="text-gedaempft">Lade Protokoll …</p>}
          {zeilen?.length === 0 && <p className="text-gedaempft">Noch keine Einträge.</p>}
          {zeilen?.map((z, i) => (
            <p key={i} className="whitespace-pre-wrap break-all">
              {z}
            </p>
          ))}
          <div ref={endeRef} />
        </div>
        <div className="flex justify-end">
          <Knopf art="rahmen" onClick={() => ref.current?.close()}>
            Schließen
          </Knopf>
        </div>
      </div>
    </dialog>
  );
}
