# lion-ui

Weboberfläche von Lion OS – aufgebaut wie ein Schreibtisch (Vorbild ZimaOS): links Widgets, rechts deine Apps als Kacheln.
Next.js 16 als **statischer Export** – Caddy liefert die Dateien aus, alle Daten kommen über `/api` von lion-core.
Kein eigener Server, keine Cookies außer der Sitzung von lion-core, kein Tracking, keine Schriften aus dem Internet.

## Seiten

| Pfad | Inhalt |
|---|---|
| `/einrichtung/` | Erster Admin mit Einrichtungscode (nur solange niemand eingerichtet ist) |
| `/anmelden/` | Anmeldung |
| `/` | Startseite. **Links** Widgets: Uhr, System (CPU/RAM als Ringe, Ampel mit Hinweisen), Speicher, Netzwerk-Verlauf, letzte Aktivität. **Rechts** Suche und Kacheln: App Store, installierte Apps (Klick öffnet die App, Punkt zeigt den Status), Protokoll |
| `/apps/` | App Store: installieren, öffnen, starten, stoppen, entfernen (mit Bestätigung, Daten bleiben) |
| `/protokoll/` | Audit-Log von lion-core |
| `/backup/` | Backup einrichten (Ziel, Uhrzeit, Schlüssel einmalig anzeigen), Status, Jetzt sichern, Zeitplan, Sicherungen mit Wiederherstellen pro App, Schlüssel mit Passwort anzeigen |
| `/einstellungen/` | Name der Box, Version, Adressen, Passwort ändern, angemeldete Geräte (einzeln oder alle anderen abmelden), Hinweis zu Updates |

## Entwickeln

```bash
cd ui
npm install
npm run build                                  # erzeugt out/
LION_API=http://127.0.0.1:8080 npm run vorschau   # out/ + /api-Weiterleitung, wie Caddy
```

`npm run dev` zeigt nur die Oberfläche; die API gibt es dort nicht (statischer Export kann keine Weiterleitungen).

## Prüfen

| Befehl | Was |
|---|---|
| `npm run check` | Typecheck, Lint, Unit-Tests, Build |
| `npm run test:e2e` | Browser-Tests (vorher `npm run build` und lion-core bauen: `cd ../core && npm ci && npm run build`) |

Die Browser-Tests laufen auf Desktop und Handy:
- **Attrappe** (`tests/e2e/attrappe.spec.ts`): API im Browser nachgebildet – Installation, Fehler, Entfernen-Dialog, abgelaufene Sitzung, volle Platte. Mit axe-Prüfung (WCAG 2.2 AA).
- **Echt** (`tests/e2e/echt.spec.ts`): echtes lion-core mit leerer Datenbank – Einrichtung mit Code, Katalog, Protokoll, Abmelden.

## Regeln

- App-Symbole sind eigene Farbverläufe mit Piktogramm (`components/AppSymbol.tsx`) – keine fremden Markenlogos.
- Nur `lib/api.ts` spricht mit lion-core. Ändernde Anfragen tragen immer `X-Lion-Request: 1`.
- Typen in `lib/typen.ts` spiegeln lion-core – bei API-Änderungen beide Seiten anpassen.
- Farben nur über die Tokens in `app/globals.css`; Kontrast mindestens WCAG AA; `prefers-reduced-motion` wird respektiert.
- Kein `dangerouslySetInnerHTML`; externe Links mit `rel="noopener noreferrer"`.
- Der Schutz liegt in lion-core. Die Oberfläche führt nur – sie entscheidet nie über Rechte.
