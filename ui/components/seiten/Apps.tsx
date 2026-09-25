"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { beschaeftigt, kategorien, kategorieText } from "@/lib/apps";
import { useHostname } from "@/lib/browser";
import { useState } from "react";
import { AppKarte } from "../AppKarte";
import { Hinweis, Lader, SeitenKopf } from "../ui";

export function Apps() {
  // Solange eine App installiert oder entfernt wird: alle 2 s nachfragen, sonst alle 15 s.
  const { daten, fehler, neuLaden } = useAbfrage(lion.apps, (d) => (d && beschaeftigt(d.apps) ? 2_000 : 15_000));
  // Für die RAM-Warnung vor der Installation. Fehlt der Wert, gibt es einfach keine Warnung.
  const { daten: system } = useAbfrage(lion.system, 30_000);
  const hostname = useHostname();
  const [filter, setFilter] = useState<string>("alle");
  const liste = daten?.apps ?? [];
  const installiert = liste.filter((a) => a.installiert).length;
  const chips: { wert: string; text: string }[] = [
    { wert: "alle", text: `Alle (${liste.length})` },
    ...(installiert ? [{ wert: "installiert", text: `Installiert (${installiert})` }] : []),
    ...kategorien(liste).map((k) => ({ wert: k, text: kategorieText(k) })),
  ];
  // Verschwindet die gewählte Gruppe (z. B. letzte App entfernt), gilt wieder „Alle“.
  const aktiv = chips.some((c) => c.wert === filter) ? filter : "alle";
  const sichtbar = liste.filter((a) => (aktiv === "alle" ? true : aktiv === "installiert" ? a.installiert : a.kategorie === aktiv));

  return (
    <>
      <SeitenKopf
        titel="App Store"
        text="Geprüfte Vorlagen mit festen Versionen. Jede App ist nur verschlüsselt über HTTPS erreichbar – und beim Entfernen bleiben deine Daten erhalten."
      />
      <ul className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gedaempft">
        <li className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-akzent" aria-hidden="true" /> Vor der Installation automatisch geprüft
        </li>
        <li className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-akzent" aria-hidden="true" /> Eigener HTTPS-Port pro App
        </li>
      </ul>
      {fehler && <Hinweis ton="rot" titel="Apps konnten nicht geladen werden">{fehler}</Hinweis>}
      {!daten && !fehler && <Lader text="Lade App-Katalog …" />}
      {daten && (
        <div role="group" aria-label="Nach Kategorie filtern" className="mb-6 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.wert}
              type="button"
              aria-pressed={aktiv === c.wert}
              onClick={() => setFilter(c.wert)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
                aktiv === c.wert ? "border-gold bg-gold text-auf-gold" : "border-linie-hell bg-flaeche/60 text-text hover:border-gold"
              }`}
            >
              {c.text}
            </button>
          ))}
        </div>
      )}
      {daten && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sichtbar.map((a) => (
            <AppKarte key={a.id} app={a} hostname={hostname} system={system} onGeaendert={neuLaden} />
          ))}
        </div>
      )}
    </>
  );
}
