/**
 * Bildmarke: stilisierte Löwenmähne als Strahlenkranz um ein „L“. Rein geometrisch, kein fremdes Logo.
 * Bewusst ohne SVG-Verlauf: Mehrere Logos auf einer Seite (eins davon versteckt) würden sich die ID teilen.
 */
export function Bildmarke({ className = "h-8 w-8" }: { className?: string }) {
  const strahlen = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {strahlen.map((w) => (
        <rect key={w} x="22.5" y="2" width="3" height="9" rx="1.5" fill={w % 60 === 0 ? "#f5a524" : "#c77700"} transform={`rotate(${w} 24 24)`} opacity={w % 60 === 0 ? 1 : 0.75} />
      ))}
      <circle cx="24" cy="24" r="11" fill="#f5a524" />
      <path d="M20.5 18v12h8" fill="none" stroke="#221400" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ klein = false }: { klein?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Bildmarke className={klein ? "h-7 w-7" : "h-9 w-9"} />
      <span className={`font-display font-semibold tracking-tight ${klein ? "text-lg" : "text-xl"}`}>
        Lion <span className="text-akzent">OS</span>
      </span>
    </span>
  );
}
