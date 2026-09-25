"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiFehler } from "./api";

/**
 * Lädt Daten und fragt regelmäßig nach. Pausiert, solange der Tab im Hintergrund ist.
 * `intervall` kann von den Daten abhängen (z. B. schneller, solange eine App installiert wird).
 * Bei abgelaufener Sitzung (401) geht es zur Anmeldung.
 */
export function useAbfrage<T>(laden: () => Promise<T>, intervall: number | ((daten: T | undefined) => number)) {
  const router = useRouter();
  const [daten, setDaten] = useState<T>();
  const [fehler, setFehler] = useState<string | null>(null);
  const ladenRef = useRef(laden);
  const intervallRef = useRef(intervall);
  const datenRef = useRef<T | undefined>(undefined);
  const zeitgeber = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holenRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    ladenRef.current = laden;
    intervallRef.current = intervall;
  });

  const holen = useCallback(async () => {
    clearTimeout(zeitgeber.current);
    try {
      const neu = await ladenRef.current();
      datenRef.current = neu;
      setDaten(neu);
      setFehler(null);
    } catch (e) {
      if (e instanceof ApiFehler && e.status === 401) {
        router.replace("/anmelden/");
        return;
      }
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler.");
    }
    const i = intervallRef.current;
    const ms = typeof i === "function" ? i(datenRef.current) : i;
    if (ms > 0 && !document.hidden) zeitgeber.current = setTimeout(() => void holenRef.current(), ms);
  }, [router]);

  useEffect(() => {
    holenRef.current = holen;
  }, [holen]);

  useEffect(() => {
    const beiSichtbarkeit = () => {
      if (!document.hidden) void holen();
      else clearTimeout(zeitgeber.current);
    };
    const start = setTimeout(holen, 0);
    document.addEventListener("visibilitychange", beiSichtbarkeit);
    return () => {
      clearTimeout(start);
      clearTimeout(zeitgeber.current);
      document.removeEventListener("visibilitychange", beiSichtbarkeit);
    };
  }, [holen]);

  return { daten, fehler, neuLaden: holen };
}
