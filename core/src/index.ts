import { AppVerwaltung } from "./apps.js";
import { DateiCaddy } from "./caddy.js";
import { oeffneDatenbank } from "./datenbank.js";
import { ladeKatalog } from "./katalog.js";
import { ladeKonfiguration } from "./konfiguration.js";
import { baueServer } from "./server.js";
import { DockerComposeLaufzeit } from "./laufzeit.js";
import { raeumeAbgelaufeneAuf } from "./sitzungen.js";

const konfig = ladeKonfiguration();
const db = oeffneDatenbank(konfig.datenbank);
const katalog = await ladeKatalog(konfig.katalog);
const caddy = new DateiCaddy(konfig.caddyApps, konfig.adressen);
const apps = new AppVerwaltung({
  db,
  vorlagen: katalog.vorlagen,
  laufzeit: new DockerComposeLaufzeit(),
  caddy,
  zustandsOrdner: konfig.appsZustand,
  datenOrdner: konfig.appsDaten,
});
const server = baueServer({ db, version: konfig.version, logger: true, apps, einrichtungsCode: konfig.einrichtungsCode, adressen: () => caddy.adressen() });
for (const f of katalog.fehler) server.log.warn(`App-Vorlage abgelehnt: ${f}`);
server.log.info(`${katalog.vorlagen.length} App-Vorlagen geladen.`);
if (!konfig.einrichtungsCode) server.log.warn("Kein LION_SETUP_CODE gesetzt – jeder im Netz kann die Einrichtung durchführen.");

setInterval(() => raeumeAbgelaufeneAuf(db), 60 * 60 * 1000).unref();

const beenden = async () => {
  await server.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", beenden);
process.on("SIGINT", beenden);

await server.listen({ host: konfig.host, port: konfig.port });
