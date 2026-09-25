#!/usr/bin/env bash
# Deutsche Anführungszeichen in Meldungen sind gewollt.
# shellcheck disable=SC1111
# Lion OS – Installationsskript für Debian 13 (trixie)
#
# Richtet ein:
#   - Docker Engine + Compose-Plugin (offizielles Docker-Repository)
#   - Systembenutzer „lion“ und die Ordnerstruktur
#   - Caddy als Reverse Proxy mit lokalem HTTPS (eigene Zertifizierungsstelle)
#   - Node.js (NodeSource-Repository) und lion-core als systemd-Dienst „lion-core“
#   - Weboberfläche lion-ui (statisch gebaut, von Caddy ausgeliefert)
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
NODE_MAJOR=24
NODE_MIN="22.13"
NODE_REPO="https://deb.nodesource.com/node_${NODE_MAJOR}.x"
CORE_PORT=8080

# Für Tests überschreibbar; im echten Betrieb leer (= Wurzelverzeichnis).
LION_ROOT="${LION_ROOT:-}"
LION_OS_RELEASE="${LION_OS_RELEASE:-/etc/os-release}"
# lion-core nutzt immer das Node.js aus dem Paketsystem (nicht eines aus PATH).
LION_NODE="${LION_NODE:-/usr/bin/node}"

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
pfad_core() { printf '%s/core' "$(pfad_opt)"; }
pfad_unit() { printf '%s/etc/systemd/system/lion.service' "$LION_ROOT"; }
pfad_core_unit() { printf '%s/etc/systemd/system/lion-core.service' "$LION_ROOT"; }
pfad_helper_unit() { printf '%s/etc/systemd/system/lion-helper.service' "$LION_ROOT"; }
# Wurzel des Repositorys, aus dem der Installer gestartet wurde.
pfad_repo() { (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd); }

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

# Ports 80/443 (Caddy) und 8080 (lion-core, nur lokal) müssen frei sein –
# außer Lion OS läuft bereits (erneute Installation).
pruefe_ports() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  if [[ -f "$(pfad_unit)" ]]; then
    return 0
  fi
  command -v ss >/dev/null 2>&1 || return 0
  local port
  for port in 80 443 "$CORE_PORT"; do
    if ss -Hltn "sport = :$port" | grep -q .; then
      fehler "Port $port ist bereits belegt. Bitte den Dienst beenden, der ihn nutzt, und erneut starten."
    fi
  done
  ok "Ports 80, 443 und ${CORE_PORT} sind frei."
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

# Prüft, ob eine Node-Version (z. B. „v22.13.0“) mindestens NODE_MIN ist.
node_passt() {
  local v="${1#v}" haupt neben min_haupt min_neben
  [[ "$v" =~ ^([0-9]+)\.([0-9]+)\. ]] || return 1
  haupt="${BASH_REMATCH[1]}"; neben="${BASH_REMATCH[2]}"
  min_haupt="${NODE_MIN%%.*}"; min_neben="${NODE_MIN#*.}"
  ((haupt > min_haupt || (haupt == min_haupt && neben >= min_neben)))
}

installiere_node() {
  local vorhanden=""
  [[ -x "$LION_NODE" ]] && vorhanden="$("$LION_NODE" --version 2>/dev/null || true)"
  if node_passt "$vorhanden"; then
    ok "Node.js ${vorhanden} ist installiert."
    return 0
  fi
  command -v apt-get >/dev/null 2>&1 || fehler "Node.js ≥ ${NODE_MIN} fehlt. Automatische Installation nur mit apt möglich."

  # Debian 13 liefert Node 20 – zu alt für lion-core. Daher das NodeSource-Repository
  # (signiert, Updates über apt wie beim Rest des Systems).
  info "Installiere Node.js ${NODE_MAJOR} aus dem NodeSource-Repository …"
  local arch
  arch="$(architektur)"
  ausfuehren install -m 0755 -d /etc/apt/keyrings
  ausfuehren curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /etc/apt/keyrings/nodesource.asc
  ausfuehren chmod a+r /etc/apt/keyrings/nodesource.asc
  schreibe_datei "${LION_ROOT}/etc/apt/sources.list.d/nodesource.sources" 0644 <<EOF
Types: deb
URIs: ${NODE_REPO}
Suites: nodistro
Components: main
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/nodesource.asc
EOF
  ausfuehren apt-get update
  ausfuehren apt-get install -y nodejs
  if [[ "$DRY_RUN" -eq 0 ]]; then
    vorhanden="$("$LION_NODE" --version 2>/dev/null || true)"
    node_passt "$vorhanden" || fehler "Node.js-Installation fehlgeschlagen (gefunden: ${vorhanden:-nichts})."
  fi
  ok "Node.js installiert."
}

lege_benutzer_an() {
  if id lion >/dev/null 2>&1; then
    ok "Systembenutzer „lion“ existiert bereits."
    return 0
  fi
  ausfuehren useradd --system --home-dir /var/lib/lion --shell /usr/sbin/nologin lion
  ok "Systembenutzer „lion“ angelegt."
}

# lion-core läuft als Benutzer „lion“ und darf nur in seine eigenen Ordner schreiben.
# lion-helper führt Code aus /opt/lion als root aus. Darf dort (oder in /opt) jemand anderes schreiben,
# könnte er /opt/lion umbenennen und eigenen Code unterschieben. Deshalb: beide Ordner gehören root
# und sind nur für root beschreibbar. Auf Debian ist das Standard; wir korrigieren abweichende Systeme.
sichere_code_ordner() {
  local ordner rechte besitzer
  for ordner in "$(dirname "$(pfad_opt)")" "$(pfad_opt)"; do
    [[ -d "$ordner" ]] || continue
    rechte="$(stat -c '%a' "$ordner")"
    besitzer="$(stat -c '%u' "$ordner")"
    if [[ "$besitzer" != "0" ]]; then
      warnung "$ordner gehört nicht root – wird korrigiert (lion-helper läuft als root)."
      ausfuehren chown root:root "$ordner"
    fi
    if (( (8#$rechte & 8#022) != 0 )); then
      warnung "$ordner ist für andere beschreibbar ($rechte) – wird auf nur-root korrigiert."
      ausfuehren chmod go-w "$ordner"
    fi
  done
}

lege_ordner_an() {
  ausfuehren install -d -m 0755 "$(pfad_opt)" "$(pfad_stack)" "$(pfad_stack)/www" "$(pfad_srv)"
  sichere_code_ordner
  ausfuehren install -d -m 0755 -o lion -g lion "$(pfad_stack)/apps" "$(pfad_srv)/apps"
  ausfuehren install -d -m 0750 -o lion -g lion "$(pfad_var)"
  # /etc/lion: lion darf lesen (Adressliste), lion.env selbst bleibt root vorbehalten (600).
  ausfuehren install -d -m 0750 -o root -g lion "$(pfad_etc)"
  ok "Ordnerstruktur angelegt."
}

# Gemeinsamer Medienordner für FileBrowser (schreibt) und Jellyfin, Navidrome, Audiobookshelf (lesen nur).
# Er gehört UID 1000 – mit dieser Kennung läuft FileBrowser im Container. Vorhandene Ordner bleiben unverändert.
MEDIEN_BESITZER="${MEDIEN_BESITZER:-1000:1000}"
MEDIEN_UNTERORDNER=(Filme Serien Musik Hörbücher)

lege_medienordner_an() {
  local basis ordner
  basis="$(pfad_srv)/medien"
  for ordner in "$basis" "${MEDIEN_UNTERORDNER[@]/#/$basis/}"; do
    [[ -d "$ordner" ]] && continue
    ausfuehren install -d -m 0755 -o "${MEDIEN_BESITZER%%:*}" -g "${MEDIEN_BESITZER##*:}" "$ordner"
  done
  ok "Medienordner bereit ($basis)."
}

# Zufälliges Geheimnis (64 Hex-Zeichen), ohne externe Abhängigkeiten.
erzeuge_geheimnis() {
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

# Einmaliger Code für die Ersteinrichtung, z. B. „K7QM-4XPA-9TRD“ (60 Bit, ohne verwechselbare Zeichen).
erzeuge_einrichtungscode() {
  local roh
  roh="$(LC_ALL=C tr -dc 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' < <(head -c 1024 /dev/urandom))"
  printf '%s-%s-%s' "${roh:0:4}" "${roh:4:4}" "${roh:8:4}"
}

# Liest den Einrichtungscode aus lion.env (leer, wenn keiner da ist).
einrichtungscode() {
  [[ -r "$(pfad_env)" ]] || return 0
  sed -n 's/^LION_SETUP_CODE=//p' "$(pfad_env)" | head -n 1
}

# Schreibt lion.env nur, wenn es noch nicht existiert – vorhandene Secrets bleiben.
# Ältere Installationen ohne Einrichtungscode bekommen ihn ergänzt.
schreibe_konfiguration() {
  local datei
  datei="$(pfad_env)"
  if [[ -f "$datei" ]]; then
    if grep -q '^LION_SETUP_CODE=' "$datei"; then
      ok "Konfiguration vorhanden ($datei) – bleibt unverändert."
    elif [[ "$DRY_RUN" -eq 1 ]]; then
      printf '  [probelauf] ergänze Einrichtungscode in %s\n' "$datei"
    else
      printf 'LION_SETUP_CODE=%s\n' "$(erzeuge_einrichtungscode)" >>"$datei"
      ok "Einrichtungscode ergänzt ($datei)."
    fi
    return 0
  fi
  schreibe_datei "$datei" 0600 <<EOF
# Lion OS – Konfiguration. Diese Datei enthält Geheimnisse: nicht weitergeben.
LION_VERSION=${LION_VERSION}
LION_SECRET=$(erzeuge_geheimnis)
# Nur für die Ersteinrichtung nötig; danach ohne Wirkung.
LION_SETUP_CODE=$(erzeuge_einrichtungscode)
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

# Ein Eintrag pro installierter App (von lion-core geschrieben).
import /etc/caddy/apps/*.caddy

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
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		# Next.js bettet kleine Start-Skripte ein, daher 'unsafe-inline'; fremde Quellen sind ausgeschlossen.
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
	}
	# API von lion-core (nur auf 127.0.0.1 erreichbar; Caddy läuft im Host-Netz)
	handle /api/* {
		reverse_proxy 127.0.0.1:${CORE_PORT}
	}
	# Oberfläche (lion-ui): Dateinamen unter /_next/static ändern sich mit jedem Build.
	handle {
		root * /srv/www
		@unveraenderlich path /_next/static/*
		header @unveraenderlich Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
	handle_errors 404 {
		root * /srv/www
		rewrite * /404.html
		file_server
	}
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
    # Host-Netzwerk: Caddy kann so neue App-Ports öffnen und Apps auf 127.0.0.1 erreichen.
    # Apps selbst veröffentlichen nur auf 127.0.0.1 – die einzige Tür nach außen ist Caddy.
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./www:/srv/www:ro
      - ./apps:/etc/caddy/apps:ro
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

# Liste der Adressen für lion-core (App-Einträge in Caddy nutzen dieselben Adressen).
schreibe_adressen() {
  site_adressen | schreibe_datei "$(pfad_etc)/adressen" 0644
}

# Kopiert den App-Katalog aus dem Repository nach /opt/lion/apps.
kopiere_katalog() {
  local quelle
  quelle="$(pfad_repo)/apps"
  if [[ ! -d "$quelle" ]]; then
    warnung "App-Katalog nicht gefunden ($quelle) – übersprungen."
    return 0
  fi
  ausfuehren install -d -m 0755 "$(pfad_opt)/apps"
  ausfuehren cp -a "$quelle/." "$(pfad_opt)/apps/"
  ok "App-Katalog kopiert ($(pfad_opt)/apps)."
}

# Baut lion-core aus dem Repository nach /opt/lion/core (gehört root, lion darf nur lesen).
# npm läuft ohne Paket-Skripte (--ignore-scripts): Bei der Installation wird kein Fremdcode ausgeführt.
installiere_core() {
  local quelle ziel npm
  quelle="$(pfad_repo)/core"
  ziel="$(pfad_core)"
  npm="$(dirname "$LION_NODE")/npm"
  [[ -f "$quelle/package-lock.json" ]] || fehler "lion-core nicht gefunden ($quelle)."
  info "Baue lion-core …"
  ausfuehren install -d -m 0755 "$ziel"
  ausfuehren rm -rf "$ziel/src" "$ziel/dist"
  ausfuehren cp -a "$quelle/src" "$quelle/package.json" "$quelle/package-lock.json" \
    "$quelle/tsconfig.json" "$quelle/tsconfig.build.json" "$ziel/"
  # PATH zuerst mit dem Node von Lion OS: npm startet über „#!/usr/bin/env node“.
  local pfad
  pfad="$(dirname "$LION_NODE"):$PATH"
  ausfuehren env -C "$ziel" PATH="$pfad" "$npm" ci --ignore-scripts --no-audit --no-fund --loglevel=error
  ausfuehren env -C "$ziel" PATH="$pfad" "$npm" run --silent build
  ausfuehren env -C "$ziel" PATH="$pfad" "$npm" prune --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  # lion-helper führt diesen Code als root aus: alles gehört root, niemand sonst darf schreiben.
  # (cp -a übernimmt sonst den Besitzer aus dem Repository, npm legt Dateien je nach Umgebung anders an.)
  ausfuehren chown -R root:root "$ziel"
  ausfuehren chmod -R go-w "$ziel"
  sichere_code_ordner
  ok "lion-core gebaut ($ziel)."
}

# Baut die Oberfläche in einem Wegwerf-Ordner und legt nur das Ergebnis (statische Dateien)
# nach /opt/lion/stack/www. Nur Build-Pakete (--omit=dev), keine Paket-Skripte, keine Telemetrie.
installiere_ui() {
  local quelle bau www npm
  quelle="$(pfad_repo)/ui"
  www="$(pfad_stack)/www"
  npm="$(dirname "$LION_NODE")/npm"
  [[ -f "$quelle/package-lock.json" ]] || fehler "lion-ui nicht gefunden ($quelle)."
  info "Baue die Oberfläche (dauert etwa eine Minute) …"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  [probelauf] baue %s und kopiere out/ nach %s\n' "$quelle" "$www"
    ok "Oberfläche gebaut."
    return 0
  fi
  bau="$(mktemp -d /var/tmp/lion-ui.XXXXXX)"
  cp -a "$quelle/app" "$quelle/components" "$quelle/lib" "$quelle/public" "$quelle/package.json" \
    "$quelle/package-lock.json" "$quelle/next.config.ts" "$quelle/tsconfig.json" "$quelle/postcss.config.mjs" "$bau/"
  # PATH zuerst mit dem Node von Lion OS: npm und next starten über „#!/usr/bin/env node“.
  env -C "$bau" PATH="$(dirname "$LION_NODE"):$PATH" NEXT_TELEMETRY_DISABLED=1 \
    "$npm" ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
  env -C "$bau" PATH="$(dirname "$LION_NODE"):$PATH" NEXT_TELEMETRY_DISABLED=1 \
    "$LION_NODE" node_modules/next/dist/bin/next build >/dev/null
  [[ -f "$bau/out/index.html" ]] || fehler "Oberfläche konnte nicht gebaut werden."
  # Inhalt ersetzen, nicht den Ordner: Caddy hat genau diesen Ordner eingebunden.
  install -d -m 0755 "$www"
  find "$www" -mindepth 1 -delete
  cp -a "$bau/out/." "$www/"
  chmod -R u=rwX,go=rX "$www"
  rm -rf "$bau"
  ok "Oberfläche gebaut ($www)."
}

schreibe_stack() {
  local stack
  stack="$(pfad_stack)"
  render_caddyfile | schreibe_datei "$stack/Caddyfile" 0644
  render_compose | schreibe_datei "$stack/compose.yaml" 0644
  schreibe_adressen
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

# lion-core läuft als Benutzer „lion“ in einer engen systemd-Sandbox. Die Gruppe „docker“
# braucht es, um Apps zu verwalten – sie kommt einem Root-Zugang nahe. Deshalb darf lion-core
# sonst fast nichts: nur in seine Ordner schreiben, keine neuen Rechte, keine Geräte.
render_core_unit() {
  cat <<EOF
[Unit]
Description=Lion OS – lion-core (API)
Requires=docker.service
Wants=lion.service lion-helper.service
After=docker.service lion.service lion-helper.service network-online.target

[Service]
Type=simple
User=lion
Group=lion
SupplementaryGroups=docker
EnvironmentFile=/etc/lion/lion.env
Environment=NODE_ENV=production
Environment=LION_HOST=127.0.0.1
Environment=LION_PORT=${CORE_PORT}
Environment=DOCKER_CONFIG=/var/lib/lion/.docker
WorkingDirectory=/opt/lion/core
ExecStart=${LION_NODE} dist/index.js
Restart=on-failure
RestartSec=5

# Sandbox
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ReadWritePaths=/var/lib/lion /srv/lion/apps /opt/lion/stack/apps
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
RestrictNamespaces=yes
LockPersonality=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF
}

# lion-helper: einziger Dienst mit root-Rechten, nur feste Aktionen (USB-Datenträger ein-/aushängen).
# Bewusst OHNE Mount-Namespace-Sandbox (ProtectSystem, PrivateTmp, …): Einhängungen müssen im ganzen
# System sichtbar sein, sonst sähen Docker und lion-core die Platte nicht. Stattdessen: nur CAP_SYS_ADMIN,
# kein Netzwerk, Socket nur für Gruppe „lion“.
render_helper_unit() {
  cat <<EOF
[Unit]
Description=Lion OS – lion-helper (feste Systemaktionen)
After=local-fs.target

[Service]
Type=simple
User=root
Group=lion
Environment=NODE_ENV=production
Environment=LION_HELPER_SOCKET=/run/lion-helper/helfer.sock
WorkingDirectory=/opt/lion/core
ExecStart=${LION_NODE} dist/helfer/index.js
RuntimeDirectory=lion-helper
RuntimeDirectoryMode=0750
UMask=0007
Restart=on-failure
RestartSec=5

# Sandbox ohne eigenen Mount-Namespace
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_SYS_ADMIN
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX
IPAddressDeny=any
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF
}

richte_dienst_ein() {
  render_unit | schreibe_datei "$(pfad_unit)" 0644
  render_core_unit | schreibe_datei "$(pfad_core_unit)" 0644
  render_helper_unit | schreibe_datei "$(pfad_helper_unit)" 0644
  ausfuehren systemctl daemon-reload
  ausfuehren systemctl enable lion.service lion-helper.service lion-core.service
  ausfuehren systemctl restart lion.service
  ausfuehren systemctl restart lion-helper.service
  ausfuehren systemctl restart lion-core.service
  ok "Dienste „lion“, „lion-helper“ und „lion-core“ eingerichtet und gestartet."
}

warte_auf_start() {
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  info "Warte, bis Lion OS antwortet …"
  for _ in $(seq 1 60); do
    if curl -skf --max-time 2 https://localhost/api/health >/dev/null 2>&1; then
      ok "Lion OS antwortet."
      return 0
    fi
    sleep 1
  done
  fehler "Lion OS antwortet nicht. Prüfe: sudo systemctl status lion lion-core && sudo journalctl -u lion-core -n 50"
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
  local code
  code="$(einrichtungscode)"
  if [[ -n "$code" ]]; then
    printf '\nEinrichtungscode (nur für die Ersteinrichtung): %s%s%s\n' "$FARBE_GOLD" "$code" "$FARBE_AUS"
    printf 'Später wieder anzeigen: sudo grep LION_SETUP_CODE %s\n' "$(pfad_env)"
  fi
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
  installiere_node
  lege_benutzer_an
  lege_ordner_an
  lege_medienordner_an
  schreibe_konfiguration
  schreibe_stack
  kopiere_katalog
  installiere_core
  installiere_ui
  richte_dienst_ein
  warte_auf_start
  zusammenfassung
}

# Nur ausführen, wenn direkt aufgerufen (nicht beim Einbinden in Tests).
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
