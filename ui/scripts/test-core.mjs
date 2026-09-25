#!/usr/bin/env node
// Startet ein echtes lion-core mit frischer, leerer Datenbank für die Oberflächen-Tests.
// Voraussetzung: lion-core ist gebaut (cd ../core && npm ci && npm run build).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const TEST_CODE = "TEST-CODE-1234";

const core = fileURLToPath(new URL("../../core/dist/index.js", import.meta.url));
const katalog = fileURLToPath(new URL("../../apps", import.meta.url));
if (!existsSync(core)) {
  console.error("lion-core ist nicht gebaut. Bitte: cd core && npm ci && npm run build");
  process.exit(1);
}

const basis = join(tmpdir(), "lion-ui-e2e");
rmSync(basis, { recursive: true, force: true });
mkdirSync(basis, { recursive: true });

const kind = spawn(process.execPath, [core], {
  stdio: "inherit",
  env: {
    ...process.env,
    LION_SECRET: "e2e-".padEnd(64, "x"),
    LION_SETUP_CODE: TEST_CODE,
    LION_DB: join(basis, "lion.db"),
    LION_HOST: "127.0.0.1",
    LION_PORT: process.env.LION_PORT ?? "8091",
    LION_KATALOG: katalog,
    LION_APPS_ZUSTAND: join(basis, "zustand"),
    LION_APPS_DATEN: join(basis, "daten"),
    LION_CADDY_APPS: join(basis, "caddy"),
    LION_ADRESSEN: join(basis, "adressen"),
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => kind.kill(signal));
kind.on("exit", (code) => process.exit(code ?? 0));
