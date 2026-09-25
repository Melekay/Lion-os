# Lion OS – Projektregeln

Heimserver-System für Mini-PCs: Web-Oberfläche + App-Store (Docker) + Backup. Basis Debian 13.
Lion Box = Lion OS + Hardware + Betreuung (kein eigener Code).

## Struktur
- `installer/` Bash-Installationsskript (idempotent, `set -euo pipefail`, shellcheck-sauber)
- `core/` lion-core: TypeScript, Fastify, SQLite
- `ui/` lion-ui: Next.js, TypeScript, Tailwind
- `apps/<id>/` App-Vorlage: `lion-app.yaml` + `compose.yaml`
- `docs/` KONZEPT.md, ENTSCHEIDUNGEN.md (jede Architekturentscheidung dort eintragen)

## Sicherheitsregeln (nicht verhandelbar)
- Nur lion-core spricht mit Docker, und nur über eine feste Liste erlaubter Aktionen. Nie freie Shell-Befehle aus Nutzereingaben.
- Nur `lion-helper` läuft als root, mit festen Befehlen.
- Oberfläche standardmäßig nur im Heimnetz; Fernzugriff nur über WireGuard.
- App-Images mit fester Version, nie `latest`.
- Keine Secrets im Repo oder in Logs. `.env.example` statt `.env`.
- Zerstörerische Aktionen (Löschen, Formatieren, Wiederherstellen) brauchen eine ausdrückliche Bestätigung.

## Arbeitsweise
- Kleine PRs, jede mit Tests. Backup-/Restore-Logik immer mit Test, der eine echte Wiederherstellung prüft.
- Sprache in UI und Doku: Deutsch, du-Form, kurz.
