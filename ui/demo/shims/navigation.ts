import { useSyncExternalStore } from "react";

/**
 * Ersatz für next/navigation in der Demo: Seiten stehen im Hash (#/apps/), damit die Demo
 * als einzelne Datei überall läuft. Andere Anker (z. B. #inhalt) lassen die Seite unverändert.
 */
let pfad = leseHash() ?? "/";
const hoerer = new Set<() => void>();

function leseHash(): string | null {
  const h = typeof location === "undefined" ? "" : location.hash;
  return h.startsWith("#/") ? h.slice(1) : null;
}

function melden() {
  for (const h of hoerer) h();
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const neu = leseHash();
    if (neu && neu !== pfad) {
      pfad = neu;
      melden();
    }
  });
}

/** „/apps/#immich“ → Seite „/apps/“, danach zum Element „immich“ scrollen. */
export function gehe(ziel: string) {
  const [seite = "/", anker] = ziel.split("#");
  const normal = seite.endsWith("/") ? seite : `${seite}/`;
  if (normal !== pfad) {
    pfad = normal;
    try {
      history.replaceState(null, "", `#${normal}`);
    } catch {
      /* in abgeschotteten Rahmen (z. B. eingebettet) bleibt die Adresse einfach gleich */
    }
    melden();
    window.scrollTo(0, 0);
  }
  if (anker) setTimeout(() => document.getElementById(anker)?.scrollIntoView({ block: "start" }), 400);
}

export function aktuellerPfad() {
  return pfad;
}

function abonnieren(h: () => void) {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

export function usePathname(): string {
  return useSyncExternalStore(abonnieren, aktuellerPfad, aktuellerPfad);
}

// Immer dasselbe Objekt – Komponenten nutzen den Router als Effekt-Abhängigkeit.
const ROUTER = {
  push: gehe,
  replace: gehe,
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => undefined,
  prefetch: () => undefined,
};

export function useRouter() {
  return ROUTER;
}
