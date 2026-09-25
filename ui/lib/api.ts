import type { AppAnsicht, AuditEintrag, SetupStatus, Systemstatus } from "./typen";

/** Fehler einer API-Anfrage mit einer Meldung, die man direkt anzeigen kann. */
export class ApiFehler extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiFehler";
  }
}

/** Kennung gegen CSRF: lion-core lehnt ändernde Anfragen ohne diesen Header ab. */
export const CSRF_HEADER = "x-lion-request";

function standardMeldung(status: number): string {
  if (status === 401) return "Bitte melde dich an.";
  if (status === 403) return "Das ist nicht erlaubt.";
  if (status === 404) return "Nicht gefunden.";
  if (status === 429) return "Zu viele Versuche. Bitte warte kurz.";
  if (status >= 500) return "Lion OS hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
  return "Die Anfrage ist fehlgeschlagen.";
}

type Optionen = { methode?: "GET" | "POST"; daten?: unknown; signal?: AbortSignal };

/** Anfrage an lion-core (immer dieselbe Adresse wie die Oberfläche, Cookie wird mitgeschickt). */
export async function api<T>(pfad: string, opt: Optionen = {}): Promise<T> {
  const methode = opt.methode ?? (opt.daten === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { accept: "application/json" };
  if (methode !== "GET") headers[CSRF_HEADER] = "1";
  let body: string | undefined;
  if (opt.daten !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opt.daten);
  }

  let antwort: Response;
  try {
    antwort = await fetch(pfad, { method: methode, headers, body, credentials: "same-origin", cache: "no-store", signal: opt.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiFehler(0, "Lion OS ist gerade nicht erreichbar. Prüfe die Verbindung.");
  }

  const text = await antwort.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!antwort.ok) {
    const meldung =
      json && typeof json === "object" && "fehler" in json && typeof json.fehler === "string" ? json.fehler : standardMeldung(antwort.status);
    throw new ApiFehler(antwort.status, meldung);
  }
  return json as T;
}

const app = (id: string) => `/api/apps/${encodeURIComponent(id)}`;

/** Alle Endpunkte von lion-core, die die Oberfläche nutzt. */
export const lion = {
  setupStatus: () => api<SetupStatus>("/api/setup/status"),
  einrichten: (d: { name: string; passwort: string; code?: string }) => api<{ name: string }>("/api/setup", { daten: d }),
  anmelden: (d: { name: string; passwort: string }) => api<{ name: string }>("/api/auth/login", { daten: d }),
  abmelden: () => api<{ ok: true }>("/api/auth/logout", { methode: "POST" }),
  ich: () => api<{ name: string }>("/api/auth/me"),
  system: () => api<Systemstatus>("/api/system"),
  protokoll: (anzahl = 100) => api<{ eintraege: AuditEintrag[] }>(`/api/audit?anzahl=${anzahl}`),
  apps: () => api<{ apps: AppAnsicht[] }>("/api/apps"),
  appAktion: (id: string, aktion: "installieren" | "starten" | "stoppen") => api<unknown>(`${app(id)}/${aktion}`, { methode: "POST" }),
  appEntfernen: (id: string, bestaetigung: string) => api<unknown>(`${app(id)}/entfernen`, { daten: { bestaetigung } }),
};
