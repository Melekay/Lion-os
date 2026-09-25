import { connect } from "node:net";
import type { Datentraeger } from "./helfer/datentraeger.js";

/**
 * lion-core → lion-helper. Eine Anfrage je Verbindung, feste Aktionen.
 * Fehlt der Dienst (z. B. in Entwicklung), meldet der Client das verständlich.
 */
export class HelferNichtErreichbar extends Error {}
export class HelferAblehnung extends Error {}

export interface Helfer {
  datentraeger(): Promise<Datentraeger[]>;
  einhaengen(uuid: string): Promise<{ einhaengepunkt: string; backupOrdner: string }>;
  aushaengen(uuid: string): Promise<{ ok: true }>;
}

export class HelferClient implements Helfer {
  constructor(
    private readonly socket: string,
    private readonly zeitlimitMs = 90_000,
  ) {}

  private anfrage<T>(daten: Record<string, unknown>): Promise<T> {
    return new Promise((fertig, fehler) => {
      const s = connect(this.socket);
      let antwort = "";
      const abbruch = setTimeout(() => {
        s.destroy();
        fehler(new HelferNichtErreichbar("lion-helper antwortet nicht."));
      }, this.zeitlimitMs);
      s.setEncoding("utf8");
      s.on("connect", () => s.write(`${JSON.stringify(daten)}\n`));
      s.on("data", (t: string) => {
        antwort += t;
        if (antwort.length > 1024 * 1024) s.destroy();
      });
      s.on("error", () => {
        clearTimeout(abbruch);
        fehler(new HelferNichtErreichbar("lion-helper läuft nicht. Prüfe: sudo systemctl status lion-helper"));
      });
      s.on("end", () => {
        clearTimeout(abbruch);
        try {
          const a = JSON.parse(antwort) as { ok: boolean; daten?: T; fehler?: string };
          if (a.ok) fertig(a.daten as T);
          else fehler(new HelferAblehnung(a.fehler ?? "lion-helper hat abgelehnt."));
        } catch {
          fehler(new HelferNichtErreichbar("Unverständliche Antwort von lion-helper."));
        }
      });
    });
  }

  async datentraeger() {
    return (await this.anfrage<{ datentraeger: Datentraeger[] }>({ aktion: "datentraeger" })).datentraeger;
  }
  einhaengen(uuid: string) {
    return this.anfrage<{ einhaengepunkt: string; backupOrdner: string }>({ aktion: "einhaengen", uuid });
  }
  aushaengen(uuid: string) {
    return this.anfrage<{ ok: true }>({ aktion: "aushaengen", uuid });
  }
}
