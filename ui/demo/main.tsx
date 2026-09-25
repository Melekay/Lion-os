import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import "./schriften.css";
import NichtGefunden from "../app/not-found";
import { Rahmen } from "../components/Rahmen";
import { Anmelden } from "../components/seiten/Anmelden";
import { Apps } from "../components/seiten/Apps";
import { Backup } from "../components/seiten/Backup";
import { Einrichtung } from "../components/seiten/Einrichtung";
import { Einstellungen } from "../components/seiten/Einstellungen";
import { Protokoll } from "../components/seiten/Protokoll";
import { Startseite } from "../components/seiten/Startseite";
import { gespeicherterHintergrund } from "../lib/hintergrund";
import { DemoApi } from "./attrappe";
import { gehe, usePathname } from "./shims/navigation";

/**
 * Lion OS als Demo: dieselben Seiten und Komponenten wie im echten Lion OS,
 * aber lion-core ist durch Beispieldaten im Browser ersetzt. Nichts wird wirklich installiert.
 */
document.documentElement.dataset.hintergrund = gespeicherterHintergrund();
const api = new DemoApi();
api.verbinden();

const SEITEN: Record<string, { titel: string; inhalt: () => React.ReactNode }> = {
  "/": { titel: "Lion OS", inhalt: () => <Rahmen><Startseite /></Rahmen> },
  "/apps/": { titel: "App Store · Lion OS", inhalt: () => <Rahmen><Apps /></Rahmen> },
  "/backup/": { titel: "Backup · Lion OS", inhalt: () => <Rahmen><Backup /></Rahmen> },
  "/einstellungen/": { titel: "Einstellungen · Lion OS", inhalt: () => <Rahmen><Einstellungen /></Rahmen> },
  "/protokoll/": { titel: "Protokoll · Lion OS", inhalt: () => <Rahmen><Protokoll /></Rahmen> },
  "/anmelden/": { titel: "Anmelden · Lion OS", inhalt: () => <Anmelden /> },
  "/einrichtung/": { titel: "Einrichtung · Lion OS", inhalt: () => <Einrichtung /> },
};

function DemoLeiste({ onZurueckgesetzt }: { onZurueckgesetzt: () => void }) {
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-gold/30 bg-grund/95 px-4 py-2 text-center text-xs text-text/90 backdrop-blur">
      <span>
        <strong className="text-akzent">Demo</strong> mit Beispieldaten – nichts wird wirklich installiert. Anmelden geht mit jedem Passwort.
      </span>
      <button
        type="button"
        className="rounded-full border border-linie-hell px-3 py-1 font-semibold hover:border-gold"
        onClick={() => {
          api.zuruecksetzen();
          gehe("/");
          onZurueckgesetzt();
        }}
      >
        Demo zurücksetzen
      </button>
    </div>
  );
}

function Demo() {
  const pfad = usePathname();
  const seite = SEITEN[pfad];
  const [runde, setRunde] = useState(0);
  useEffect(() => {
    document.title = seite?.titel ?? "Nicht gefunden · Lion OS";
  }, [seite]);
  return (
    <>
      <DemoLeiste onZurueckgesetzt={() => setRunde((r) => r + 1)} />
      {/* key: Seitenwechsel (und Zurücksetzen) startet die Seite frisch – wie ein echter Seitenaufruf. */}
      <div key={`${pfad}-${runde}`}>{seite ? seite.inhalt() : <NichtGefunden />}</div>
    </>
  );
}

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
