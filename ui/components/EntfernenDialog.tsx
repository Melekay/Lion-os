"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AppAnsicht } from "@/lib/typen";
import { Knopf } from "./ui";

/**
 * Entfernen braucht eine ausdrückliche Bestätigung: Die App-ID muss eingetippt werden.
 * Nutzt das native <dialog> – Fokus, Esc und Hintergrund-Sperre macht der Browser.
 */
export function EntfernenDialog({
  app,
  offen,
  laedt,
  onSchliessen,
  onBestaetigen,
}: {
  app: AppAnsicht;
  offen: boolean;
  laedt: boolean;
  onSchliessen: () => void;
  onBestaetigen: (bestaetigung: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [eingabe, setEingabe] = useState("");
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offen && !d.open) d.showModal();
    if (!offen && d.open) d.close();
  }, [offen]);

  const passt = eingabe.trim() === app.id;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titel`}
      aria-describedby={`${id}-text`}
      onClose={() => {
        setEingabe("");
        onSchliessen();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-karte border border-linie-hell bg-flaeche p-0 text-text shadow-karte"
    >
      <form
        method="dialog"
        className="space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (passt) onBestaetigen(eingabe.trim());
        }}
      >
        <h2 id={`${id}-titel`} className="text-xl font-semibold">
          {app.name} entfernen?
        </h2>
        <div id={`${id}-text`} className="space-y-3 text-sm text-text/90">
          <p>Die App wird gestoppt und gelöscht. Sie ist danach nicht mehr erreichbar.</p>
          <p>
            <strong className="text-gold">Deine Daten bleiben erhalten</strong> im Ordner{" "}
            <code className="break-all rounded bg-nacht px-1.5 py-0.5 text-xs">{app.installiert?.datenordner}</code>. Löschen musst du sie
            bewusst selbst.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-eingabe`} className="block text-sm font-semibold">
            Zur Bestätigung <code className="rounded bg-nacht px-1.5 py-0.5 text-gold">{app.id}</code> eintippen
          </label>
          <input
            id={`${id}-eingabe`}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="block min-h-12 w-full rounded-feld border border-linie-hell bg-nacht/60 px-3.5 font-mono text-base focus:border-gold focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Knopf art="rahmen" onClick={() => ref.current?.close()}>
            Abbrechen
          </Knopf>
          <Knopf type="submit" art="gefahr" disabled={!passt} laedt={laedt}>
            Endgültig entfernen
          </Knopf>
        </div>
      </form>
    </dialog>
  );
}
