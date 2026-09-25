"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiFehler, lion } from "@/lib/api";
import { Hinweis, Knopf, Lader } from "./ui";

type Sitzung = { name: string; boxName: string; setBoxName: (n: string) => void; abmelden: () => Promise<void> };

const SitzungKontext = createContext<Sitzung | null>(null);

export function useSitzung(): Sitzung {
  const s = useContext(SitzungKontext);
  if (!s) throw new Error("useSitzung nur innerhalb von <Geschuetzt> verwenden.");
  return s;
}

/**
 * Zeigt den Inhalt nur angemeldet. Noch nicht eingerichtet → Einrichtung, nicht angemeldet → Anmeldung.
 * Der eigentliche Schutz liegt in lion-core; das hier ist nur die Führung durch die Oberfläche.
 */
export function Geschuetzt({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [boxName, setBoxName] = useState("Lion OS");
  const [fehler, setFehler] = useState<string | null>(null);
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const status = await lion.setupStatus();
        if (!status.eingerichtet) return router.replace("/einrichtung/");
        const ich = await lion.ich();
        // Der Name der Box ist nur Anzeige – fehlt er, bleibt „Lion OS“.
        const einstellungen = await lion.einstellungen().catch(() => null);
        if (!aktiv) return;
        if (einstellungen) setBoxName(einstellungen.boxName);
        setName(ich.name);
      } catch (e) {
        if (e instanceof ApiFehler && e.status === 401) return router.replace("/anmelden/");
        if (aktiv) setFehler(e instanceof Error ? e.message : "Unbekannter Fehler.");
      }
    })();
    return () => {
      aktiv = false;
    };
  }, [router, versuch]);

  const abmelden = useCallback(async () => {
    try {
      await lion.abmelden();
    } finally {
      router.replace("/anmelden/");
    }
  }, [router]);

  if (fehler) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <Hinweis ton="rot" titel="Keine Verbindung zu Lion OS">
          {fehler}
        </Hinweis>
        <Knopf
          className="mt-4"
          onClick={() => {
            setFehler(null);
            setVersuch((v) => v + 1);
          }}
        >
          Erneut versuchen
        </Knopf>
      </div>
    );
  }
  if (!name) return <Lader text="Lion OS wird geladen …" vollbild />;
  return <SitzungKontext.Provider value={{ name, boxName, setBoxName, abmelden }}>{children}</SitzungKontext.Provider>;
}

/** Für Anmeldung und Einrichtung: Wer schon angemeldet ist, landet direkt auf der Startseite. */
export function useSchonAngemeldet(): boolean {
  const router = useRouter();
  const [pruefend, setPruefend] = useState(true);
  useEffect(() => {
    let aktiv = true;
    lion
      .ich()
      .then(() => router.replace("/"))
      .catch(() => aktiv && setPruefend(false));
    return () => {
      aktiv = false;
    };
  }, [router]);
  return pruefend;
}
