import {
  Activity,
  ArchiveRestore,
  Bot,
  Box,
  ChefHat,
  Clapperboard,
  Cloud,
  FileStack,
  Film,
  FolderOpen,
  Headphones,
  Home,
  House,
  Images,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Music,
  ScanText,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";

/**
 * Eigene App-Symbole: Farbverlauf + Piktogramm. Bewusst keine fremden Markenlogos –
 * jede App ist trotzdem auf einen Blick unterscheidbar.
 */
type Symbol = { icon: LucideIcon; verlauf: string };

const NACH_ID: Record<string, Symbol> = {
  "uptime-kuma": { icon: Activity, verlauf: "from-emerald-400 to-teal-600" },
  vaultwarden: { icon: KeyRound, verlauf: "from-indigo-400 to-blue-700" },
  nextcloud: { icon: Cloud, verlauf: "from-sky-400 to-blue-600" },
  immich: { icon: Images, verlauf: "from-fuchsia-400 to-pink-600" },
  "paperless-ngx": { icon: ScanText, verlauf: "from-lime-400 to-green-700" },
  jellyfin: { icon: Clapperboard, verlauf: "from-purple-400 to-indigo-700" },
  filebrowser: { icon: FolderOpen, verlauf: "from-cyan-400 to-sky-700" },
  navidrome: { icon: Music, verlauf: "from-rose-400 to-red-600" },
  audiobookshelf: { icon: Headphones, verlauf: "from-amber-400 to-orange-700" },
  mealie: { icon: ChefHat, verlauf: "from-orange-300 to-rose-600" },
  actual: { icon: Wallet, verlauf: "from-teal-300 to-emerald-700" },
  "stirling-pdf": { icon: FileStack, verlauf: "from-red-400 to-rose-700" },
  ollama: { icon: Bot, verlauf: "from-violet-300 to-fuchsia-700" },
  "home-assistant": { icon: House, verlauf: "from-sky-300 to-cyan-700" },
  "app-store": { icon: LayoutGrid, verlauf: "from-gold-hell to-gold-dunkel" },
  protokoll: { icon: ScrollText, verlauf: "from-stone-300 to-stone-500" },
  einstellungen: { icon: Settings, verlauf: "from-slate-400 to-slate-600" },
  backup: { icon: ArchiveRestore, verlauf: "from-violet-400 to-purple-700" },
};

const NACH_KATEGORIE: Record<string, Symbol> = {
  ueberwachung: { icon: Activity, verlauf: "from-emerald-400 to-teal-600" },
  sicherheit: { icon: Shield, verlauf: "from-indigo-400 to-blue-700" },
  dateien: { icon: Cloud, verlauf: "from-sky-400 to-blue-600" },
  medien: { icon: Film, verlauf: "from-rose-400 to-red-600" },
  smarthome: { icon: Home, verlauf: "from-amber-300 to-orange-600" },
  fotos: { icon: Images, verlauf: "from-fuchsia-400 to-pink-600" },
  dokumente: { icon: ScanText, verlauf: "from-lime-400 to-green-700" },
  haushalt: { icon: Wallet, verlauf: "from-teal-300 to-emerald-700" },
  ki: { icon: Sparkles, verlauf: "from-violet-300 to-fuchsia-700" },
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
