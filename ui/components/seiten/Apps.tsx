"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { beschaeftigt } from "@/lib/apps";
import { useHostname } from "@/lib/browser";
import { AppKarte } from "../AppKarte";
import { Hinweis, Lader, SeitenKopf } from "../ui";

export function Apps() {
  // Solange eine App installiert oder entfernt wird: alle 2 s nachfragen, sonst alle 15 s.
  const { daten, fehler, neuLaden } = useAbfrage(lion.apps, (d) => (d && beschaeftigt(d.apps) ? 2_000 : 15_000));
  const hostname = useHostname();

  return (
    <>
      <SeitenKopf
        titel="Apps"
        text="Geprüfte Vorlagen mit festen Versionen. Jede App ist nur verschlüsselt über HTTPS erreichbar – und beim Entfernen bleiben deine Daten erhalten."
      />
      <ul className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gedaempft">
        <li className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gold" aria-hidden="true" /> Vor der Installation automatisch geprüft
        </li>
        <li className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-gold" aria-hidden="true" /> Eigener HTTPS-Port pro App
        </li>
      </ul>
      {fehler && <Hinweis ton="rot" titel="Apps konnten nicht geladen werden">{fehler}</Hinweis>}
      {!daten && !fehler && <Lader text="Lade App-Katalog …" />}
      {daten && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {daten.apps.map((a) => (
            <AppKarte key={a.id} app={a} hostname={hostname} onGeaendert={neuLaden} />
          ))}
        </div>
      )}
    </>
  );
}
