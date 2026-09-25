#!/usr/bin/env bash
# Deutsche Anführungszeichen in Meldungen sind gewollt.
# shellcheck disable=SC1111
# Rauchtest für eine frisch installierte Lion-OS-Maschine (CI oder Testgerät).
#
# Prüft den ganzen Weg: Browser → Caddy → lion-core → Docker → App.
#   1. Einrichtung ohne bzw. mit falschem Code wird abgelehnt
#   2. Einrichtung mit dem Code aus /etc/lion/lion.env klappt
#   3. Uptime Kuma installieren, per HTTPS über Caddy erreichen
#   4. Entfernen: Port zu, Daten bleiben
#
# ACHTUNG: Legt einen Admin an und installiert eine App. Nur auf Testsystemen ausführen.
# Aufruf:  LION_RAUCHTEST=1 ./installer/tests/rauchtest.sh

set -euo pipefail

[[ "${LION_RAUCHTEST:-0}" == "1" ]] || {
  echo "Nur auf Testsystemen: mit LION_RAUCHTEST=1 bestätigen." >&2
  exit 2
}

BASIS="https://localhost"
APP="uptime-kuma"
APP_PORT=8101
PASSWORT="rauchtest-passwort-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"
KEKSE="$(mktemp)"
trap 'rm -f "$KEKSE"' EXIT

schritt() { printf '▸ %s\n' "$*"; }
fehler() { printf '✖ %s\n' "$*" >&2; exit 1; }

# POST mit CSRF-Header und Sitzungs-Cookie; gibt den HTTP-Status aus.
post() {
  curl -sk -o /dev/null -w '%{http_code}' -b "$KEKSE" -c "$KEKSE" \
    -H 'X-Lion-Request: 1' -H 'content-type: application/json' -d "$2" "$BASIS$1"
}

# Status der App laut /api/apps („keine“, wenn nicht installiert).
app_status() {
  curl -skf -b "$KEKSE" "$BASIS/api/apps" | /usr/bin/node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const a = JSON.parse(s).apps.find((x) => x.id === process.argv[1]);
      console.log(a?.installiert ? a.installiert.status + (a.installiert.meldung ? ": " + a.installiert.meldung : "") : "keine");
    });' "$APP"
}

warte_auf_status() {
  local ziel="$1" s=""
  for _ in $(seq 1 300); do
    s="$(app_status)"
    [[ "$s" == "$ziel" ]] && return 0
    [[ "$s" == fehler* ]] && fehler "App meldet Fehler: $s"
    sleep 2
  done
  fehler "Zeitüberschreitung: erwartet „$ziel“, zuletzt „$s“."
}

schritt "lion-core antwortet über Caddy"
curl -skf "$BASIS/api/health" | grep -q '"ok":true' || fehler "/api/health antwortet nicht."

schritt "Einrichtung ohne und mit falschem Code wird abgelehnt"
code="$(post /api/setup "{\"name\":\"admin\",\"passwort\":\"$PASSWORT\"}")"
[[ "$code" == "403" ]] || fehler "Ohne Code erwartet 403, bekommen $code."
code="$(post /api/setup "{\"name\":\"admin\",\"passwort\":\"$PASSWORT\",\"code\":\"AAAA-BBBB-CCCC\"}")"
[[ "$code" == "403" ]] || fehler "Mit falschem Code erwartet 403, bekommen $code."

schritt "Einrichtung mit dem echten Code"
einrichtungscode="$(sudo sed -n 's/^LION_SETUP_CODE=//p' /etc/lion/lion.env)"
[[ -n "$einrichtungscode" ]] || fehler "Kein LION_SETUP_CODE in /etc/lion/lion.env."
code="$(post /api/setup "{\"name\":\"admin\",\"passwort\":\"$PASSWORT\",\"code\":\"$einrichtungscode\"}")"
[[ "$code" == "201" ]] || fehler "Einrichtung erwartet 201, bekommen $code."

schritt "lion-helper läuft, Socket nur für root und Gruppe lion"
sudo systemctl is-active --quiet lion-helper || fehler "lion-helper läuft nicht."
rechte="$(sudo stat -c '%a %U %G' /run/lion-helper/helfer.sock)"
[[ "$rechte" == "660 root lion" ]] || fehler "Socket-Rechte erwartet „660 root lion“, bekommen „$rechte“."
# lion-helper führt als root Code aus /opt/lion/core aus – lion darf dort nichts ändern.
# Geprüft wird der ganze Weg (Ordner darüber zählen mit) und jede Datei darunter.
for pfad in / /opt /opt/lion; do
  sudo -u lion test -w "$pfad" && fehler "lion darf in $pfad schreiben ($(sudo stat -c '%a %U:%G' "$pfad")) – lion-helper wäre angreifbar."
done
fremd="$(sudo find /opt/lion/core \( ! -user root -o -perm /022 \) -printf '%M %u %p\n' | head -n 5)"
[[ -z "$fremd" ]] || fehler "Nicht nur root darf den Code von lion-helper ändern:
$fremd"
sudo -u lion test -w /opt/lion/core/dist/helfer/index.js && fehler "lion darf den Code von lion-helper ändern – das wäre ein Weg zu root."
code="$(curl -sk -o /dev/null -w '%{http_code}' -b "$KEKSE" "$BASIS/api/datentraeger")"
[[ "$code" == "200" ]] || fehler "/api/datentraeger erwartet 200, bekommen $code."

schritt "$APP installieren (lädt das Image, kann dauern)"
code="$(post "/api/apps/$APP/installieren" '{}')"
[[ "$code" == "202" ]] || fehler "Installation erwartet 202, bekommen $code."
warte_auf_status laeuft

schritt "$APP ist per HTTPS über Caddy erreichbar (Port $APP_PORT)"
erreichbar=""
for _ in $(seq 1 30); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' "https://localhost:$APP_PORT/" || true)"
  if [[ "$code" =~ ^(200|302)$ ]]; then erreichbar=1; break; fi
  sleep 2
done
[[ -n "$erreichbar" ]] || fehler "https://localhost:$APP_PORT antwortet nicht (zuletzt $code)."

schritt "$APP entfernen – Daten bleiben"
code="$(post "/api/apps/$APP/entfernen" "{\"bestaetigung\":\"$APP\"}")"
[[ "$code" == "202" ]] || fehler "Entfernen erwartet 202, bekommen $code."
warte_auf_status keine
if curl -sk -o /dev/null --max-time 3 "https://localhost:$APP_PORT/"; then
  fehler "Port $APP_PORT ist nach dem Entfernen noch offen."
fi
sudo test -d "/srv/lion/apps/$APP" || fehler "Datenordner wurde gelöscht."

printf '✔ Rauchtest bestanden.\n'
