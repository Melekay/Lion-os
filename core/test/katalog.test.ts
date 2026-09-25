import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ladeKatalog, ManifestSchema, pruefeCompose } from "../src/katalog.js";

const KATALOG = fileURLToPath(new URL("../../apps", import.meta.url));

const manifest = ManifestSchema.parse({
  id: "test",
  name: "Test",
  beschreibung: "Test",
  version: "1",
  kategorie: "test",
  sicherheitsstufe: "normal",
  web: { dienst: "app", port: 80 },
  geheimnisse: ["DB_PASSWORT"],
});

const gut = `services:
  app:
    image: nginx:1.27.0
    ports:
      - "127.0.0.1:\${LION_APP_PORT}:80"
    volumes:
      - \${LION_APP_DATA}/html:/usr/share/nginx/html
    environment:
      PW: \${DB_PASSWORT}
  db:
    image: postgres:17.6-alpine
    volumes:
      - dbdaten:/var/lib/postgresql/data
volumes:
  dbdaten:
`;

describe("Katalog im Repository", () => {
  it("alle mitgelieferten Vorlagen sind gültig und sicher", async () => {
    const { vorlagen, fehler } = await ladeKatalog(KATALOG);
    expect(fehler).toEqual([]);
    expect(vorlagen.map((v) => v.manifest.id).sort()).toEqual(["nextcloud", "uptime-kuma", "vaultwarden"]);
  });

  it("meldet einen fehlenden Katalog, statt abzustürzen", async () => {
    const r = await ladeKatalog("/gibt/es/nicht");
    expect(r.vorlagen).toEqual([]);
    expect(r.fehler[0]).toMatch(/nicht gefunden/);
  });
});

describe("Sicherheitsregeln für compose.yaml", () => {
  it("akzeptiert eine regelkonforme Vorlage", () => {
    expect(pruefeCompose(gut, manifest)).toEqual([]);
  });

  const verstoesse: [string, string, RegExp][] = [
    ["latest", gut.replace("nginx:1.27.0", "nginx:latest"), /latest/],
    ["ohne Version", gut.replace("nginx:1.27.0", "nginx"), /ohne feste Version/],
    ["privileged", gut.replace("    image: nginx:1.27.0", "    image: nginx:1.27.0\n    privileged: true"), /privileged/],
    ["Docker-Socket", gut.replace("${LION_APP_DATA}/html", "/var/run/docker.sock"), /Docker-Socket/],
    ["Host-Netzwerk", gut.replace("    image: nginx:1.27.0", "    image: nginx:1.27.0\n    network_mode: host"), /network_mode/],
    ["fremder Host-Pfad", gut.replace("${LION_APP_DATA}/html", "/etc"), /Host-Pfad/],
    ["Pfad mit ..", gut.replace("${LION_APP_DATA}/html", "${LION_APP_DATA}/../x"), /Host-Pfad|\.\./],
    ["Port nach außen", gut.replace('"127.0.0.1:${LION_APP_PORT}:80"', '"8080:80"'), /Port/],
    ["zweiter Dienst mit Port", gut.replace("  db:\n    image: postgres:17.6-alpine", '  db:\n    image: postgres:17.6-alpine\n    ports:\n      - "5432:5432"'), /Nur der Web-Dienst/],
    ["unbekannte Variable", gut.replace("${DB_PASSWORT}", "${HOME}"), /Unbekannte Variable/],
    ["eigener Build", gut.replace("    image: nginx:1.27.0", "    build: ."), /build|Image fehlt/],
    ["cap_add", gut.replace("    image: nginx:1.27.0", "    image: nginx:1.27.0\n    cap_add: [SYS_ADMIN]"), /cap_add/],
    ["devices", gut.replace("    image: nginx:1.27.0", "    image: nginx:1.27.0\n    devices: ['/dev/sda']"), /devices/],
  ];

  it.each(verstoesse)("lehnt ab: %s", (_name, compose, erwartet) => {
    const fehler = pruefeCompose(compose, manifest);
    expect(fehler.join(" ")).toMatch(erwartet);
  });

  it("lehnt fehlenden Web-Dienst und kaputtes YAML ab", () => {
    expect(pruefeCompose(gut.replace("  app:", "  web:"), manifest).join(" ")).toMatch(/Web-Dienst/);
    expect(pruefeCompose("services: [", manifest)[0]).toMatch(/kein gültiges YAML/);
  });
});
