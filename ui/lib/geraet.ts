/** Aus dem User-Agent eine kurze, verständliche Beschreibung machen: „Firefox auf Windows“. Reine Funktion. */
export function geraetText(ua: string | null): string {
  if (!ua) return "Unbekanntes Gerät";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl\//.test(ua)
              ? "curl"
              : null;
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  if (browser && system) return `${browser} auf ${system}`;
  return browser ?? system ?? "Unbekanntes Gerät";
}

export function istMobil(ua: string | null): boolean {
  return Boolean(ua && /iPhone|Android|Mobile/.test(ua));
}
