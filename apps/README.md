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
  Einzige Ausnahme: der gemeinsame Medienordner `${LION_MEDIEN}` (siehe unten).
- Nur **Ordner** einbinden, keine einzelnen Dateien. lion-core legt jeden Ordner vorab an.
- Verboten: `privileged`, `network_mode: host`, `pid`/`ipc: host`, `devices`, `cap_add`, Docker-Socket.
- Geheimnisse (z. B. Datenbank-Passwörter) werden unter `geheimnisse` aufgelistet;
  lion-core erzeugt sie bei der Installation zufällig und speichert sie in einer `.env` mit Rechten 600.

## Variablen, die lion-core setzt

| Variable | Bedeutung |
|---|---|
| `LION_APP_PORT` | Lokaler Port (127.0.0.1), auf den Caddy weiterleitet |
| `LION_APP_DATA` | Datenordner der App, z. B. `/srv/lion/apps/nextcloud` |
| `LION_MEDIEN` | Gemeinsamer Medienordner `/srv/lion/medien` – nur bei `medien: lesen` oder `schreiben` |
| Namen aus `geheimnisse` | Zufällige Geheimnisse, 64 Hex-Zeichen |

## Datenordner

lion-core legt vor dem Start alle Ordner an, die die Vorlage unter `${LION_APP_DATA}/…` einbindet.
Neue Ordner bekommen die Rechte `0777`. So können auch Images schreiben, die mit eigenem Benutzer laufen
(z. B. UID 1000). Privat bleiben sie trotzdem: Der App-Ordner darüber gehört `lion` und hat `0750`.
Vorhandene Ordner (z. B. nach einer Neuinstallation) bleiben unverändert.

## Gemeinsamer Medienordner

`/srv/lion/medien` enthält die Ordner `Filme`, `Serien`, `Musik` und `Hörbücher`. Er gehört UID 1000.

| `medien` im Manifest | Bedeutung | Prüfung |
|---|---|---|
| `keine` (Standard) | Kein Zugriff | `${LION_MEDIEN}` ist verboten |
| `lesen` | Nur lesen (Jellyfin, Navidrome, Audiobookshelf) | Jede Einbindung braucht `:ro` bzw. `read_only: true` |
| `schreiben` | Lesen und schreiben (nur „Dateien“/FileBrowser) | – |

**Wichtig:** Der Medienordner liegt nicht im Backup. Filme und Musik sind groß und meist woanders gesichert.

## App-Protokoll

Die Oberfläche zeigt die letzten 300 Zeilen von `docker compose logs` (Knopf „Protokoll“).
Das ist wichtig für Apps, die ein Start-Passwort nur ins Protokoll schreiben (FileBrowser).
Das Protokoll kann solche Geheimnisse enthalten. Deshalb sieht es nur, wer angemeldet ist,
und lion-core schreibt es nirgends hin.

## Vorlagen im Katalog

| App | Kategorie | Medien | RAM ab | Besonderheit |
|---|---|---|---|---|
| Actual Budget | haushalt | – | 256 MB | Server-Passwort beim ersten Öffnen |
| Audiobookshelf | medien | lesen | 256 MB | Bibliothek `/hoerbuecher` |
| Dateien (FileBrowser) | dateien | schreiben | 128 MB | Start-Passwort im Protokoll |
| Home Assistant | smarthome | – | 1 GB | Ohne Host-Netz und USB: keine Auto-Suche, keine Zigbee-Sticks |
| Immich | fotos | – | 4 GB | Postgres mit Vektorsuche, Modelle nicht im Backup |
| Jellyfin | medien | lesen | 1 GB | Medien unter `/medien` |
| KI-Chat (Ollama + Open WebUI) | ki | – | 8 GB | Modelle nicht im Backup |
| Mealie | haushalt | – | 512 MB | Standard-Anmeldung sofort ändern |
| Navidrome | medien | lesen | 256 MB | Musik aus `Musik` |
| Nextcloud | dateien | – | 1 GB | Postgres |
| Paperless-ngx | dokumente | – | 2 GB | Texterkennung Deutsch + Englisch |
| Stirling-PDF | dokumente | – | 1 GB | Ohne Anmeldung, nur im Heimnetz |
| Uptime Kuma | ueberwachung | – | 256 MB | – |
| Vaultwarden | sicherheit | – | 128 MB | – |

Die CI installiert jede Vorlage einzeln wirklich mit Docker und prüft, ob die Weboberfläche antwortet
(Job „App-Vorlage … wirklich installieren“, Test `core/test/vorlage.integration.test.ts`).
