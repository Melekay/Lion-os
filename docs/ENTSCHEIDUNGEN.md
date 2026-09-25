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

## Offen

- Konkrete Lizenz für den offenen Kern (z. B. AGPLv3 oder Apache 2.0) – vor der ersten Veröffentlichung entscheiden.
- Markenname nach Recherche bestätigen.
