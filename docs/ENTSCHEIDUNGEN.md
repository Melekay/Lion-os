# Entscheidungen

Jede Architekturentscheidung wird hier mit Datum und Begründung festgehalten.

| # | Datum | Entscheidung | Warum | Alternativen |
|---|---|---|---|---|
| 1 | 25.09.2026 | Kein Proxmox-Fork, eigenes System auf offenen Bausteinen | Eigener Code und eigene Marke. Keine AGPL-Pflicht für den eigenen Code, kein Markenproblem | Proxmox-Fork (AGPLv3, Marke geschützt) |
| 2 | 25.09.2026 | Ausrichtung wie ZimaOS: einfaches Heimserver-System | Machbar, klare Zielgruppe, schneller Nutzen | Vollständige Virtualisierungsplattform |
| 3 | 25.09.2026 | Lion OS = Produkt, Lion Box = Service (Hardware + Betreuung) | Eine Codebasis für beide. Service bringt früh Einnahmen und Feedback | Getrennte Produkte |
| 4 | 25.09.2026 | Basis Debian 13 + Docker | Stabil, verbreitet, gut dokumentiert | Ubuntu, eigenes Minimal-OS |
| 5 | 25.09.2026 | Backend in **TypeScript** (Fastify), UI in Next.js | Eine Sprache für UI und Backend, vorhandenes Know-how | Go (weniger RAM, ein einziges Programm) |
| 6 | 25.09.2026 | Datenplatte mit **btrfs** | Snapshots vor Updates, Rücksprung möglich | ext4 (einfacher, keine Snapshots) |
| 7 | 25.09.2026 | Fernzugriff per **WireGuard** als Standard | Vollständig selbst gehostet, keine Drittanbieter | Tailscale (bequemer, externer Dienst) – später als Option |
| 8 | 25.09.2026 | Lizenzmodell **Open Core** | Offene Basis schafft Vertrauen, Plus-Funktionen finanzieren das Projekt | Komplett Open Source, komplett proprietär |
| 9 | 25.09.2026 | Backup mit **restic** | Verschlüsselt, dedupliziert, viele Ziele (USB, NAS, S3) | borg, rsync |
| 10 | 25.09.2026 | Phase 1 startet mit nur 3 App-Vorlagen | Uptime Kuma (einfach), Vaultwarden (sensibel), Nextcloud (komplex mit DB) prüfen das App-Format vollständig | 12 Apps sofort |
| 11 | 25.09.2026 | SQLite über **`node:sqlite`** (in Node eingebaut) | Keine nativen Pakete, die auf dem Mini-PC kompiliert werden müssten; eine Datei, leicht zu sichern | better-sqlite3 (nativ), PostgreSQL (zu schwer für ein Heimgerät) |
| 12 | 25.09.2026 | Sitzungen als Zufalls-Token, gespeichert als Hash in SQLite | Serverseitig widerrufbar (Abmelden, Sperren), kein Signaturschlüssel nötig | JWT (ohne Zusatzaufwand nicht widerrufbar) |
| 13 | 25.09.2026 | CSRF-Schutz über `SameSite=Strict` + Pflicht-Header `X-Lion-Request` | Einfach, ohne Token-Verwaltung; Browser senden den Header nicht von allein an fremde Seiten | CSRF-Token pro Formular |
| 14 | 25.09.2026 | lion-core lauscht nur auf 127.0.0.1, Caddy davor | API nicht direkt aus dem Netz erreichbar, HTTPS zentral in Caddy | lion-core direkt im Netz |
| 15 | 25.09.2026 | Jede App per **HTTPS über Caddy auf eigenem Port** (8100+n), App selbst nur auf 127.0.0.1 (18100+n) | Alle Apps verschlüsselt (Vaultwarden braucht HTTPS), nur eine Tür nach außen, Docker-Ports umgehen keine Firewall | Unterpfade (viele Apps unterstützen das schlecht), Subdomains (brauchen lokales DNS – später) |
| 16 | 25.09.2026 | Caddy im **Host-Netzwerk** | Kann neue App-Ports öffnen, ohne neu erstellt zu werden, und erreicht Apps auf 127.0.0.1 | Port-Freigaben pro App (Caddy-Container müsste bei jeder App neu erstellt werden) |
| 17 | 25.09.2026 | **Entfernen behält die Daten** | Schutz vor versehentlichem Datenverlust; Löschen der Daten bleibt eine bewusste, getrennte Handlung | Daten mitlöschen |
| 18 | 25.09.2026 | App-Aktionen laufen im Hintergrund, eine Aktion pro App | Image-Downloads dauern Minuten; keine hängenden Anfragen, keine Doppel-Aktionen | Blockierende Anfragen |

## Offen

- Konkrete Lizenz für den offenen Kern (z. B. AGPLv3 oder Apache 2.0) – vor der ersten Veröffentlichung entscheiden.
- Markenname nach Recherche bestätigen.
- Auslieferung von lion-core: Docker-Container oder systemd-Dienst mit Node auf dem Host – Entscheidung bei der Installer-Integration.
- `node:sqlite` meldet in Node 22 noch „experimental“ – beobachten; Fallback wäre better-sqlite3.
