# Lion OS

**Dein Server. Deine Regeln.**

Lion OS macht aus einem Mini-PC einen privaten Heimserver – so einfach wie ein Smartphone:
Apps mit einem Klick installieren, automatische Backups, sicher ab Werk.

> Status: **Phase 1 (MVP) vollständig.** Installer, API, App-Verwaltung, Oberfläche, Einstellungen und verschlüsseltes Backup laufen.
> Noch nicht für den produktiven Einsatz.

## Schnellstart (Debian 13)

```bash
git clone https://github.com/Melekay/lion-os.git && cd lion-os
sudo ./installer/install.sh
```

Danach `https://<IP-des-Servers>` im Heimnetz öffnen und mit dem Einrichtungscode vom Ende der Installation das Admin-Konto anlegen.
Details: [installer/README.md](installer/README.md) · API: [core/README.md](core/README.md) · Oberfläche: [ui/README.md](ui/README.md)

## Lion OS und Lion Box

| | Lion OS | Lion Box |
|---|---|---|
| Was | Das System zum Selbst-Installieren | Fertiger Mini-PC mit Lion OS, eingerichtet und betreut |
| Verwaltung | Du selbst | Wir kümmern uns |

## Ordnerstruktur

```
installer/  Installationsskript für Debian 13
core/       lion-core – API (TypeScript, Fastify)
ui/         lion-ui – Weboberfläche (Next.js)
apps/       App-Vorlagen (lion-app.yaml + compose.yaml)
docs/       Konzept und Entscheidungen
```

## Dokumentation

- [Konzept](docs/KONZEPT.md)
- [Entscheidungen](docs/ENTSCHEIDUNGEN.md)
