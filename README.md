# Lion OS

**Dein Server. Deine Regeln.**

Lion OS macht aus einem Mini-PC einen privaten Heimserver – so einfach wie ein Smartphone:
Apps mit einem Klick installieren, automatische Backups, sicher ab Werk.

> Status: **Planung / Phase 1 (MVP) in Arbeit.** Noch nicht für den produktiven Einsatz.

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
