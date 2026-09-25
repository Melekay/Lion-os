#!/usr/bin/env bats
# Unit-Tests für installer/install.sh. Ausführen: bats installer/tests

setup() {
  SKRIPT="${BATS_TEST_DIRNAME}/../install.sh"
  TMP="$(mktemp -d)"
  export LION_ROOT="$TMP/root"
  mkdir -p "$LION_ROOT"
  # shellcheck source=../install.sh
  source "$SKRIPT"
  # Die strengen Shell-Optionen des Skripts nicht auf bats übertragen.
  set +euo pipefail
}

teardown() {
  rm -rf "$TMP"
}

os_release() {
  printf '%s\n' "$@" >"$TMP/os-release"
  export LION_OS_RELEASE="$TMP/os-release"
}

# --- Betriebssystem --------------------------------------------------------

@test "Debian 13 wird akzeptiert" {
  os_release 'ID=debian' 'VERSION_ID="13"' 'PRETTY_NAME="Debian GNU/Linux 13 (trixie)"'
  run pruefe_os
  [ "$status" -eq 0 ]
  [[ "$output" == *"Debian GNU/Linux 13"* ]]
}

@test "Debian 12 wird abgelehnt" {
  os_release 'ID=debian' 'VERSION_ID="12"'
  run pruefe_os
  [ "$status" -ne 0 ]
  [[ "$output" == *"nur Debian 13"* ]]
}

@test "Ubuntu wird abgelehnt" {
  os_release 'ID=ubuntu' 'VERSION_ID="24.04"' 'PRETTY_NAME="Ubuntu 24.04 LTS"'
  run pruefe_os
  [ "$status" -ne 0 ]
}

@test "Ubuntu mit LION_ALLOW_UNSUPPORTED=1 wird mit Warnung akzeptiert" {
  os_release 'ID=ubuntu' 'VERSION_ID="24.04"'
  LION_ALLOW_UNSUPPORTED=1 run pruefe_os
  [ "$status" -eq 0 ]
  [[ "$output" == *"Nicht unterstütztes System"* ]]
}

@test "fehlende os-release führt zum Abbruch" {
  export LION_OS_RELEASE="$TMP/gibt-es-nicht"
  run pruefe_os
  [ "$status" -ne 0 ]
}

@test "os_feld liest Werte mit und ohne Anführungszeichen, ohne die Datei auszuführen" {
  os_release 'ID=debian' "VERSION_CODENAME='trixie'" 'PRETTY_NAME="Debian 13"' 'BOESE=$(touch '"$TMP"'/ausgefuehrt)'
  [ "$(os_feld ID)" = "debian" ]
  [ "$(os_feld VERSION_CODENAME)" = "trixie" ]
  [ "$(os_feld PRETTY_NAME)" = "Debian 13" ]
  [ ! -e "$TMP/ausgefuehrt" ]
}

# --- Architektur -----------------------------------------------------------

@test "amd64 und arm64 werden akzeptiert" {
  LION_ARCH=amd64 run pruefe_architektur
  [ "$status" -eq 0 ]
  LION_ARCH=arm64 run pruefe_architektur
  [ "$status" -eq 0 ]
}

@test "armhf wird abgelehnt" {
  LION_ARCH=armhf run pruefe_architektur
  [ "$status" -ne 0 ]
}

# --- Argumente -------------------------------------------------------------

@test "--help zeigt die Hilfe" {
  run bash "$SKRIPT" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"--dry-run"* ]]
}

@test "unbekannte Option bricht ab" {
  run bash "$SKRIPT" --gibtsnicht
  [ "$status" -ne 0 ]
  [[ "$output" == *"Unbekannte Option"* ]]
}

@test "--version gibt die Version aus" {
  run bash "$SKRIPT" --version
  [ "$status" -eq 0 ]
  [ "$output" = "$LION_VERSION" ]
}

# --- Probelauf -------------------------------------------------------------

@test "Probelauf verändert nichts" {
  os_release 'ID=debian' 'VERSION_ID="13"' 'VERSION_CODENAME=trixie'
  LION_ARCH=amd64 run bash "$SKRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Probelauf beendet"* ]]
  [ -z "$(ls -A "$LION_ROOT")" ]
}

# --- Medienordner ----------------------------------------------------------

@test "Medienordner wird mit Unterordnern angelegt" {
  MEDIEN_BESITZER="$(id -u):$(id -g)"
  mkdir -p "$LION_ROOT/srv/lion"
  run lege_medienordner_an
  [ "$status" -eq 0 ]
  for ordner in "" Filme Serien Musik Hörbücher; do
    [ -d "$LION_ROOT/srv/lion/medien/$ordner" ]
  done
  [ "$(stat -c %a "$LION_ROOT/srv/lion/medien")" = "755" ]
}

@test "vorhandene Medienordner bleiben unverändert" {
  MEDIEN_BESITZER="$(id -u):$(id -g)"
  mkdir -p "$LION_ROOT/srv/lion/medien/Filme"
  chmod 700 "$LION_ROOT/srv/lion/medien/Filme"
  lege_medienordner_an
  [ "$(stat -c %a "$LION_ROOT/srv/lion/medien/Filme")" = "700" ]
  [ -d "$LION_ROOT/srv/lion/medien/Musik" ]
}

# --- Konfiguration ---------------------------------------------------------

@test "Konfiguration wird mit Rechten 600 und Geheimnis angelegt" {
  schreibe_konfiguration
  local datei="$LION_ROOT/etc/lion/lion.env"
  [ -f "$datei" ]
  [ "$(stat -c %a "$datei")" = "600" ]
  grep -Eq '^LION_SECRET=[0-9a-f]{64}$' "$datei"
}

@test "vorhandene Konfiguration (Geheimnis) bleibt beim erneuten Lauf erhalten" {
  schreibe_konfiguration
  local vorher
  vorher="$(cat "$LION_ROOT/etc/lion/lion.env")"
  run schreibe_konfiguration
  [ "$status" -eq 0 ]
  [[ "$output" == *"bleibt unverändert"* ]]
  [ "$(cat "$LION_ROOT/etc/lion/lion.env")" = "$vorher" ]
}

@test "zwei Geheimnisse sind verschieden" {
  [ "$(erzeuge_geheimnis)" != "$(erzeuge_geheimnis)" ]
}

# --- Stack-Dateien ---------------------------------------------------------

@test "Compose nutzt eine feste Caddy-Version, nie latest" {
  run render_compose
  [[ "$output" == *"image: caddy:2."* ]]
  [[ "$output" != *":latest"* ]]
}

@test "Compose härtet den Container (keine Zusatzrechte)" {
  run render_compose
  [[ "$output" == *"cap_drop:"* ]]
  [[ "$output" == *"no-new-privileges:true"* ]]
}

@test "Caddy läuft im Host-Netzwerk und bindet den App-Ordner nur lesend ein" {
  run render_compose
  [[ "$output" == *"network_mode: host"* ]]
  [[ "$output" == *"./apps:/etc/caddy/apps:ro"* ]]
  [[ "$output" != *"ports:"* ]]
}

@test "Caddyfile importiert die App-Einträge" {
  run render_caddyfile
  [[ "$output" == *"import /etc/caddy/apps/*.caddy"* ]]
}

@test "Caddyfile nutzt lokales HTTPS und enthält localhost" {
  run render_caddyfile
  [[ "$output" == *"tls internal"* ]]
  [[ "$output" == *"https://localhost"* ]]
  [[ "$output" == *"redir https://"* ]]
}

@test "site_adressen enthält nur private IPv4-Adressen" {
  hostname() { echo "box"; }
  lokale_ipv4() { printf '%s\n' 192.168.1.20 203.0.113.5 10.0.0.7; }
  run site_adressen
  [[ "$output" == *"localhost"* ]]
  [[ "$output" == *"box.local"* ]]
  [[ "$output" == *"192.168.1.20"* ]]
  [[ "$output" == *"10.0.0.7"* ]]
  [[ "$output" != *"203.0.113.5"* ]]
}

@test "lokale_ipv4 ignoriert Docker- und VPN-Schnittstellen" {
  ip() {
    cat <<'AUSGABE'
2: eth0    inet 192.168.1.20/24 brd 192.168.1.255 scope global eth0
3: docker0    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
4: br-1a2b    inet 172.18.0.1/16 scope global br-1a2b
5: wg0    inet 10.8.0.1/24 scope global wg0
AUSGABE
  }
  run lokale_ipv4
  [ "$output" = "192.168.1.20" ]
}

@test "schreibe_stack legt Caddyfile, compose.yaml und Adressliste an" {
  schreibe_stack
  grep -qx "localhost" "$LION_ROOT/etc/lion/adressen"
  [ -f "$LION_ROOT/opt/lion/stack/Caddyfile" ]
  [ -f "$LION_ROOT/opt/lion/stack/compose.yaml" ]
}

@test "kopiere_katalog kopiert die App-Vorlagen" {
  kopiere_katalog
  [ -d "$LION_ROOT/opt/lion/apps" ]
}

@test "systemd-Dienst startet den Stack über docker compose" {
  run render_unit
  [[ "$output" == *"Requires=docker.service"* ]]
  [[ "$output" == *"ExecStart=/usr/bin/docker compose up -d"* ]]
  [[ "$output" == *"WorkingDirectory=/opt/lion/stack"* ]]
}

# --- Node.js ---------------------------------------------------------------

@test "node_passt: erst ab Node 22.13" {
  node_passt v22.13.0
  node_passt v22.20.1
  node_passt v24.1.0
  ! node_passt v22.12.9
  ! node_passt v20.19.2
  ! node_passt ""
  ! node_passt "kaputt"
}

@test "installiere_node überspringt eine passende Node-Version" {
  printf '#!/bin/sh\necho v24.3.0\n' >"$TMP/node"
  chmod +x "$TMP/node"
  LION_NODE="$TMP/node" run installiere_node
  [ "$status" -eq 0 ]
  [[ "$output" == *"v24.3.0 ist installiert"* ]]
}

@test "installiere_node nutzt im Probelauf das signierte NodeSource-Repository" {
  DRY_RUN=1 LION_NODE="$TMP/gibt-es-nicht" run installiere_node
  [ "$status" -eq 0 ]
  [[ "$output" == *"nodesource.asc"* ]]
  [[ "$output" == *"apt-get install -y nodejs"* ]]
}

# --- Einrichtungscode ------------------------------------------------------

@test "Einrichtungscode hat das Format XXXX-XXXX-XXXX ohne verwechselbare Zeichen" {
  local code
  code="$(erzeuge_einrichtungscode)"
  [[ "$code" =~ ^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$ ]]
  [ "$code" != "$(erzeuge_einrichtungscode)" ]
}

@test "neue Konfiguration enthält einen Einrichtungscode" {
  schreibe_konfiguration
  [[ "$(einrichtungscode)" =~ ^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$ ]]
}

@test "ältere Konfiguration bekommt den Code ergänzt, das Geheimnis bleibt" {
  mkdir -p "$LION_ROOT/etc/lion"
  printf 'LION_VERSION=0.1.0-dev\nLION_SECRET=%s\n' "$(printf 'a%.0s' {1..64})" >"$LION_ROOT/etc/lion/lion.env"
  chmod 600 "$LION_ROOT/etc/lion/lion.env"
  run schreibe_konfiguration
  [[ "$output" == *"Einrichtungscode ergänzt"* ]]
  grep -q "^LION_SECRET=$(printf 'a%.0s' {1..64})$" "$LION_ROOT/etc/lion/lion.env"
  [ -n "$(einrichtungscode)" ]
  [ "$(stat -c %a "$LION_ROOT/etc/lion/lion.env")" = "600" ]
  # Beim nächsten Lauf ändert sich nichts mehr.
  local vorher
  vorher="$(cat "$LION_ROOT/etc/lion/lion.env")"
  schreibe_konfiguration
  [ "$(cat "$LION_ROOT/etc/lion/lion.env")" = "$vorher" ]
}

@test "Zusammenfassung zeigt den Einrichtungscode" {
  schreibe_konfiguration
  site_adressen() { printf '%s\n' localhost 192.168.1.20; }
  run zusammenfassung
  [[ "$output" == *"$(einrichtungscode)"* ]]
  [[ "$output" == *"https://192.168.1.20"* ]]
}

# --- lion-core -------------------------------------------------------------

@test "Caddy leitet /api/ an lion-core auf 127.0.0.1 weiter" {
  run render_caddyfile
  [[ "$output" == *"handle /api/*"* ]]
  [[ "$output" == *"reverse_proxy 127.0.0.1:8080"* ]]
}

@test "lion-core läuft als eigener Benutzer in einer Sandbox, nie als root" {
  run render_core_unit
  [[ "$output" == *"User=lion"* ]]
  [[ "$output" != *"User=root"* ]]
  [[ "$output" == *"SupplementaryGroups=docker"* ]]
  [[ "$output" == *"NoNewPrivileges=yes"* ]]
  [[ "$output" == *"CapabilityBoundingSet="* ]]
  [[ "$output" == *"ProtectSystem=strict"* ]]
  [[ "$output" == *"ReadWritePaths=/var/lib/lion /srv/lion/apps /opt/lion/stack/apps"* ]]
  [[ "$output" == *"LION_HOST=127.0.0.1"* ]]
  [[ "$output" == *"ExecStart=/usr/bin/node dist/index.js"* ]]
}

@test "lion-core startet nach Docker und dem Basis-Stack" {
  run render_core_unit
  [[ "$output" == *"Requires=docker.service"* ]]
  [[ "$output" == *"After=docker.service lion.service"* ]]
}

# --- Oberfläche ------------------------------------------------------------

@test "Caddy setzt strenge Sicherheits-Header (CSP ohne fremde Quellen)" {
  run render_caddyfile
  [[ "$output" == *"Content-Security-Policy \"default-src 'self';"* ]]
  [[ "$output" == *"frame-ancestors 'none'"* ]]
  [[ "$output" == *"object-src 'none'"* ]]
  [[ "$output" == *"Permissions-Policy"* ]]
  [[ "$output" != *"https://"*"script-src"* ]]
}

@test "Caddy cacht nur unveränderliche Dateien lange und zeigt eine eigene 404-Seite" {
  run render_caddyfile
  [[ "$output" == *"@unveraenderlich path /_next/static/*"* ]]
  [[ "$output" == *"immutable"* ]]
  [[ "$output" == *"handle_errors 404"* ]]
  [[ "$output" == *"rewrite * /404.html"* ]]
}

@test "installiere_ui zeigt im Probelauf nur an, was passieren würde" {
  DRY_RUN=1 run installiere_ui
  [ "$status" -eq 0 ]
  [[ "$output" == *"[probelauf] baue"* ]]
  [ ! -e "$LION_ROOT/opt/lion/stack/www" ]
}

@test "installiere_ui baut ohne Entwicklungspakete, ohne Paket-Skripte und ohne Telemetrie" {
  run declare -f installiere_ui
  [[ "$output" == *"--omit=dev"* ]]
  [[ "$output" == *"--ignore-scripts"* ]]
  [[ "$output" == *"NEXT_TELEMETRY_DISABLED=1"* ]]
}
