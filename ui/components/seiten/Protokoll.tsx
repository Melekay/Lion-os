"use client";

import { RefreshCw } from "lucide-react";
import { useAbfrage } from "@/lib/abfrage";
import { lion } from "@/lib/api";
import { aktionText, ERGEBNIS_TEXT, zeitpunkt } from "@/lib/format";
import { Hinweis, Karte, Knopf, Lader, SeitenKopf, StatusPille } from "../ui";

export function Protokoll() {
  const { daten, fehler, neuLaden } = useAbfrage(() => lion.protokoll(200), 30_000);
  const eintraege = daten?.eintraege ?? [];

  return (
    <>
      <SeitenKopf
        titel="Protokoll"
        text="Wer hat wann was getan? Anmeldungen, Einrichtung und App-Aktionen – auch abgelehnte Versuche. Passwörter und Geheimnisse stehen hier nie."
        aktion={
          <Knopf art="rahmen" onClick={() => void neuLaden()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Aktualisieren
          </Knopf>
        }
      />
      {fehler && <Hinweis ton="rot">{fehler}</Hinweis>}
      {!daten && !fehler && <Lader text="Lade Protokoll …" />}
      {daten && eintraege.length === 0 && <Hinweis>Noch keine Einträge.</Hinweis>}
      {eintraege.length > 0 && (
        <Karte className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Letzte {eintraege.length} Einträge, neueste zuerst</caption>
            <thead className="hidden border-b border-linie bg-flaeche-2/60 text-xs uppercase tracking-wider text-gedaempft md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Zeit
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Aktion
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Benutzer
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Ergebnis
                </th>
                <th scope="col" className="px-5 py-3 font-semibold">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linie">
              {eintraege.map((e) => {
                const erg = ERGEBNIS_TEXT[e.ergebnis];
                return (
                  <tr key={e.id} className="grid grid-cols-2 gap-x-4 gap-y-1 px-5 py-4 md:table-row md:p-0">
                    <td className="col-span-2 font-mono text-xs text-gedaempft md:px-5 md:py-3.5">{zeitpunkt(e.zeit)}</td>
                    <td className="font-semibold md:px-5 md:py-3.5">
                      {aktionText(e.aktion)}
                      {e.ziel && <span className="font-normal text-gedaempft"> · {e.ziel}</span>}
                    </td>
                    <td className="text-right md:px-5 md:py-3.5 md:text-left">{e.benutzer ?? "–"}</td>
                    <td className="md:px-5 md:py-3.5">
                      <StatusPille ton={erg.ton}>{erg.text}</StatusPille>
                    </td>
                    <td className="break-all text-right font-mono text-xs text-gedaempft md:px-5 md:py-3.5 md:text-left">{e.details ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Karte>
      )}
    </>
  );
}
