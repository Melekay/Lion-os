"use client";

import { useSyncExternalStore } from "react";

// Werte, die es nur im Browser gibt. Beim statischen Bauen gilt der Ersatzwert.
const keinAbo = () => () => {};

/** Hostname, unter dem die Oberfläche geöffnet ist (für die passende App-Adresse). */
export function useHostname(): string {
  return useSyncExternalStore(keinAbo, () => window.location.hostname, () => "");
}

/** Aktuelle Stunde (0–23) oder null beim Bauen. */
export function useStunde(): number | null {
  return useSyncExternalStore(keinAbo, () => new Date().getHours(), () => null);
}

// Uhr: ein gemeinsamer Takt für alle Abonnenten (alle 10 s reicht für Minutenanzeige).
let jetzt = 0;
function abonniereUhr(melden: () => void) {
  const t = setInterval(() => {
    jetzt = Date.now();
    melden();
  }, 10_000);
  return () => clearInterval(t);
}

/** Aktuelle Zeit (Millisekunden), aktualisiert alle 10 s; null beim Bauen. */
export function useJetzt(): number | null {
  return useSyncExternalStore(
    abonniereUhr,
    () => {
      // Erster Aufruf im Browser: sofort echte Zeit, danach nur beim Takt ändern (stabiler Schnappschuss).
      if (jetzt === 0) jetzt = Date.now();
      return jetzt;
    },
    () => null,
  );
}
