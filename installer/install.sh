#!/usr/bin/env bash
# Deutsche Anführungszeichen in Meldungen sind gewollt.
# shellcheck disable=SC1111
# Lion OS – Installationsskript für Debian 13 (trixie)
#
# Richtet ein:
#   - Docker Engine + Compose-Plugin (offizielles Docker-Repository)
#   - Systembenutzer „lion“ und die Ordnerstruktur
#   - Caddy als Reverse Proxy mit lokalem HTTPS (eigene Zertifizierungsstelle)
#   - systemd-Dienst „lion“, der den Stack startet
#
# Das Skript ist idempotent: Mehrfaches Ausführen ändert nichts Bestehendes
# (vorhandene Secrets bleiben erhalten).
#
# Aufruf:  sudo ./install.sh [--yes] [--dry-run] [--help]

set -euo pipefail

LION_VERSION="0.1.0-dev"
CADDY_IMAGE="caddy:2.10-alpine"
DOCKER_REPO="https://download.docker.com/linux/debian"

# Für Tests überschreibbar; im echten Betrieb leer (= Wurzelverzeichnis).
LION_ROOT="${LION_ROOT:-}"
LION_OS_RELEASE="${LION_OS_RELEASE:-/etc/os-release}"

DRY_RUN=0
ASSUME_YES=0

# ---------------------------------------------------------------------------
# Pfade
# ---------------------------------------------------------------------------
pfad_opt() { printf '%s/opt/lion' "$LION_ROOT"; }
pfad_etc() { printf '%s/etc/lion' "$LION_ROOT"; }
pfad_var() { printf '%s/var/lib/lion' "$LION_ROOT"; }
pfad_srv() { printf '%s/srv/lion' "$LION_ROOT"; }
pfad_stack() { printf '%s/stack' "$(pfad_opt)"; }
pfad_env() { printf '%s/lion.env' "$(pfad_etc)"; }
pfad_unit() { printf '%s/etc/systemd/system/lion.service' "$LION_ROOT"; }

# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
  FARBE_GOLD=$'\033[33m'; FARBE_ROT=$'\033[31m'; FARBE_GRUEN=$'\033[32m'; FARBE_AUS=$'\033[0m'
else
  FARBE_GOLD=""; FARBE_ROT=""; FARBE_GRUEN=""; FARBE_AUS=""
fi

info() { printf '%s▸%s %s\n' "$FARBE_GOLD" "$FARBE_AUS" "$*"; }
ok() { printf '%s✔%s %s\n' "$FARBE_GRUEN" "$FARBE_AUS" "$*"; }
warnung() { printf '%s!%s %s\n' "$FARBE_GOLD" "$FARBE_AUS" "$*" >&2; }
fehler() { printf '%s✖ %s%s\n' "$FARBE_ROT" "$*" "$FARBE_AUS" >&2; exit 1; }

# Führt einen Befehl aus – oder zeigt ihn im Probelauf nur an.
ausfuehren() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  [probelauf] %s\n' "$*"
  else
    "$@"
  fi
}

# Schreibt Inhalt (stdin) in eine Datei mit Rechten – oder zeigt es im Probelauf an.
schreibe_datei() {
  local ziel="$1" rechte="$2" inhalt
  inhalt="$(cat)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  [probelauf] schreibe %s (%s)\n' "$ziel" "$rechte"
    return 0
  fi
  mkdir -p "$(dirname "$ziel")"
  printf '%s\n' "$inhalt" >"$ziel"
  chmod "$rechte" "$ziel"
}

hilfe() {
  cat <<EOF
Lion OS Installer ${LION_VERSION}

Aufruf: sudo ./install.sh [Optionen]

Optionen:
  -y, --yes       Ohne Rückfrage installieren
  -n, --dry-run   Nur anzeigen, was passieren würde (ändert nichts)
  -h, --help      Diese Hilfe anzeigen
  --version       Version anzeigen

Unterstützt: Debian 13 (trixie) auf amd64 oder arm64.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y | --yes) ASSUME_YES=1 ;;
      -n | --dry-run) DRY_RUN=1 ;;
      -h | --help) hilfe; exit 0 ;;
      --version) printf '%s\n' "$LION_VERSION"; exit 0 ;;
      *) fehler "Unbekannte Option: $1 (siehe --help)" ;;
    esac
    shift
  done
}

# ---------------------------------------------------------------------------
# Prüfungen
# ---------------------------------------------------------------------------
pruefe_root() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  [[ "$(id -u)" -eq 0 ]] || fehler "Bitte mit Administratorrechten starten: sudo ./install.sh"
}

# Liest ein Feld aus os-release, ohne die Datei auszuführen.
os_feld() {
  local wert
  wert="$(sed -n "s/^${1}=//p" "$LION_OS_RELEASE" | head -n 1)"
  wert="${wert%\"}"; wert="${wert#\"}"
  wert="${wert%\'}"; wert="${wert#\'}"
  printf '%s' "$wert"
}

# Gibt 0 zurück, wenn Debian 13; bricht sonst ab (außer LION_ALLOW_UNSUPPORTED=1).
pruefe_os() {
  [[ -r "$LION_OS_RELEASE" ]] || fehler "Betriebssystem nicht erkennbar ($LION_OS_RELEASE fehlt)."
  local id version name
  id="$(os_feld ID)"
  version="$(os_feld VERSION_ID)"
  name="$(os_feld PRETTY_NAME)"
  [[ -n "$name" ]] || name="$id $version"
  if [[ "$id" == "debian" && "$version" == "13" ]]; then
    ok "Betriebssystem: $name"
    return 0
  fi
  if [[ "${LION_ALLOW_UNSUPPORTED:-0}" == "1" ]]; then
    warnung "Nicht unterstütztes System ($name) – fortgesetzt, weil LION_ALLOW_UNSUPPORTED=1."
    return 0
  fi
  fehler "Lion OS unterstützt nur Debian 13 (gefunden: $name)."
}

# Architektur im Debian-Format (amd64/arm64).
architektur() {
  if [[ -n "${LION_ARCH:-}" ]]; then
    printf '%s' "$LION_ARCH"
  elif command -v dpkg >/dev/null 2>&1; then
    dpkg --print-architecture
  else
    case "$(uname -m)" in
      x86_64) printf 'amd64' ;;
      aarch64) printf 'arm64' ;;
      *) uname -m ;;
    esac
  fi
}

pruefe_architektur() {
  local arch
  arch="$(architektur)"
  case "$arch" in
    amd64 | arm64) ok "Architektur: $arch" ;;
    *) fehler "Nicht unterstützte Architektur: $arch (nur amd64 und arm64)." ;;
  esac
}

pruefe_ressourcen() {
  local ram_mb frei_gb
  ram_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
  frei_gb="$(df -Pk / 2>/dev/null | awk 'NR==2 {print int($4/1024/1024)}' || echo 0)"
  if [[ "$ram_mb" -lt 2000 ]]; then
    warnung "Nur ${ram_mb} MB RAM – empfohlen sind mindestens 4 GB."
  else
    ok "Arbeitsspeicher: ${ram_mb} MB"
  fi
  if [[ "$frei_gb" -lt 10 ]]; then
    warnung "Nur ${frei_gb} GB frei auf / – empfohlen sind mindestens 20 GB."
  else
    ok "Freier Speicher auf /: ${frei_gb} GB"
  fi
}

# Ports 80/443 müssen frei sein – außer Lion OS läuft bereits (erneute Installation).
pruefe_ports() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  if [[ -f "$(pfad_unit)" ]]; then
    return 0
  fi
  command -v ss >/dev/null 2>&1 || return 0
  local port
  for port in 80 443; do
    if ss -Hltn "sport = :$port" | grep -q .; then
      fehler "Port $port ist bereits belegt. Bitte den Dienst beenden, der ihn nutzt, und erneut starten."
    fi
  done
  ok "Ports 80 und 443 sind frei."
}

bestaetigen() {
  [[ "$ASSUME_YES" -eq 1 || "$DRY_RUN" -eq 1 ]] && return 0
  if [[ ! -t 0 ]]; then
    fehler "Keine Rückfrage möglich. Mit --yes bestätigen."
  fi
  local antwort
  printf 'Lion OS %s jetzt installieren? [j/N] ' "$LION_VERSION"
  read -r antwort
  [[ "$antwort" =~ ^[jJyY]$ ]] || fehler "Abgebrochen."
}

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------
# curl (Startprüfung, Docker-Schlüssel), iproute2 (IP-Erkennung), ca-certificates (HTTPS).
installiere_grundwerkzeuge() {
  local fehlt=()
  command -v curl >/dev/null 2>&1 || fehlt+=(curl)
  command -v ip >/dev/null 2>&1 || fehlt+=(iproute2)
  [[ -d /etc/ssl/certs ]] || fehlt+=(ca-certificates)
  if [[ ${#fehlt[@]} -eq 0 ]]; then
    ok "Grundwerkzeuge vorhanden."
    return 0
  fi
  [[ "$(os_feld ID)" == "debian" ]] || fehler "Es fehlen: ${fehlt[*]}. Bitte manuell installieren."
  info "Installiere Grundwerkzeuge: ${fehlt[*]} …"
  ausfuehren apt-get update
  ausfuehren apt-get install -y "${fehlt[@]}"
  ok "Grundwerkzeuge installiert."
}

docker_vorhanden() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

installiere_docker() {
  if docker_vorhanden; then
    ok "Docker und Compose sind bereits installiert."
    return 0
  fi
  local id
  id="$(os_feld ID)"
  [[ "$id" == "debian" ]] || fehler "Docker fehlt. Automatische Installation nur auf Debian möglich."

  info "Installiere Docker aus dem offiziellen Docker-Repository …"
  local codename arch
  codename="$(os_feld VERSION_CODENAME)"
  arch="$(architektur)"
  ausfuehren install -m 0755 -d /etc/apt/keyrings
  ausfuehren curl -fsSL "${DOCKER_REPO}/gpg" -o /etc/apt/keyrings/docker.asc
  ausfuehren chmod a+r /etc/apt/keyrings/docker.asc
  schreibe_datei "${LION_ROOT}/etc/apt/sources.list.d/docker.sources" 0644 <<EOF
Types: deb
URIs: ${DOCKER_REPO}
Suites: ${codename}
Components: stable
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  ausfuehren apt-get update
  ausfuehren apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  ausfuehren systemctl enable --now docker
  ok "Docker installiert."
}

lege_benutzer_an() {
  if id lion >/dev/null 2>&1; then
    ok "Systembenutzer „lion“ existiert bereits."
    return 0
  fi
  ausfuehren useradd --system --home-dir /var/lib/lion --shell /usr/sbin/nologin lion
  ok "Systembenutzer „lion“ angelegt."
}

lege_ordner_an() {
  ausfuehren install -d -m 0755 "$(pfad_opt)" "$(pfad_stack)" "$(pfad_stack)/www"
  ausfuehren install -d -m 0750 "$(pfad_etc)" "$(pfad_var)"
  ausfuehren install -d -m 0755 "$(pfad_srv)" "$(pfad_srv)/apps"
  ok "Ordnerstruktur angelegt."
}

# Zufälliges Geheimnis (64 Hex-Zeichen), ohne externe Abhängigkeiten.
erzeuge_geheimnis() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# Schreibt lion.env nur, wenn es noch nicht existiert – vorhandene Secrets bleiben.
schreibe_konfiguration() {
  local datei
  datei="$(pfad_env)"
  if [[ -f "$datei" ]]; then
    ok "Konfiguration vorhanden ($datei) – bleibt unverändert."
    return 0
  fi
  schreibe_datei "$datei" 0600 <<EOF
# Lion OS – Konfiguration. Diese Datei enthält Geheimnisse: nicht weitergeben.
LION_VERSION=${LION_VERSION}
LION_SECRET=$(erzeuge_geheimnis)
EOF
  ok "Konfiguration angelegt ($datei)."
}

# IPv4-Adressen echter Netzwerkkarten (ohne Docker-, VPN- und virtuelle Brücken).
lokale_ipv4() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show scope global 2>/dev/null |
      awk '$2 !~ /^(docker|br-|veth|virbr|cni|flannel|tailscale|wg|lo)/ {split($4, a, "/"); print a[1]}'
  else
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}

# Adressen, unter denen die Oberfläche erreichbar sein soll.
site_adressen() {
  local adressen=("localhost" "$(hostname -s 2>/dev/null || echo lion).local")
  local ip
  while IFS= read -r ip; do
    # Nur private IPv4-Adressen (Heimnetz)
    if [[ "$ip" =~ ^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]; then
      adressen+=("$ip")
    fi
  done < <(lokale_ipv4)
  printf '%s\n' "${adressen[@]}"
}

render_caddyfile() {
  local liste="" a
  while IFS= read -r a; do
    [[ -z "$a" ]] && continue
    liste+="${liste:+, }https://${a}"
  done < <(site_adressen)
  cat <<EOF
# Lion OS – Caddy. Erzeugt vom Installer, wird bei jeder Installation neu geschrieben.
{
	# Lokales HTTPS mit eigener Zertifizierungsstelle (kein Internet nötig)
	local_certs
}

http:// {
	redir https://{host}{uri} permanent
}

${liste} {
	tls internal
	encode zstd gzip
	header {
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
	}
	root * /srv/www
	file_server
}
EOF
}

render_compose() {
  cat <<EOF
# Lion OS – Basis-Stack. Erzeugt vom Installer.
name: lion

services:
  caddy:
    image: ${CADDY_IMAGE}
    container_name: lion-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./www:/srv/www:ro
      - caddy_data:/data
      - caddy_config:/config
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true

volumes:
  caddy_data:
  caddy_config:
EOF
}

render_startseite() {
  cat <<EOF
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lion OS</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0d0c09; color:#f6f1e6; font-family:system-ui,sans-serif; }
  main { text-align:center; padding:2rem; }
  h1 { font-size:clamp(2.5rem,8vw,4.5rem); margin:0; letter-spacing:-.03em; }
  h1 span { color:#e3b12e; }
  p { color:#b8b09f; font-size:1.125rem; }
</style>
</head>
<body>
<main>
  <h1>Lion <span>OS</span></h1>
  <p>Installation erfolgreich. Version ${LION_VERSION}.</p>
  <p>Die Oberfläche folgt in der nächsten Version.</p>
</main>
</body>
</html>
EOF
}

schreibe_stack() {
  local stack
  stack="$(pfad_stack)"
  render_caddyfile | schreibe_datei "$stack/Caddyfile" 0644
  render_compose | schreibe_datei "$stack/compose.yaml" 0644
  render_startseite | schreibe_datei "$stack/www/index.html" 0644
  ok "Stack-Dateien geschrieben ($stack)."
}

render_unit() {
  cat <<EOF
[Unit]
Description=Lion OS Basis-Stack
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/lion/stack
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
}

richte_dienst_ein() {
  render_unit | schreibe_datei "$(pfad_unit)" 0644
  ausfuehren systemctl daemon-reload
  ausfuehren systemctl enable lion.service
  ausfuehren systemctl restart lion.service
  ok "Dienst „lion“ eingerichtet und gestartet."
}

warte_auf_start() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  info "Warte, bis Lion OS antwortet …"
  for _ in $(seq 1 60); do
    if curl -skf --max-time 2 https://localhost/ >/dev/null 2>&1; then
      ok "Lion OS antwortet."
      return 0
    fi
    sleep 1
  done
  fehler "Lion OS antwortet nicht. Prüfe: sudo systemctl status lion && sudo docker compose -f /opt/lion/stack/compose.yaml logs"
}

zusammenfassung() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '\nProbelauf beendet. Es wurde nichts verändert.\n'
    return 0
  fi
  printf '\n%sLion OS %s ist installiert.%s\n\n' "$FARBE_GRUEN" "$LION_VERSION" "$FARBE_AUS"
  printf 'Öffne im Browser (im Heimnetz):\n'
  local a
  while IFS= read -r a; do [[ -n "$a" && "$a" != "localhost" ]] && printf '  https://%s\n' "$a"; done < <(site_adressen)
  cat <<'EOF'

Hinweis: Lion OS nutzt ein eigenes Zertifikat. Der Browser warnt beim ersten Besuch –
das ist im Heimnetz normal. Gib die Oberfläche NICHT per Portfreigabe ins Internet frei;
Fernzugriff kommt später sicher über WireGuard.
EOF
}

main() {
  parse_args "$@"
  info "Lion OS Installer ${LION_VERSION}"
  [[ "$DRY_RUN" -eq 1 ]] && info "Probelauf: Es wird nichts verändert."
  pruefe_root
  pruefe_os
  pruefe_architektur
  pruefe_ressourcen
  pruefe_ports
  bestaetigen
  installiere_grundwerkzeuge
  installiere_docker
  lege_benutzer_an
  lege_ordner_an
  schreibe_konfiguration
  schreibe_stack
  richte_dienst_ein
  warte_auf_start
  zusammenfassung
}

# Nur ausführen, wenn direkt aufgerufen (nicht beim Einbinden in Tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
