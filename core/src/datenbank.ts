import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * SQLite über das in Node eingebaute node:sqlite – keine nativen Zusatzpakete nötig.
 * Migrationen sind nummeriert und laufen genau einmal.
 */
const MIGRATIONEN: string[] = [
  `CREATE TABLE benutzer (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL UNIQUE,
     passwort_hash TEXT NOT NULL,
     erstellt_am TEXT NOT NULL
   );
   CREATE TABLE sitzungen (
     token_hash TEXT PRIMARY KEY,
     benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
     laeuft_ab INTEGER NOT NULL
   );
   CREATE TABLE audit (
     id INTEGER PRIMARY KEY,
     zeit TEXT NOT NULL,
     benutzer TEXT,
     aktion TEXT NOT NULL,
     ziel TEXT,
     ergebnis TEXT NOT NULL,
     details TEXT
   );`,
  `CREATE TABLE apps (
     id TEXT PRIMARY KEY,
     nummer INTEGER NOT NULL UNIQUE,
     status TEXT NOT NULL,
     meldung TEXT,
     installiert_am TEXT NOT NULL
   );`,
];

export type Datenbank = DatabaseSync;

export function oeffneDatenbank(pfad: string): Datenbank {
  if (pfad !== ":memory:") mkdirSync(dirname(pfad), { recursive: true });
  const db = new DatabaseSync(pfad);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const zeile = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let version = zeile?.version ?? 0;
  if (!zeile) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  while (version < MIGRATIONEN.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONEN[version]!);
      version += 1;
      db.prepare("UPDATE schema_version SET version = ?").run(version);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}
