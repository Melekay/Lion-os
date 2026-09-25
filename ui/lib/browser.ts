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
