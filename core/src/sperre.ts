/**
 * Schutz gegen Passwort-Raten: Nach MAX_VERSUCHE Fehlversuchen innerhalb des Fensters
 * wird der Schlüssel (z. B. IP-Adresse) für SPERRE_MS gesperrt. Rein im Arbeitsspeicher.
 */
export const MAX_VERSUCHE = 5;
export const FENSTER_MS = 15 * 60 * 1000;
export const SPERRE_MS = 15 * 60 * 1000;

type Eintrag = { fehlversuche: number; ersterVersuch: number; gesperrtBis: number };

export class AnmeldeSperre {
  private eintraege = new Map<string, Eintrag>();

  /** Verbleibende Sperrzeit in ms (0 = nicht gesperrt). */
  gesperrtFuer(schluessel: string, jetzt = Date.now()): number {
    const e = this.eintraege.get(schluessel);
    return e && e.gesperrtBis > jetzt ? e.gesperrtBis - jetzt : 0;
  }

  fehlversuch(schluessel: string, jetzt = Date.now()): void {
    let e = this.eintraege.get(schluessel);
    if (!e || jetzt - e.ersterVersuch > FENSTER_MS) {
      e = { fehlversuche: 0, ersterVersuch: jetzt, gesperrtBis: 0 };
    }
    e.fehlversuche += 1;
    if (e.fehlversuche >= MAX_VERSUCHE) e.gesperrtBis = jetzt + SPERRE_MS;
    this.eintraege.set(schluessel, e);
  }

  erfolg(schluessel: string): void {
    this.eintraege.delete(schluessel);
  }
}
