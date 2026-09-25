import { expect, test } from "@playwright/test";

/** Startseite (Übersicht) – nicht /anmelden/ oder /einrichtung/. */
const START = /^http:\/\/localhost:\d+\/$/;

/**
 * Gegen ein echtes lion-core (scripts/test-core.mjs, leere Datenbank, Code TEST-CODE-1234).
 * Prüft, dass Oberfläche und API wirklich zusammenpassen. Läuft der Reihe nach, weil es den Zustand verändert.
 */
test.describe.configure({ mode: "serial" });

const PASSWORT = "ein-sehr-langes-test-passwort";

test("Einrichtung mit echtem lion-core: falscher Code abgelehnt, richtiger Code führt zur Übersicht", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/einrichtung\/$/);

  await page.getByLabel("Einrichtungscode").fill("FALSCH-FALSCH");
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORT);
  await page.getByLabel("Passwort wiederholen").fill(PASSWORT);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Einrichtungscode falsch");

  // Kleinbuchstaben und Leerzeichen sind egal – lion-core normalisiert.
  await page.getByLabel("Einrichtungscode").fill(" test-code-1234 ");
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page).toHaveURL(START);
  await expect(page.getByRole("banner")).toContainText("admin");
  await expect(page.getByRole("meter", { name: "Arbeitsspeicher belegt" })).toBeVisible();
});

test("zweite Einrichtung ist nicht möglich", async ({ page }) => {
  await page.goto("/einrichtung/");
  await expect(page).toHaveURL(/\/(anmelden\/)?$/);
});

test("App-Katalog kommt aus apps/ im Repository", async ({ page }) => {
  await page.goto("/anmelden/");
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(START);

  await page.goto("/apps/");
  for (const name of ["Uptime Kuma", "Vaultwarden", "Nextcloud"]) {
    await expect(page.getByRole("article").filter({ hasText: name }).getByText("Nicht installiert")).toBeVisible();
  }
});

test("Protokoll enthält den abgelehnten und den erfolgreichen Einrichtungsversuch", async ({ page }) => {
  await page.goto("/anmelden/");
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(START);

  await page.goto("/protokoll/");
  const einrichtung = page.getByRole("row").filter({ hasText: "Einrichtung" });
  await expect(einrichtung.filter({ hasText: "Abgelehnt" })).toHaveCount(1);
  await expect(einrichtung.filter({ hasText: "Erfolg" })).toHaveCount(1);
});

test("Abmelden beendet die Sitzung wirklich", async ({ page }) => {
  await page.goto("/anmelden/");
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(START);
  await page.getByRole("button", { name: "Abmelden" }).first().click();
  await expect(page).toHaveURL(/\/anmelden\/$/);
  const antwort = await page.request.get("/api/auth/me");
  expect(antwort.status()).toBe(401);
});

test("Einstellungen mit echtem lion-core: Name der Box und Passwort ändern", async ({ page }) => {
  await page.goto("/anmelden/");
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(START);

  await page.goto("/einstellungen/");
  await page.getByLabel("Name der Box").fill("Testbox");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("banner")).toContainText("Testbox");
  await expect(page.getByText("Dieses Gerät")).toBeVisible();

  const NEU = "ein-neues-test-passwort-789";
  await page.getByLabel("Bisheriges Passwort").fill(PASSWORT);
  await page.getByLabel("Neues Passwort", { exact: true }).fill(NEU);
  await page.getByLabel("Neues Passwort wiederholen").fill(NEU);
  await page.getByRole("button", { name: "Passwort ändern" }).click();
  await expect(page.getByText(/^Passwort geändert\./)).toBeVisible();

  // Altes Passwort gilt nicht mehr, neues schon.
  await page.getByRole("button", { name: "Abmelden" }).first().click();
  await expect(page).toHaveURL(/\/anmelden\/$/);
  await page.getByLabel("Name").fill("admin");
  await page.getByLabel("Passwort").fill(PASSWORT);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Name oder Passwort falsch");
  await page.getByLabel("Passwort").fill(NEU);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(START);
});
