import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { Attrappe } from "./attrappe";

/** Startseite (Übersicht) – nicht /anmelden/ oder /einrichtung/. */
const START = /^http:\/\/localhost:\d+\/$/;

/** Keine schweren Barrierefreiheits-Fehler (WCAG 2.2 AA). */
async function barrierefrei(page: Page) {
  const ergebnis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const schwer = ergebnis.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(schwer.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

let api: Attrappe;

test.beforeEach(async ({ page }) => {
  api = new Attrappe();
  await api.verbinden(page);
});

test.describe("Führung durch die Oberfläche", () => {
  test("nicht eingerichtet → Einrichtung; falscher Code zeigt Fehler, richtiger führt zur Übersicht", async ({ page }) => {
    api.eingerichtet = false;
    api.angemeldet = false;
    await page.goto("/");
    await expect(page).toHaveURL(/\/einrichtung\/$/);
    await expect(page.getByRole("heading", { name: "Willkommen bei Lion OS" })).toBeVisible();
    await barrierefrei(page);

    await page.getByLabel("Einrichtungscode").fill("falsch");
    await page.getByLabel("Passwort", { exact: true }).fill("ein-langes-passwort");
    await page.getByLabel("Passwort wiederholen").fill("ein-langes-passwort");
    await page.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Einrichtungscode falsch");

    await page.getByLabel("Einrichtungscode").fill("abcd-efgh-jklm".toUpperCase());
    await page.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(page).toHaveURL(START);
    await expect(page.getByRole("banner")).toContainText("emil");
  });

  test("Einrichtung prüft Passwort-Länge und Wiederholung, bevor etwas gesendet wird", async ({ page }) => {
    api.eingerichtet = false;
    api.angemeldet = false;
    await page.goto("/einrichtung/");
    await page.getByLabel("Einrichtungscode").fill("ABCD-EFGH-JKLM");
    await page.getByLabel("Passwort", { exact: true }).fill("kurz");
    await page.getByLabel("Passwort wiederholen").fill("anders");
    await page.getByRole("button", { name: "Konto anlegen" }).click();
    await expect(page.getByText("Mindestens 12 Zeichen.")).toBeVisible();
    await expect(page.getByText("Die Passwörter stimmen nicht überein.")).toBeVisible();
    expect(api.anfragen.some((a) => a.pfad === "/api/setup")).toBe(false);
  });

  test("nicht angemeldet → Anmeldung; falsches Passwort zeigt Fehler", async ({ page }) => {
    api.angemeldet = false;
    await page.goto("/apps/");
    await expect(page).toHaveURL(/\/anmelden\/$/);
    await barrierefrei(page);
    await page.getByLabel("Name").fill("emil");
    await page.getByLabel("Passwort").fill("falsch-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Name oder Passwort falsch");
    await expect(page.getByLabel("Passwort")).toHaveValue("");

    await page.getByLabel("Passwort").fill("richtiges-passwort");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(START);
  });

  test("abgelaufene Sitzung führt zur Anmeldung", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Alles in Ordnung")).toBeVisible();
    api.angemeldet = false;
    await page.getByRole("link", { name: "Protokoll" }).first().click();
    await expect(page).toHaveURL(/\/anmelden\/$/);
  });

  test("Abmelden", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Abmelden" }).first().click();
    await expect(page).toHaveURL(/\/anmelden\/$/);
    expect(api.anfragen.find((a) => a.pfad === "/api/auth/logout")?.csrf).toBe("1");
  });
});

test.describe("Startseite", () => {
  test("zeigt Widgets: System mit Ampel, Speicher, Laufzeit", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Alles in Ordnung")).toBeVisible();
    await expect(page.getByText("Lion OS läuft seit 3 Tagen, 5 Std.")).toBeVisible();
    await expect(page.getByRole("meter", { name: "Arbeitsspeicher belegt" })).toHaveAttribute("aria-valuenow", "25");
    await expect(page.getByRole("meter", { name: "Speicher System belegt" })).toHaveAttribute("aria-valuenow", "36");
    await expect(page.getByText("48 °C")).toBeVisible();
    await expect(page.getByText("Noch keine App installiert.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Aktivität" })).toContainText("Abgelehnt");
    await barrierefrei(page);
  });

  test("Netzwerk-Widget berechnet die Rate aus den Zählern", async ({ page }) => {
    await page.clock.install();
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Netzwerk" })).toContainText("eth0");
    // Attrappe: +250 kB empfangen und +40 kB gesendet pro Abfrage. Die genaue Rechnung prüfen die Unit-Tests;
    // hier zählt, dass aus zwei Zählerständen eine Rate im richtigen Verhältnis (250 : 40) wird.
    await page.clock.runFor(5_000);
    await page.clock.runFor(5_000);
    const bild = page.getByRole("img", { name: /Netzwerk-Verlauf/ });
    await expect(bild).toHaveAttribute("aria-label", /^Netzwerk-Verlauf\. Empfangen (25|50) kB\/s, gesendet (4|8) kB\/s\.$/);
    const label = (await bild.getAttribute("aria-label")) ?? "";
    const [runter, hoch] = [...label.matchAll(/(\d+) kB/g)].map((m) => Number(m[1]));
    expect((runter ?? 0) / (hoch ?? 1)).toBeCloseTo(6.25, 1);
  });

  test("Kacheln: laufende App öffnet sich direkt, andere führen in den App Store", async ({ page }) => {
    api.app("uptime-kuma").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8101"], datenordner: "/srv/lion/apps/uptime-kuma" };
    api.app("vaultwarden").installiert = { status: "gestoppt", meldung: null, adressen: ["https://localhost:8102"], datenordner: "/srv/lion/apps/vaultwarden" };
    await page.goto("/");
    const kuma = page.getByRole("link", { name: "Uptime Kuma öffnen (neuer Tab)" });
    await expect(kuma).toHaveAttribute("href", "https://localhost:8101");
    await expect(kuma).toHaveAttribute("target", "_blank");
    await expect(kuma).toHaveAttribute("rel", "noopener noreferrer");
    const vault = page.getByRole("link", { name: /Vaultwarden – Gestoppt/ });
    await expect(vault).toHaveAttribute("href", "/apps/#vaultwarden");
    await expect(page.getByRole("link", { name: "App Store", exact: true })).toHaveAttribute("href", "/apps/");
    await barrierefrei(page);
  });

  test("Suche filtert die Kacheln", async ({ page }) => {
    api.app("uptime-kuma").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8101"], datenordner: "/x" };
    api.app("vaultwarden").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8102"], datenordner: "/y" };
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Vaultwarden/ })).toBeVisible();
    await page.getByRole("searchbox", { name: "Apps suchen" }).fill("kuma");
    await expect(page.getByRole("link", { name: /Uptime Kuma/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Vaultwarden/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "App Store", exact: true })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Apps suchen" }).fill("gibtsnicht");
    await expect(page.getByText("Keine App gefunden für „gibtsnicht“.")).toBeVisible();
  });

  test("„+“ führt in den App Store", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "App hinzufügen" }).click();
    await expect(page).toHaveURL(/\/apps\/$/);
    await expect(page.getByRole("heading", { name: "App Store" })).toBeVisible();
  });

  test("zeigt Hinweise von lion-core bei gelber/roter Ampel", async ({ page }) => {
    api.system = {
      ...api.system,
      speicher: [{ pfad: "/", gesamtGb: 100, freiGb: 5 }],
      ampel: "rot",
      hinweise: [{ bereich: "speicher", stufe: "rot", text: "Speicher / ist zu 95 % voll. Bitte Platz schaffen, sonst drohen Ausfälle." }],
    };
    await page.goto("/");
    await expect(page.getByText("Handlungsbedarf")).toBeVisible();
    await expect(page.getByText("Speicher / ist zu 95 % voll.")).toBeVisible();
    await expect(page.getByRole("meter", { name: "Speicher System belegt" })).toHaveAttribute("aria-valuenow", "95");
    await expect(page.getByRole("region", { name: "Speicher" })).toContainText("Fast voll");
  });
});

test.describe("Apps", () => {
  test("installieren: Status wechselt von „Wird installiert“ zu „Läuft“, dann gibt es „Öffnen“", async ({ page }) => {
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await expect(karte.getByText("Nicht installiert")).toBeVisible();
    await barrierefrei(page);

    await karte.getByRole("button", { name: "Installieren" }).click();
    await expect(karte.getByText("Wird installiert …")).toBeVisible();
    await expect(karte.getByText("Läuft", { exact: true })).toBeVisible({ timeout: 15_000 });

    const oeffnen = karte.getByRole("link", { name: /Öffnen/ });
    await expect(oeffnen).toHaveAttribute("href", "https://localhost:8101");
    await expect(oeffnen).toHaveAttribute("rel", "noopener noreferrer");
    await expect(karte.getByText("/srv/lion/apps/uptime-kuma").first()).toBeVisible();

    const post = api.anfragen.find((a) => a.pfad === "/api/apps/uptime-kuma/installieren");
    expect(post?.csrf).toBe("1");
  });

  test("entfernen verlangt das Eintippen der App-ID und behält die Daten", async ({ page }) => {
    api.app("uptime-kuma").installiert = {
      status: "laeuft",
      meldung: null,
      adressen: ["https://localhost:8101"],
      datenordner: "/srv/lion/apps/uptime-kuma",
    };
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await karte.getByRole("button", { name: "Entfernen" }).click();

    const dialog = page.getByRole("dialog", { name: "Uptime Kuma entfernen?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Deine Daten bleiben erhalten");
    const bestaetigen = dialog.getByRole("button", { name: "Endgültig entfernen" });
    await expect(bestaetigen).toBeDisabled();
    await dialog.getByLabel(/Zur Bestätigung/).fill("uptime");
    await expect(bestaetigen).toBeDisabled();
    await dialog.getByLabel(/Zur Bestätigung/).fill("uptime-kuma");
    await barrierefrei(page);
    await bestaetigen.click();

    await expect(dialog).toBeHidden();
    await expect(karte.getByText("Nicht installiert")).toBeVisible({ timeout: 15_000 });
    expect(api.anfragen.find((a) => a.pfad === "/api/apps/uptime-kuma/entfernen")?.body).toEqual({ bestaetigung: "uptime-kuma" });
  });

  test("Abbrechen im Dialog sendet nichts", async ({ page }) => {
    api.app("uptime-kuma").installiert = { status: "gestoppt", meldung: null, adressen: [], datenordner: "/srv/lion/apps/uptime-kuma" };
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await karte.getByRole("button", { name: "Entfernen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(api.anfragen.some((a) => a.pfad.endsWith("/entfernen"))).toBe(false);
  });

  test("Fehlermeldungen von lion-core werden angezeigt", async ({ page }) => {
    api.fehlerBeiAktion = "Für diese App läuft bereits eine Aktion.";
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await karte.getByRole("button", { name: "Installieren" }).click();
    await expect(karte.getByRole("alert")).toContainText("Für diese App läuft bereits eine Aktion.");
  });

  test("fehlgeschlagene Installation zeigt die Meldung und bietet Starten/Entfernen an", async ({ page }) => {
    api.app("uptime-kuma").installiert = {
      status: "fehler",
      meldung: "Image konnte nicht geladen werden",
      adressen: [],
      datenordner: "/srv/lion/apps/uptime-kuma",
    };
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await expect(karte.getByText("Image konnte nicht geladen werden")).toBeVisible();
    await expect(karte.getByRole("button", { name: "Starten" })).toBeVisible();
    await expect(karte.getByRole("button", { name: "Entfernen" })).toBeVisible();
  });

  test("sensible Apps sind gekennzeichnet", async ({ page }) => {
    await page.goto("/apps/");
    await expect(page.getByRole("article").filter({ hasText: "Vaultwarden" })).toContainText("Sensible Daten");
  });
});

test("Protokoll zeigt Einträge mit Ergebnis", async ({ page }) => {
  await page.goto("/protokoll/");
  await expect(page.getByRole("cell", { name: /Anmeldung/ }).first()).toBeVisible();
  await expect(page.getByText("Abgelehnt", { exact: true })).toBeVisible();
  await expect(page.getByText("ip=192.168.1.9")).toBeVisible();
  await barrierefrei(page);
});

test("unbekannte Seite zeigt 404 mit Weg zurück", async ({ page }) => {
  const antwort = await page.goto("/gibt-es-nicht/");
  expect(antwort?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
});
