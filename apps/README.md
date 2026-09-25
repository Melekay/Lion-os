# App-Katalog

Jede App ist ein Ordner mit zwei Dateien:

| Datei | Inhalt |
|---|---|
| `lion-app.yaml` | Name, Beschreibung, Version, Kategorie, Web-Dienst und -Port, Geheimnisse, Hinweise |
| `compose.yaml` | Docker-Compose-Definition |

## Pflichtregeln (prüft lion-core beim Laden, CI prüft jede Vorlage)

- Jedes Image hat eine **feste Version** (kein `latest`, kein Image ohne Tag).
- Nur der Web-Dienst veröffentlicht einen Port, und zwar ausschließlich `127.0.0.1:${LION_APP_PORT}:<port>`.
  Nach außen stellt Caddy die App per HTTPS bereit.
- Daten nur unter `${LION_APP_DATA}/…` (Bind-Mounts), keine anderen Host-Pfade.
- Verboten: `privileged`, `network_mode: host`, `pid`/`ipc: host`, `devices`, `cap_add`, Docker-Socket.
- Geheimnisse (z. B. Datenbank-Passwörter) werden unter `geheimnisse` aufgelistet;
  lion-core erzeugt sie bei der Installation zufällig und speichert sie in einer `.env` mit Rechten 600.

## Variablen, die lion-core setzt

| Variable | Bedeutung |
|---|---|
| `LION_APP_PORT` | Lokaler Port (127.0.0.1), auf den Caddy weiterleitet |
| `LION_APP_DATA` | Datenordner der App, z. B. `/srv/lion/apps/nextcloud` |
| Namen aus `geheimnisse` | Zufällige Geheimnisse, 64 Hex-Zeichen |
