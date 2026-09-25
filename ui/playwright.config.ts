import { defineConfig, devices } from "@playwright/test";

/**
 * Oberflächen-Tests gegen den statischen Export (vorher `npm run build`, für „echt“ auch lion-core bauen).
 * - attrappe.spec.ts: API wird im Browser nachgebildet (schnell, jeder Zustand prüfbar)
 * - echt.spec.ts: echtes lion-core mit leerer Datenbank (nur Desktop, da es den Zustand verändert)
 */
const PORT = 3200;
const CORE_PORT = 8091;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: "node scripts/test-core.mjs",
      url: `http://127.0.0.1:${CORE_PORT}/api/health`,
      env: { LION_PORT: String(CORE_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node scripts/vorschau.mjs",
      url: `http://localhost:${PORT}/`,
      env: { PORT: String(PORT), LION_API: `http://127.0.0.1:${CORE_PORT}` },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "handy", use: { ...devices["Pixel 7"] }, testIgnore: /echt\.spec\.ts/ },
  ],
});
