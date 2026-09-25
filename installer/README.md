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

**Fertig, wenn** die Seite „Lion OS – Installation erfolgreich“ erscheint.

## Was das Skript tut

| Schritt | Ergebnis |
|---|---|
| Prüfungen | Debian 13, amd64/arm64, RAM, freier Speicher, Ports 80/443 frei |
| Docker | Docker Engine + Compose-Plugin aus dem offiziellen Docker-Repository (übersprungen, wenn vorhanden) |
| Benutzer | Systembenutzer `lion` (ohne Anmeldung) |
| Ordner | `/opt/lion` (Programm), `/etc/lion` (Konfiguration, 750), `/var/lib/lion` (Zustand), `/srv/lion/apps` (App-Daten) |
| Konfiguration | `/etc/lion/lion.env` mit zufälligem Geheimnis, Rechte 600, wird bei erneutem Lauf **nicht** überschrieben |
| Caddy | Reverse Proxy mit lokalem HTTPS, HTTP→HTTPS-Umleitung, Sicherheits-Header, Container ohne Zusatzrechte |
| Dienst | systemd-Dienst `lion` startet den Stack beim Booten |

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

## Tests

```bash
shellcheck installer/install.sh
bats installer/tests
```

Die CI führt zusätzlich eine echte Installation auf einer GitHub-VM aus (Ubuntu, weil GitHub keine Debian-VMs anbietet): HTTPS-Antwort, HTTP-Umleitung, Dateirechte, Idempotenz und Neustart.
