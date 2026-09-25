# Lion OS Installer

Richtet Lion OS auf einem frischen **Debian 13 (trixie)** ein (amd64 oder arm64).

## Installation

```bash
git clone https://github.com/Melekay/lion-os.git
cd lion-os
sudo ./installer/install.sh --dry-run   # erst ansehen, was passiert
sudo ./installer/install.sh             # installieren (fragt vorher nach)
```

Danach im Browser im Heimnetz öffnen: `https://<IP-des-Servers>`.
Der Browser warnt beim ersten Besuch, weil Lion OS ein eigenes Zertifikat nutzt – das ist im Heimnetz normal.

Am Ende zeigt der Installer einen **Einrichtungscode** (z. B. `K7QM-4XPA-9TRD`). Du brauchst ihn einmal, um den ersten Admin anzulegen.
So kann niemand sonst im Heimnetz Lion OS vor dir einrichten. Später wieder anzeigen: `sudo grep LION_SETUP_CODE /etc/lion/lion.env`.

**Fertig, wenn** die Seite „Lion OS – Installation erfolgreich“ erscheint und `https://<IP>/api/health` mit `"ok":true` antwortet.

## Was das Skript tut

| Schritt | Ergebnis |
|---|---|
| Prüfungen | Debian 13, amd64/arm64, RAM, freier Speicher, Ports 80/443/8080 frei |
| Docker | Docker Engine + Compose-Plugin aus dem offiziellen Docker-Repository (übersprungen, wenn vorhanden) |
| Node.js | Node.js 24 aus dem signierten NodeSource-Repository, falls `/usr/bin/node` fehlt oder älter als 22.13 ist |
| Benutzer | Systembenutzer `lion` (ohne Anmeldung) |
| Ordner | `/opt/lion` (Programm), `/etc/lion` (Konfiguration, 750), `/var/lib/lion` (Zustand), `/srv/lion/apps` (App-Daten) |
| Konfiguration | `/etc/lion/lion.env` mit zufälligem Geheimnis und Einrichtungscode, Rechte 600, wird bei erneutem Lauf **nicht** überschrieben |
| Caddy | Reverse Proxy mit lokalem HTTPS, HTTP→HTTPS-Umleitung, Sicherheits-Header, Container ohne Zusatzrechte |
| lion-core | wird nach `/opt/lion/core` gebaut (`npm ci --ignore-scripts`, danach ohne Entwicklungspakete) |
| Dienste | `lion` startet den Caddy-Stack, `lion-core` die API – beide beim Booten |

Das Skript ist idempotent: Ein erneuter Lauf repariert die Stack-Dateien, lässt Geheimnisse aber unverändert.

## Optionen

| Option | Wirkung |
|---|---|
| `--dry-run`, `-n` | Nur anzeigen, nichts verändern |
| `--yes`, `-y` | Ohne Rückfrage installieren |
| `--help`, `-h` | Hilfe |
| `--version` | Version |

`LION_ALLOW_UNSUPPORTED=1` erlaubt andere Systeme – nur für Tests, Docker muss dann bereits installiert sein.

## Sicherheit

- Die Oberfläche ist nur für das **Heimnetz** gedacht. Keine Portfreigabe im Router einrichten.
- Achtung: Von Docker-Containern veröffentlichte Ports **umgehen ufw/firewalld-Regeln** (laut offizieller Docker-Doku). Schutz nach außen übernimmt der Router; Fernzugriff folgt später über WireGuard.
- Die Konfiguration wird gelesen, ohne `/etc/os-release` auszuführen.
- **lion-core** läuft als Benutzer `lion` (nicht root) und lauscht nur auf `127.0.0.1:8080`; Caddy leitet `/api/` weiter.
  Die systemd-Sandbox erlaubt Schreiben nur in `/var/lib/lion`, `/srv/lion/apps` und `/opt/lion/stack/apps`,
  keine neuen Rechte, keine Geräte, keine Capabilities.
- Ehrlicher Hinweis: Für die App-Verwaltung ist `lion` in der Gruppe `docker`. Wer Docker steuern kann, kann den Rechner
  übernehmen. Die Sandbox begrenzt Fehler in lion-core, ersetzt aber keinen Root-Schutz – dafür ist später ein eng
  begrenzter Helfer geplant (siehe `docs/ENTSCHEIDUNGEN.md`).

## Tests

```bash
shellcheck installer/install.sh installer/tests/rauchtest.sh
bats installer/tests
```

Die CI führt zusätzlich eine echte Installation auf einer GitHub-VM aus (Ubuntu, weil GitHub keine Debian-VMs anbietet):
HTTPS-Antwort, HTTP-Umleitung, Dateirechte, lion-core als Benutzer `lion` nur auf 127.0.0.1, Idempotenz und Neustart.

Danach läuft der **Rauchtest** über den ganzen Weg Browser → Caddy → lion-core → Docker → App:
Einrichtung mit Code, Uptime Kuma installieren und per HTTPS erreichen, entfernen (Daten bleiben).
Er legt einen Admin an – nur auf Testsystemen ausführen: `LION_RAUCHTEST=1 ./installer/tests/rauchtest.sh`.
