# Lion OS – Konzept v0.2

Stand: 25.09.2026 · Status: freigegeben als Grundlage für Phase 1

## 1. Vision

**Lion OS macht aus jedem Mini-PC einen privaten Heimserver – so einfach wie ein Smartphone.**
Anstecken, Weboberfläche öffnen, Apps mit einem Klick installieren. Backups, Updates und Sicherheit laufen im Hintergrund. Später hilft ein lokaler KI-Assistent und fragt vorher, wenn es ernst wird.

Claim-Ideen: „Dein Server. Deine Regeln.“ · „Stark wie ein Löwe. Einfach wie eine App.“

## 2. Lion OS und Lion Box

| | **Lion OS** | **Lion Box** |
|---|---|---|
| Was | Das System zum Selbst-Installieren und Selbst-Verwalten | Service: fertiger Mini-PC mit Lion OS, eingerichtet, überwacht, betreut |
| Wer verwaltet | Nutzer selbst | Anbieter (Fernwartung per VPN) |
| Geld | Basis kostenlos (Reichweite, Vertrauen) | Einrichtung + Monatsbeitrag |
| Technik | Lion OS | Lion OS + Standard-Hardware + Betreuung |

**Grundsatz:** Lion Box braucht keine eigene Software. Alles, was eine Lion Box kann, kann Lion OS. Der Service ist die Betreuung.

## 3. Zielgruppen

| Stufe | Wer | Bedürfnis |
|---|---|---|
| 1 | Eigenes Homelab (Gründer) | Alles an einem Ort, lokal, Telegram-Anbindung |
| 2 | Technik-Interessierte ohne Linux-Wissen | Cloud, Fotos, Passwörter, Smart Home – ohne Terminal |
| 3 | Kleinbetriebe (Praxis, Handwerk, Büro) | Daten im Haus, DSGVO-freundlich, jemand kümmert sich → **Lion Box** |

## 4. Positionierung

Wettbewerb: ZimaOS/CasaOS, Umbrel, Unraid, TrueNAS, Runtipi, YunoHost.

Unterschiede von Lion OS:
1. **Sicher ab Werk:** Backup-Ziel ist Teil der Einrichtung, Fernzugriff nur per VPN, Updates mit Snapshot.
2. **Deutsch und DSGVO-Fokus.**
3. **KI-Assistent „Leo“** (ab Phase 2), lokal über Ollama, mit Freigaben.
4. **Lion Box:** betreute Variante für Menschen, die sich um nichts kümmern wollen.

## 5. Funktionen

### Phase 1 – MVP
1. Installationsskript für Debian 13 (ein Befehl)
2. Anmeldung (ein Admin)
3. Dashboard: CPU, RAM, Speicher, Temperatur, Ampel-Status
4. App-Verwaltung aus Vorlagen: installieren, starten, stoppen, entfernen
5. Drei App-Vorlagen: Uptime Kuma, Vaultwarden, Nextcloud
6. Backup mit restic auf zweite Platte, inklusive Wiederherstellung

**Fertig, wenn:** Auf einer frischen Debian-VM wird Nextcloud per Klick installiert, eine Datei hochgeladen, die App gelöscht und aus dem Backup vollständig wiederhergestellt.

### Phase 2 – Automatisierung
Weitere Apps (Immich, Home Assistant, Jellyfin, Ollama, Open WebUI, AdGuard Home, Paperless-ngx, Stirling PDF, wg-easy), Telegram-Benachrichtigungen, WireGuard-Assistent, Updates mit btrfs-Snapshot und Rücksprung, KI-Assistent Leo mit Freigaben.

### Phase 3 – Betrieb und Sicherheit
2FA (TOTP), Rollen, Audit-Log-Ansicht, Health-Checks, Sicherheitsprüfung von außen, Fernwartungs-Zugang für Lion Box.

### Phase 4 – Produkt
ISO-Image, Website, Branding, Lion-Box-Kundenportal, Preise, ARM (Raspberry Pi 5), VMs über Incus.

## 6. Architektur

```
Browser / Handy / Telegram
        │ HTTPS (Heimnetz oder WireGuard)
        ▼
Caddy (Reverse Proxy, lokales HTTPS)
   │                         │
   ▼                         ▼
lion-ui (Next.js, statisch)  Apps (Docker-Container)
   │ REST                    ▲
   ▼                         │ Docker-API (Allowlist)
lion-core (TypeScript, Fastify, SQLite)
   │ Auth · Apps · Backup · Monitoring · Benachrichtigungen · Audit-Log
   ▼
lion-helper (root, minimal: Platten, Updates, Netzwerk – nur feste Befehle)

Später: lion-agent „Leo“ (Ollama) → ruft ausschließlich lion-core auf
Basis: Debian 13 · Docker · restic · btrfs (Datenplatte)
```

### App-Format
`apps/<id>/lion-app.yaml` (Metadaten) und `apps/<id>/compose.yaml` (Container).

```yaml
id: vaultwarden
name: Vaultwarden
beschreibung: Passwort-Manager für die ganze Familie.
version: "1.x.y"          # feste Version, nie latest
kategorie: sicherheit
icon: vaultwarden.svg
ports:
  - intern: 80
    name: web
speicher:
  - pfad: /data
    sichern: true
ressourcen:
  ram_min_mb: 256
sicherheitsstufe: sensibel  # normal | sensibel | vollzugriff
```

## 7. Sicherheitskonzept

| Risiko | Maßnahme |
|---|---|
| Oberfläche aus dem Internet erreichbar | Standard: nur Heimnetz. Fernzugriff nur per WireGuard, keine Portfreigaben |
| Docker-Socket = root | Nur lion-core, nur Allowlist-Aktionen, keine freien Befehle |
| Schwache Passwörter | Mindestlänge, Sperre nach Fehlversuchen, 2FA ab Phase 3 |
| Unsichere Apps | Nur geprüfte Vorlagen, feste Versionen, Warnung bei `vollzugriff` |
| Datenverlust | Backup-Ziel in der Einrichtung, restic verschlüsselt, regelmäßige Test-Wiederherstellung |
| KI-Fehlaktionen | Werkzeug-Allowlist, Bestätigung für kritische Aktionen, Audit-Log |
| Secrets | Verschlüsselt gespeichert, nie in Logs, nie im Klartext an Leo |

## 8. Design

Dunkles Standard-Theme, Akzentfarbe Gold, große klare Kacheln, ruhige Animationen.
Symbol: stilisierter, geometrischer Löwenkopf, als 16-px-Favicon erkennbar.
Sprache: Deutsch zuerst, Englisch vorbereitet. Ampel-Prinzip: Jede Seite beantwortet zuerst „Ist alles okay?“.

## 9. Geschäftsmodell

| Modell | Inhalt | Preisidee (zu validieren) |
|---|---|---|
| Lion OS Community | Kostenlos, selbst verwaltet | 0 € |
| Lion OS Plus | Leo-Extras, Offsite-Backup, Priority-Updates | ca. 3–5 €/Monat |
| Lion Box Managed | Einrichtung, Überwachung, Betreuung | ca. 30–80 €/Monat |
| Lion Box Hardware | Vorinstallierter Mini-PC | Hardware + Einrichtung |

## 10. Risiken

| Stufe | Risiko | Umgang |
|---|---|---|
| Kritisch | Datenverlust durch Fehler in Backup/Platten-Logik | Backup zuerst bauen, automatisierte Restore-Tests |
| Kritisch | Sicherheitslücke beim Kunden | Kein Internet ohne VPN, Update-Kanal, Sicherheitsprüfung vor Release |
| Wichtig | Pflegeaufwand App-Vorlagen | Klein starten, feste Versionen, Test pro App |
| Wichtig | Markenname „Lion OS“ / „Lion Box“ | Recherche DPMA/EUIPO vor Branding-Ausgaben |
| Optimierung | Starke Konkurrenz | Konsequent auf Sicherheit ab Werk, Deutsch, Leo und Lion Box setzen |

## 11. Parallel ohne Code

1. Markenrecherche „Lion OS“ und „Lion Box“ (DPMA, EUIPO)
2. Nachfrage testen: 3–5 Gespräche mit potenziellen Lion-Box-Kunden
3. Standard-Hardware festlegen (z. B. Intel N100, 16 GB RAM, 2 SSDs)
