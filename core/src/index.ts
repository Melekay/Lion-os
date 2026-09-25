import { oeffneDatenbank } from "./datenbank.js";
import { ladeKonfiguration } from "./konfiguration.js";
import { baueServer } from "./server.js";
import { raeumeAbgelaufeneAuf } from "./sitzungen.js";

const konfig = ladeKonfiguration();
const db = oeffneDatenbank(konfig.datenbank);
const server = baueServer({ db, version: konfig.version, logger: true });

setInterval(() => raeumeAbgelaufeneAuf(db), 60 * 60 * 1000).unref();

const beenden = async () => {
  await server.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", beenden);
process.on("SIGINT", beenden);

await server.listen({ host: konfig.host, port: konfig.port });
