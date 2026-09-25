# lion-core

API von Lion OS: Einrichtung, Anmeldung, Systemstatus, Audit-Log und App-Verwaltung – später Backup.
TypeScript, Fastify 5, SQLite über das in Node eingebaute `node:sqlite` (keine nativen Pakete). Node ≥ 22.13.

## Starten (Entwicklung)

```bash
cd core
npm install
LION_SECRET=$(openssl rand -hex 32) LION_DB=./dev.db LION_PORT=8080 npm run dev
```

Im Betrieb lauscht lion-core nur auf `127.0.0.1`; Caddy leitet von außen weiter. Beispielwerte: `.env.example`.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklungsserver mit Neustart bei Änderungen |
| `npm run check` | Typecheck + Tests + Build |
| `npm test` | Vitest |

## API

| Methode | Pfad | Anmeldung | Zweck |
|---|---|---|---|
| GET | `/api/health` | nein | Lebenszeichen + Version |
| GET | `/api/setup/status` | nein | Ist Lion OS schon eingerichtet? Braucht es einen Code? `{eingerichtet, codeNoetig}` |
| POST | `/api/setup` | nein, nur einmal | Ersten Admin anlegen `{name, passwort, code}` |
| POST | `/api/auth/login` | nein | Anmelden `{name, passwort}` |
| POST | `/api/auth/logout` | ja | Abmelden |
| GET | `/api/auth/me` | ja | Aktueller Benutzer |
| GET | `/api/system` | ja | CPU, RAM, Speicher, Temperatur + Ampel mit Hinweisen |
| GET | `/api/audit?anzahl=100` | ja | Letzte Einträge des Audit-Logs |
| GET | `/api/apps` | ja | Katalog mit Installationsstatus und HTTPS-Adressen |
| POST | `/api/apps/:id/installieren` | ja | Installation im Hintergrund starten (202) |
| POST | `/api/apps/:id/starten` · `/stoppen` | ja | App starten bzw. stoppen (202) |
| POST | `/api/apps/:id/entfernen` | ja | Entfernen, Body `{bestaetigung: "<id>"}` – Daten bleiben erhalten (202) |

Alle ändernden Anfragen (POST, PUT, DELETE) brauchen den Header `X-Lion-Request: 1` (CSRF-Schutz).

## Sicherheit

- **Passwörter:** scrypt mit Salt, mindestens 12 Zeichen; Klartext wird nie gespeichert oder protokolliert.
- **Sitzungen:** Zufalls-Token im Cookie (`HttpOnly`, `Secure`, `SameSite=Strict`), in der Datenbank nur dessen SHA-256-Hash; Abmelden löscht serverseitig.
- **Anmeldesperre:** 5 Fehlversuche in 15 Minuten → 15 Minuten gesperrt (pro IP).
- Gleiche Antwort für falsches Passwort und unbekannten Namen; auch bei unbekanntem Namen wird gehasht (keine Laufzeit-Unterschiede).
- **Einrichtung** ist nur möglich, solange noch kein Benutzer existiert – und nur mit dem Einrichtungscode
  (`LION_SETUP_CODE`, vom Installer erzeugt). Vergleich in konstanter Zeit, Groß-/Kleinschreibung und Bindestriche egal,
  nach 5 falschen Codes 15 Minuten Sperre. Ohne `LION_SETUP_CODE` (nur Entwicklung) warnt lion-core beim Start.
- **Audit-Log** für Einrichtung, An- und Abmeldung inklusive Fehlversuchen.
- **Im Betrieb:** systemd-Dienst `lion-core` als Benutzer `lion` mit Sandbox (siehe `installer/README.md`).

## Apps

```
Browser ──HTTPS──▶ Caddy (Host-Netz, Port 8100+n) ──▶ 127.0.0.1:18100+n ──▶ App-Container
```

- Vorlagen kommen aus `LION_KATALOG` (Standard `/opt/lion/apps`) und werden beim Start gegen die Sicherheitsregeln geprüft
  (feste Image-Versionen, Port nur auf 127.0.0.1, Daten nur unter `${LION_APP_DATA}`, kein privileged, kein Docker-Socket …).
  Abgelehnte Vorlagen erscheinen im Log, nicht im Katalog.
- Installation: Zustand in `/var/lib/lion/apps/<id>` (`compose.yaml`, `.env` mit Rechten 600 und zufälligen Geheimnissen),
  Daten in `/srv/lion/apps/<id>`, Caddy-Eintrag in `/opt/lion/stack/apps/<id>.caddy`, danach `caddy reload`.
- Docker wird nur über `docker compose` mit festen Argumenten aufgerufen – ohne Shell, Projektnamen `lion-app-<id>`.
- Pro App läuft immer nur eine Aktion; Fortschritt über `GET /api/apps` (`installiere` → `laeuft` oder `fehler` mit Meldung).
- **Entfernen löscht keine Daten.** Der Datenordner bleibt, bis du ihn selbst löschst.

| Variable | Standard |
|---|---|
| `LION_KATALOG` | `/opt/lion/apps` |
| `LION_APPS_ZUSTAND` | `/var/lib/lion/apps` |
| `LION_APPS_DATEN` | `/srv/lion/apps` |
| `LION_CADDY_APPS` | `/opt/lion/stack/apps` |
| `LION_ADRESSEN` | `/etc/lion/adressen` |

Echter Docker-Test: `LION_DOCKER_TEST=1 npx vitest run test/docker.integration.test.ts`

## Systemstatus (Ampel)

| Bereich | Gelb ab | Rot ab |
|---|---|---|
| Speicher belegt | 80 % | 90 % |
| Arbeitsspeicher belegt (MemAvailable) | 85 % | 95 % |
| CPU-Last pro Kern (1 min) | 1,0 | 2,0 |
| Temperatur | 75 °C | 85 °C |
