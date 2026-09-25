import type { Ampel, AuditEintrag, Systemstatus } from "./typen";

/** Grenzwerte wie in core/src/system.ts – damit Balken dieselbe Farbe zeigen wie die Ampel. */
export const GRENZEN = {
  speicher: { gelb: 0.8, rot: 0.9 },
  ram: { gelb: 0.85, rot: 0.95 },
  lastProKern: { gelb: 1.0, rot: 2.0 },
  temperatur: { gelb: 75, rot: 85 },
} as const;

const zahlFormat = (stellen: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export function zahl(wert: number, stellen = 0): string {
  return zahlFormat(stellen).format(wert);
}

/** Anteil 0…1, sicher gegen Division durch null und Ausreißer. */
export function anteil(teil: number, ganz: number): number {
  if (!(ganz > 0) || !Number.isFinite(teil)) return 0;
  return Math.min(Math.max(teil / ganz, 0), 1);
}

export function ton(wert: number, grenze: { gelb: number; rot: number }): Ampel {
  if (wert >= grenze.rot) return "rot";
  if (wert >= grenze.gelb) return "gelb";
  return "gruen";
}

/** „3 Tage, 4 Std.“ – nur die zwei größten Einheiten. */
export function dauer(sekunden: number): string {
  const s = Math.max(0, Math.floor(sekunden));
  const tage = Math.floor(s / 86400);
  const std = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (tage > 0) return `${tage} ${tage === 1 ? "Tag" : "Tagen"}, ${std} Std.`;
  if (std > 0) return `${std} Std., ${min} Min.`;
  return `${min} Min.`;
}

export function zeitpunkt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function uhrzeit(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function datumLang(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Verständlicher Name statt Pfad: „/“ ist das System, /srv/lion sind deine Daten. */
export function speicherName(pfad: string): string {
  if (pfad === "/") return "System";
  if (pfad === "/srv/lion") return "Daten";
  return pfad;
}

/** Zustand eines Datenträgers in einem Wort (für das Speicher-Widget). */
export function speicherZustand(t: Ampel): string {
  return t === "rot" ? "Fast voll" : t === "gelb" ? "Wird knapp" : "Gesund";
}

export function begruessung(stunde: number): string {
  if (stunde >= 5 && stunde < 11) return "Guten Morgen";
  if (stunde >= 11 && stunde < 18) return "Guten Tag";
  if (stunde >= 18 && stunde < 23) return "Guten Abend";
  return "Gute Nacht";
}

export const AMPEL_TEXT: Record<Ampel, { titel: string; text: string }> = {
  gruen: { titel: "Alles in Ordnung", text: "Speicher, Arbeitsspeicher, Prozessor und Temperatur sind im grünen Bereich." },
  gelb: { titel: "Bitte ansehen", text: "Etwas nähert sich einer Grenze. Noch kein Problem – aber behalte es im Blick." },
  rot: { titel: "Handlungsbedarf", text: "Etwas ist an der Grenze. Bitte kümmere dich bald darum, sonst drohen Ausfälle." },
};

/** Kennzahlen für die Übersicht, fertig zum Anzeigen. */
export function kennzahlen(s: Systemstatus) {
  const ramBelegtMb = Math.max(0, s.ramGesamtMb - s.ramFreiMb);
  const lastProKern = s.cpuKerne > 0 ? s.last1 / s.cpuKerne : 0;
  return {
    ramGesamtGb: s.ramGesamtMb / 1024,
    cpu: {
      anteil: anteil(lastProKern, 1),
      ton: ton(lastProKern, GRENZEN.lastProKern),
      wert: `${zahl(Math.min(lastProKern, 9.99) * 100)} %`,
      detail: `Last ${zahl(s.last1, 2)} · ${s.cpuKerne} ${s.cpuKerne === 1 ? "Kern" : "Kerne"}`,
    },
    ram: {
      anteil: anteil(ramBelegtMb, s.ramGesamtMb),
      ton: ton(anteil(ramBelegtMb, s.ramGesamtMb), GRENZEN.ram),
      wert: `${zahl(anteil(ramBelegtMb, s.ramGesamtMb) * 100)} %`,
      detail: `${zahl(ramBelegtMb / 1024, 1)} von ${zahl(s.ramGesamtMb / 1024, 1)} GB belegt`,
    },
    // Nicht eingebundene Ordner (Größe 0) nicht anzeigen.
    speicher: s.speicher.filter((sp) => sp.gesamtGb > 0).map((sp) => {
      const belegt = anteil(sp.gesamtGb - sp.freiGb, sp.gesamtGb);
      return {
        pfad: sp.pfad,
        belegtGb: sp.gesamtGb - sp.freiGb,
        gesamtGb: sp.gesamtGb,
        anteil: belegt,
        ton: ton(belegt, GRENZEN.speicher),
        wert: `${zahl(belegt * 100)} %`,
        detail: `${zahl(sp.freiGb)} von ${zahl(sp.gesamtGb)} GB frei`,
      };
    }),
    temperatur:
      s.temperaturC === null
        ? null
        : {
            anteil: anteil(s.temperaturC, 100),
            ton: ton(s.temperaturC, GRENZEN.temperatur),
            wert: `${zahl(s.temperaturC)} °C`,
            detail: s.temperaturC >= GRENZEN.temperatur.gelb ? "Lüftung prüfen" : "Im normalen Bereich",
          },
  };
}

const AKTIONEN: Record<string, string> = {
  einrichtung: "Einrichtung",
  anmeldung: "Anmeldung",
  abmeldung: "Abmeldung",
  "app.installieren": "App installieren",
  "app.starten": "App starten",
  "app.stoppen": "App stoppen",
  "app.entfernen": "App entfernen",
  "hintergrund.hochladen": "Hintergrundfoto hochladen",
  "hintergrund.entfernen": "Hintergrundfoto entfernen",
  "datentraeger.einhaengen": "Datenträger einhängen",
  "datentraeger.aushaengen": "Datenträger aushängen",
};

export function aktionText(aktion: string): string {
  return AKTIONEN[aktion] ?? aktion;
}

export const ERGEBNIS_TEXT: Record<AuditEintrag["ergebnis"], { text: string; ton: Ampel }> = {
  erfolg: { text: "Erfolg", ton: "gruen" },
  abgelehnt: { text: "Abgelehnt", ton: "gelb" },
  fehler: { text: "Fehler", ton: "rot" },
};
