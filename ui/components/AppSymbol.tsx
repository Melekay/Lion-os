import { Activity, Box, Cloud, Film, Home, KeyRound, LayoutGrid, type LucideIcon, ScrollText, Shield } from "lucide-react";

/**
 * Eigene App-Symbole: Farbverlauf + Piktogramm. Bewusst keine fremden Markenlogos –
 * jede App ist trotzdem auf einen Blick unterscheidbar.
 */
type Symbol = { icon: LucideIcon; verlauf: string };

const NACH_ID: Record<string, Symbol> = {
  "uptime-kuma": { icon: Activity, verlauf: "from-emerald-400 to-teal-600" },
  vaultwarden: { icon: KeyRound, verlauf: "from-indigo-400 to-blue-700" },
  nextcloud: { icon: Cloud, verlauf: "from-sky-400 to-blue-600" },
  "app-store": { icon: LayoutGrid, verlauf: "from-gold-hell to-gold-dunkel" },
  protokoll: { icon: ScrollText, verlauf: "from-stone-300 to-stone-500" },
};

const NACH_KATEGORIE: Record<string, Symbol> = {
  ueberwachung: { icon: Activity, verlauf: "from-emerald-400 to-teal-600" },
  sicherheit: { icon: Shield, verlauf: "from-indigo-400 to-blue-700" },
  dateien: { icon: Cloud, verlauf: "from-sky-400 to-blue-600" },
  medien: { icon: Film, verlauf: "from-rose-400 to-red-600" },
  smarthome: { icon: Home, verlauf: "from-amber-300 to-orange-600" },
};

export function AppSymbol({ id, kategorie = "", groesse = "gross" }: { id: string; kategorie?: string; groesse?: "gross" | "klein" }) {
  const s = NACH_ID[id] ?? NACH_KATEGORIE[kategorie] ?? { icon: Box, verlauf: "from-zinc-400 to-zinc-600" };
  const Icon = s.icon;
  const masse = groesse === "gross" ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-xl";
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center bg-linear-to-br shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] ${s.verlauf} ${masse}`}
    >
      <Icon className={groesse === "gross" ? "h-7 w-7 text-white drop-shadow" : "h-5.5 w-5.5 text-white drop-shadow"} strokeWidth={2.2} />
    </span>
  );
}
