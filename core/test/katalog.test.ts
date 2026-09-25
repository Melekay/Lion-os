import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appDatenOrdner, ladeKatalog, ManifestSchema, pruefeCompose } from "../src/katalog.js";

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
    expect(vorlagen.map((v) => v.manifest.id).sort()).toEqual([
      "actual",
      "audiobookshelf",
      "filebrowser",
      "home-assistant",
      "immich",
      "jellyfin",
      "mealie",
      "navidrome",
      "nextcloud",
      "ollama",
      "paperless-ngx",
      "stirling-pdf",
      "uptime-kuma",
      "vaultwarden",
    ]);
  });

  it("nur FileBrowser darf in den Medienordner schreiben, alle anderen lesen höchstens", async () => {
    const { vorlagen } = await ladeKatalog(KATALOG);
    const schreibend = vorlagen.filter((v) => v.manifest.medien === "schreiben").map((v) => v.manifest.id);
    expect(schreibend).toEqual(["filebrowser"]);
    for (const v of vorlagen.filter((x) => x.manifest.medien === "lesen")) {
      for (const zeile of v.compose.split("\n").filter((z) => z.includes("${LION_MEDIEN}"))) expect(zeile, v.manifest.id).toMatch(/:ro$/);
    }
  });

  it("findet die Datenordner einer Vorlage", async () => {
    const { vorlagen } = await ladeKatalog(KATALOG);
    const immich = vorlagen.find((v) => v.manifest.id === "immich")!;
    expect(appDatenOrdner(immich.compose)).toEqual(["bibliothek", "datenbank"]);
    expect(appDatenOrdner("- ${LION_APP_DATA}/a/b:/x\n- ${LION_APP_DATA}/Hörbücher/:/y\n- ${LION_APP_DATA}/../z:/z")).toEqual(["Hörbücher", "a/b"]);
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

  describe("Medienordner", () => {
    const mitMedien = (medien: string, eintrag: string) =>
      pruefeCompose(gut.replace("      - ${LION_APP_DATA}/html:/usr/share/nginx/html", `      - ${eintrag}`), ManifestSchema.parse({ ...manifest, medien }));

    it("erlaubt lesenden Zugriff nur schreibgeschützt", () => {
      expect(mitMedien("lesen", "${LION_MEDIEN}/Filme:/filme:ro")).toEqual([]);
      expect(mitMedien("lesen", "${LION_MEDIEN}/Hörbücher:/hb:ro")).toEqual([]);
      expect(mitMedien("lesen", "${LION_MEDIEN}:/medien").join(" ")).toMatch(/schreibgeschützt/);
      expect(mitMedien("lesen", "${LION_MEDIEN}:/medien:rw").join(" ")).toMatch(/schreibgeschützt/);
    });

    it("erlaubt Schreiben nur mit „medien: schreiben“", () => {
      expect(mitMedien("schreiben", "${LION_MEDIEN}:/srv")).toEqual([]);
    });

    it("verbietet den Medienordner ohne Angabe im Manifest", () => {
      const fehler = mitMedien("keine", "${LION_MEDIEN}:/medien:ro").join(" ");
      expect(fehler).toMatch(/medien: lesen/);
      expect(fehler).toMatch(/Unbekannte Variable \$\{LION_MEDIEN\}/);
    });

    it("verbietet Ausbrüche aus dem Medienordner", () => {
      expect(mitMedien("lesen", "${LION_MEDIEN}/../apps:/x:ro").join(" ")).toMatch(/\.\./);
      expect(mitMedien("lesen", "${LION_MEDIEN}x:/x:ro").join(" ")).toMatch(/Host-Pfad/);
    });

    it("prüft auch die lange Volume-Schreibweise", () => {
      const lang = (readOnly: boolean) =>
        pruefeCompose(
          gut.replace(
            "      - ${LION_APP_DATA}/html:/usr/share/nginx/html",
            `      - type: bind\n        source: \${LION_MEDIEN}/Musik\n        target: /musik\n        read_only: ${readOnly}`,
          ),
          ManifestSchema.parse({ ...manifest, medien: "lesen" }),
        );
      expect(lang(true)).toEqual([]);
      expect(lang(false).join(" ")).toMatch(/schreibgeschützt/);
    });
  });

  it("lehnt fehlenden Web-Dienst und kaputtes YAML ab", () => {
    expect(pruefeCompose(gut.replace("  app:", "  web:"), manifest).join(" ")).toMatch(/Web-Dienst/);
    expect(pruefeCompose("services: [", manifest)[0]).toMatch(/kein gültiges YAML/);
  });
});
