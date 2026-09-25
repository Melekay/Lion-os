# lion-core

API von Lion OS: Einrichtung, Anmeldung, Systemstatus, Audit-Log – später App-Verwaltung und Backup.
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
| GET | `/api/setup/status` | nein | Ist Lion OS schon eingerichtet? |
| POST | `/api/setup` | nein, nur einmal | Ersten Admin anlegen `{name, passwort}` |
| POST | `/api/auth/login` | nein | Anmelden `{name, passwort}` |
| POST | `/api/auth/logout` | ja | Abmelden |
| GET | `/api/auth/me` | ja | Aktueller Benutzer |
| GET | `/api/system` | ja | CPU, RAM, Speicher, Temperatur + Ampel mit Hinweisen |
| GET | `/api/audit?anzahl=100` | ja | Letzte Einträge des Audit-Logs |

Alle ändernden Anfragen (POST, PUT, DELETE) brauchen den Header `X-Lion-Request: 1` (CSRF-Schutz).

## Sicherheit

- **Passwörter:** scrypt mit Salt, mindestens 12 Zeichen; Klartext wird nie gespeichert oder protokolliert.
- **Sitzungen:** Zufalls-Token im Cookie (`HttpOnly`, `Secure`, `SameSite=Strict`), in der Datenbank nur dessen SHA-256-Hash; Abmelden löscht serverseitig.
- **Anmeldesperre:** 5 Fehlversuche in 15 Minuten → 15 Minuten gesperrt (pro IP).
- Gleiche Antwort für falsches Passwort und unbekannten Namen; auch bei unbekanntem Namen wird gehasht (keine Laufzeit-Unterschiede).
- **Einrichtung** ist nur möglich, solange noch kein Benutzer existiert.
- **Audit-Log** für Einrichtung, An- und Abmeldung inklusive Fehlversuchen.

## Systemstatus (Ampel)

| Bereich | Gelb ab | Rot ab |
|---|---|---|
| Speicher belegt | 80 % | 90 % |
| Arbeitsspeicher belegt (MemAvailable) | 85 % | 95 % |
| CPU-Last pro Kern (1 min) | 1,0 | 2,0 |
| Temperatur | 75 °C | 85 °C |
