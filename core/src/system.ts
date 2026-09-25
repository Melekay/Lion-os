import { readdir, readFile, statfs } from "node:fs/promises";
import os from "node:os";

/** Systemstatus für das Dashboard. Die Bewertung (Ampel) ist eine reine Funktion. */

export type Ampel = "gruen" | "gelb" | "rot";

export type Messwerte = {
  cpuKerne: number;
  last1: number;
  ramGesamtMb: number;
  ramFreiMb: number;
  speicher: { pfad: string; gesamtGb: number; freiGb: number }[];
  temperaturC: number | null;
  laufzeitS: number;
};

export type Hinweis = { bereich: "cpu" | "ram" | "speicher" | "temperatur"; stufe: Ampel; text: string };

export type Systemstatus = Messwerte & { ampel: Ampel; hinweise: Hinweis[] };

export const GRENZEN = {
  speicherGelb: 0.8,
  speicherRot: 0.9,
  ramGelb: 0.85,
  ramRot: 0.95,
  lastGelb: 1.0, // Last pro Kern
  lastRot: 2.0,
  tempGelb: 75,
  tempRot: 85,
} as const;

const schlimmer = (a: Ampel, b: Ampel): Ampel => (a === "rot" || b === "rot" ? "rot" : a === "gelb" || b === "gelb" ? "gelb" : "gruen");

export function bewerte(m: Messwerte): { ampel: Ampel; hinweise: Hinweis[] } {
  const hinweise: Hinweis[] = [];

  for (const s of m.speicher) {
    if (s.gesamtGb <= 0) continue;
    const belegt = 1 - s.freiGb / s.gesamtGb;
    const prozent = Math.round(belegt * 100);
    if (belegt >= GRENZEN.speicherRot) {
      hinweise.push({ bereich: "speicher", stufe: "rot", text: `Speicher ${s.pfad} ist zu ${prozent} % voll. Bitte Platz schaffen, sonst drohen Ausfälle.` });
    } else if (belegt >= GRENZEN.speicherGelb) {
      hinweise.push({ bereich: "speicher", stufe: "gelb", text: `Speicher ${s.pfad} ist zu ${prozent} % voll.` });
    }
  }

  if (m.ramGesamtMb > 0) {
    const belegt = 1 - m.ramFreiMb / m.ramGesamtMb;
    const prozent = Math.round(belegt * 100);
    if (belegt >= GRENZEN.ramRot) hinweise.push({ bereich: "ram", stufe: "rot", text: `Arbeitsspeicher zu ${prozent} % belegt.` });
    else if (belegt >= GRENZEN.ramGelb) hinweise.push({ bereich: "ram", stufe: "gelb", text: `Arbeitsspeicher zu ${prozent} % belegt.` });
  }

  const lastProKern = m.cpuKerne > 0 ? m.last1 / m.cpuKerne : 0;
  if (lastProKern >= GRENZEN.lastRot) hinweise.push({ bereich: "cpu", stufe: "rot", text: "Der Prozessor ist stark überlastet." });
  else if (lastProKern >= GRENZEN.lastGelb) hinweise.push({ bereich: "cpu", stufe: "gelb", text: "Der Prozessor ist stark ausgelastet." });

  if (m.temperaturC !== null) {
    if (m.temperaturC >= GRENZEN.tempRot) hinweise.push({ bereich: "temperatur", stufe: "rot", text: `Temperatur ${m.temperaturC} °C – zu heiß. Lüftung prüfen.` });
    else if (m.temperaturC >= GRENZEN.tempGelb) hinweise.push({ bereich: "temperatur", stufe: "gelb", text: `Temperatur ${m.temperaturC} °C – erhöht.` });
  }

  const ampel = hinweise.reduce<Ampel>((a, h) => schlimmer(a, h.stufe), "gruen");
  return { ampel, hinweise };
}

async function hoechsteTemperatur(basis = "/sys/class/thermal"): Promise<number | null> {
  try {
    const zonen = (await readdir(basis)).filter((n) => n.startsWith("thermal_zone"));
    const werte = await Promise.all(
      zonen.map(async (z) => {
        const roh = await readFile(`${basis}/${z}/temp`, "utf8").catch(() => "");
        const milli = Number.parseInt(roh.trim(), 10);
        return Number.isFinite(milli) ? milli / 1000 : null;
      }),
    );
    const gueltig = werte.filter((w): w is number => w !== null && w > 0 && w < 150);
    return gueltig.length ? Math.round(Math.max(...gueltig)) : null;
  } catch {
    return null;
  }
}

/** Verfügbarer RAM in MB (MemAvailable zählt freigebbaren Cache mit, anders als os.freemem()). */
async function verfuegbarerRamMb(): Promise<number> {
  try {
    const info = await readFile("/proc/meminfo", "utf8");
    const treffer = /^MemAvailable:\s+(\d+)\s+kB/m.exec(info);
    if (treffer?.[1]) return Math.round(Number(treffer[1]) / 1024);
  } catch {
    /* kein Linux – Rückfall unten */
  }
  return Math.round(os.freemem() / 1024 ** 2);
}

export async function messe(speicherPfade: string[] = ["/"]): Promise<Messwerte> {
  const speicher = await Promise.all(
    speicherPfade.map(async (pfad) => {
      try {
        const s = await statfs(pfad);
        const gb = (bloecke: number) => Math.round(((bloecke * s.bsize) / 1024 ** 3) * 10) / 10;
        return { pfad, gesamtGb: gb(s.blocks), freiGb: gb(s.bavail) };
      } catch {
        return { pfad, gesamtGb: 0, freiGb: 0 };
      }
    }),
  );
  return {
    cpuKerne: os.cpus().length,
    last1: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
    ramGesamtMb: Math.round(os.totalmem() / 1024 ** 2),
    ramFreiMb: await verfuegbarerRamMb(),
    speicher,
    temperaturC: await hoechsteTemperatur(),
    laufzeitS: Math.round(os.uptime()),
  };
}

export async function systemstatus(speicherPfade?: string[]): Promise<Systemstatus> {
  const m = await messe(speicherPfade);
  return { ...m, ...bewerte(m) };
}
