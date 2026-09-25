import { AppVerwaltung } from "./apps.js";
import { BackupVerwaltung } from "./backup/backup.js";
import { DockerRestic } from "./backup/restic.js";
import { pruefeZiel } from "./backup/ziel.js";
import { DateiCaddy } from "./caddy.js";
import { oeffneDatenbank } from "./datenbank.js";
import { ladeKatalog } from "./katalog.js";
import { ladeKonfiguration } from "./konfiguration.js";
import { HintergrundFoto } from "./hintergrund.js";
import { HelferClient } from "./helfer-client.js";
import { uuidAusZiel } from "./helfer/datentraeger.js";
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
  medienOrdner: konfig.medien,
});
const helfer = new HelferClient(konfig.helferSocket);
const backup = new BackupVerwaltung({
  db,
  restic: new DockerRestic(),
  apps,
  pfade: { appDaten: konfig.appsDaten, appZustand: konfig.appsZustand, arbeit: konfig.backupArbeit },
  // Liegt das Ziel auf einer USB-Platte von lion-helper, nach einem Neustart vorher wieder einhängen.
  zielBereitstellen: async (ziel) => {
    const uuid = uuidAusZiel(ziel);
    if (uuid) await helfer.einhaengen(uuid);
  },
  pruefeZiel: (pfad) => pruefeZiel(pfad, { erlaubt: konfig.backupZiele, daten: konfig.appsDaten }),
});
const server = baueServer({ db, version: konfig.version, logger: true, apps, einrichtungsCode: konfig.einrichtungsCode, adressen: () => caddy.adressen(), backup, hintergrund: new HintergrundFoto(konfig.hintergrund), helfer });
for (const f of katalog.fehler) server.log.warn(`App-Vorlage abgelehnt: ${f}`);
server.log.info(`${katalog.vorlagen.length} App-Vorlagen geladen.`);
if (!konfig.einrichtungsCode) server.log.warn("Kein LION_SETUP_CODE gesetzt – jeder im Netz kann die Einrichtung durchführen.");

setInterval(() => raeumeAbgelaufeneAuf(db), 60 * 60 * 1000).unref();
// Zeitplan fürs Backup: jede Minute prüfen, ob die tägliche Sicherung fällig ist.
setInterval(() => backup.zeitplanPruefen(), 60 * 1000).unref();

const beenden = async () => {
  await server.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", beenden);
process.on("SIGINT", beenden);

await server.listen({ host: konfig.host, port: konfig.port });
