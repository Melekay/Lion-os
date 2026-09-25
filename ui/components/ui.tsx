import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { Ton } from "@/lib/apps";

/* ---------------------------------------------------------------------------
   Grundbausteine der Oberfläche. Alle Farben kommen aus den Tokens in globals.css.
   --------------------------------------------------------------------------- */

type KnopfArt = "gold" | "rahmen" | "leise" | "gefahr";

const KNOPF: Record<KnopfArt, string> = {
  gold: "bg-gold text-auf-gold hover:bg-gold-hell shadow-gold",
  rahmen: "border border-linie-hell bg-flaeche-2 text-text hover:border-gold/60 hover:bg-flaeche-3",
  leise: "text-gedaempft hover:bg-flaeche-2 hover:text-text",
  gefahr: "border border-rot/50 bg-rot-flaeche text-rot hover:border-rot hover:bg-rot/15",
};

export function Knopf({
  art = "gold",
  laedt = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { art?: KnopfArt; laedt?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || laedt}
      aria-busy={laedt || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-feld px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${KNOPF[art]} ${className}`}
      {...rest}
    >
      {laedt && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Karte({
  children,
  className = "",
  as: Tag = "section",
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  id?: string;
}) {
  return (
    <Tag id={id} className={`rounded-karte border border-glas bg-flaeche/80 shadow-karte backdrop-blur-md ${className}`}>
      {children}
    </Tag>
  );
}

export function Feld({
  label,
  hilfe,
  fehler,
  id,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hilfe?: ReactNode; fehler?: string | null; id: string }) {
  const beschreibung = [hilfe ? `${id}-hilfe` : null, fehler ? `${id}-fehler` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={beschreibung}
        className={`block min-h-12 w-full rounded-feld border border-linie-hell bg-grund/60 px-3.5 text-base text-text placeholder:text-gedaempft/70 transition focus:border-gold focus:outline-none focus-visible:outline-3 focus-visible:outline-fokus aria-[invalid=true]:border-rot ${className}`}
        {...rest}
      />
      {hilfe && (
        <p id={`${id}-hilfe`} className="text-sm text-gedaempft">
          {hilfe}
        </p>
      )}
      {fehler && (
        <p id={`${id}-fehler`} className="text-sm font-medium text-rot">
          {fehler}
        </p>
      )}
    </div>
  );
}

const HINWEIS = {
  gruen: { klasse: "border-gruen/40 bg-gruen-flaeche", icon: CheckCircle2, farbe: "text-gruen" },
  gelb: { klasse: "border-gelb/40 bg-gelb-flaeche", icon: AlertTriangle, farbe: "text-gelb" },
  rot: { klasse: "border-rot/40 bg-rot-flaeche", icon: XCircle, farbe: "text-rot" },
  info: { klasse: "border-linie-hell bg-flaeche-2", icon: Info, farbe: "text-akzent" },
} as const;

/** `rolle`: Standard ist eine Live-Meldung (alert/status). Für Hinweise, die schon beim Laden dastehen, „note“ nehmen. */
export function Hinweis({
  ton = "info",
  titel,
  rolle,
  children,
}: {
  ton?: keyof typeof HINWEIS;
  titel?: string;
  rolle?: "alert" | "status" | "note";
  children?: ReactNode;
}) {
  const h = HINWEIS[ton];
  const Icon = h.icon;
  return (
    <div role={rolle ?? (ton === "rot" ? "alert" : "status")} className={`flex gap-3 rounded-feld border p-4 text-sm ${h.klasse}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${h.farbe}`} aria-hidden="true" />
      <div className="space-y-1">
        {titel && <p className="font-semibold text-text">{titel}</p>}
        {children && <div className="text-text/90">{children}</div>}
      </div>
    </div>
  );
}

const PUNKT: Record<Ton, string> = {
  gruen: "bg-gruen text-gruen",
  gelb: "bg-gelb text-gelb",
  rot: "bg-rot text-rot",
  neutral: "bg-gedaempft text-gedaempft",
  arbeitet: "bg-gold text-akzent puls",
};

export function StatusPille({ ton, children }: { ton: Ton; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-linie bg-grund/50 px-2.5 py-1 text-xs font-semibold">
      <span className={`h-2 w-2 rounded-full ${PUNKT[ton]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

const BALKEN: Record<"gruen" | "gelb" | "rot", string> = {
  gruen: "from-emerald-400 to-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.55)]",
  gelb: "from-amber-300 to-orange-500 shadow-[0_0_14px_rgba(251,146,60,0.55)]",
  rot: "from-rose-400 to-red-500 shadow-[0_0_14px_rgba(244,63,94,0.6)]",
};

/** Füllstand mit Ampelfarbe (Gold = normal, Gelb/Rot = Grenze nahe). */
export function Messbalken({ anteil, ton, label }: { anteil: number; ton: "gruen" | "gelb" | "rot"; label: string }) {
  const prozent = Math.round(anteil * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={prozent}
      className="h-2.5 w-full overflow-hidden rounded-full bg-flaeche-3"
    >
      <div className={`h-full rounded-full bg-linear-to-r transition-[width] duration-700 ${BALKEN[ton]}`} style={{ width: `${Math.max(prozent, 2)}%` }} />
    </div>
  );
}

/**
 * Kennzahl-Kachel wie bei Homarr: kleine Überschrift, große Zahl, leuchtender Balken, Details als Chips.
 * Die Zahl steht ohne Einheit groß da, die Einheit kleiner daneben.
 */
export function Kennzahl({
  titel,
  wert,
  einheit,
  anteil,
  ton,
  label,
  chips = [],
  rechts,
}: {
  titel: string;
  wert: string;
  einheit?: string;
  anteil: number;
  ton: "gruen" | "gelb" | "rot";
  /** Name des Balkens für Screenreader, z. B. „Arbeitsspeicher belegt“. */
  label: string;
  chips?: string[];
  rechts?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-feld border border-linie bg-flaeche-2 p-4">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-gedaempft">{titel}</p>
        {rechts}
      </div>
      <p className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">
        {wert}
        {einheit && <span className="text-lg font-semibold text-gedaempft"> {einheit}</span>}
      </p>
      <Messbalken anteil={anteil} ton={ton} label={label} />
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={c} className="rounded-full border border-linie bg-grund/40 px-2.5 py-1 text-xs font-semibold tabular-nums">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Lader({ text, vollbild = false }: { text: string; vollbild?: boolean }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 text-gedaempft ${vollbild ? "min-h-dvh" : "py-16"}`}>
      <Loader2 className="h-5 w-5 animate-spin text-akzent" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function SeitenKopf({ titel, text, aktion }: { titel: string; text?: ReactNode; aktion?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold sm:text-4xl">{titel}</h1>
        {text && <p className="max-w-2xl text-gedaempft">{text}</p>}
      </div>
      {aktion}
    </header>
  );
}
