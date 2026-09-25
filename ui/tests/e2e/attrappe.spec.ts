import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { Attrappe } from "./attrappe";

/** Startseite (Übersicht) – nicht /anmelden/ oder /einrichtung/. */
const START = /^http:\/\/localhost:\d+\/$/;

/** Keine schweren Barrierefreiheits-Fehler (WCAG 2.2 AA). */
async function barrierefrei(page: Page) {
  // Erst prüfen, wenn Einblend- und Farbübergänge fertig sind – sonst misst axe halb durchsichtigen Text.
  // Endlose Animationen (pulsierender Statuspunkt) werden ausgenommen.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
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
    await expect(bild).toHaveAttribute("aria-label", /^Netzwerk-Verlauf\. Empfangen [\d,]+ kB\/s, gesendet [\d,]+ kB\/s\.$/);
    const label = (await bild.getAttribute("aria-label")) ?? "";
    // Deutsche Zahlen („7,9“). Die echte Zeit zwischen zwei Abfragen schwankt leicht – deshalb Bereich statt exakter Wert.
    const [runter, hoch] = [...label.matchAll(/([\d,]+) kB/g)].map((m) => Number(m[1]!.replace(",", ".")));
    expect(runter).toBeGreaterThan(20);
    expect(runter).toBeLessThanOrEqual(50);
    expect((runter ?? 0) / (hoch ?? 1)).toBeGreaterThan(5.5);
    expect((runter ?? 0) / (hoch ?? 1)).toBeLessThan(7);
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

  test("laufende Apps zeigen Live-Werte in der Kachel, gestoppte nicht", async ({ page }) => {
    api.app("jellyfin").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8102"], datenordner: "/srv/lion/apps/jellyfin" };
    api.app("uptime-kuma").installiert = { status: "gestoppt", meldung: null, adressen: ["https://localhost:8101"], datenordner: "/srv/lion/apps/uptime-kuma" };
    api.ressourcen = { jellyfin: { cpuProzent: 3.4, ramMb: 1536 }, "uptime-kuma": { cpuProzent: 1, ramMb: 99 } };
    await page.goto("/");
    const kachel = page.getByRole("link", { name: /^Jellyfin \(1,5 GB Arbeitsspeicher, 3,4 % CPU\)/ });
    await expect(kachel).toBeVisible();
    await expect(kachel).toContainText("1,5 GB");
    await expect(kachel).toContainText("3,4 %");
    await expect(page.getByRole("link", { name: /^Uptime Kuma – Gestoppt/ })).not.toContainText("99 MB");
    await barrierefrei(page);

    await page.goto("/apps/");
    await expect(page.getByRole("article").filter({ hasText: "Jellyfin" })).toContainText("Gerade: 1,5 GB Arbeitsspeicher · 3,4 % CPU");
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

  test("Kategorie-Filter zeigt nur passende Apps; „Installiert“ erscheint erst mit installierten Apps", async ({ page }) => {
    api.app("jellyfin").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8102"], datenordner: "/srv/lion/apps/jellyfin" };
    await page.goto("/apps/");
    const filter = page.getByRole("group", { name: "Nach Kategorie filtern" });
    await expect(filter.getByRole("button", { name: "Alle (4)" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article")).toHaveCount(4);

    await filter.getByRole("button", { name: "Medien" }).click();
    await expect(filter.getByRole("button", { name: "Medien" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Jellyfin");

    await filter.getByRole("button", { name: "Installiert (1)" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await barrierefrei(page);

    await filter.getByRole("button", { name: /^Alle/ }).click();
    await expect(page.getByRole("article")).toHaveCount(4);
  });

  test("Apps mit Logo zeigen das Original-Logo, andere ein eigenes Symbol", async ({ page }) => {
    await page.goto("/apps/");
    const logo = page.getByRole("article").filter({ hasText: "Jellyfin" }).locator("img");
    await expect(logo).toHaveAttribute("src", "/api/apps/jellyfin/logo");
    await expect(logo).toHaveAttribute("alt", "");
    await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("article").filter({ hasText: "Uptime Kuma" }).locator("img")).toHaveCount(0);
  });

  test("Medien-Apps zeigen ihren Zugriff auf den Medienordner", async ({ page }) => {
    await page.goto("/apps/");
    await expect(page.getByRole("article").filter({ hasText: "Jellyfin" })).toContainText("Liest den Medienordner (nur lesen)");
    await expect(page.getByRole("article").filter({ hasText: "Dateimanager" })).toContainText("Verwaltet den Medienordner");
    await expect(page.getByRole("article").filter({ hasText: "Uptime Kuma" })).not.toContainText("Medienordner");
  });

  test("Protokoll-Dialog zeigt das Start-Passwort aus dem App-Protokoll", async ({ page }) => {
    api.app("filebrowser").installiert = { status: "laeuft", meldung: null, adressen: ["https://localhost:8101"], datenordner: "/srv/lion/apps/filebrowser" };
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Dateimanager" });
    await karte.getByRole("button", { name: "Protokoll" }).click();

    const dialog = page.getByRole("dialog", { name: "Protokoll: Dateien" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("log")).toContainText("randomly generated password: Xy7-geheim");
    await barrierefrei(page);

    api.appProtokolle.filebrowser = [];
    await dialog.getByRole("button", { name: "Aktualisieren" }).click();
    await expect(dialog.getByRole("log")).toContainText("Noch keine Einträge.");

    await dialog.getByRole("button", { name: "Schließen" }).click();
    await expect(dialog).toBeHidden();
    expect(api.anfragen.filter((a) => a.pfad === "/api/apps/filebrowser/protokoll" && a.methode === "GET")).toHaveLength(2);
  });

  test("nicht installierte Apps haben keinen Protokoll-Knopf", async ({ page }) => {
    await page.goto("/apps/");
    await expect(page.getByRole("article").filter({ hasText: "Jellyfin" }).getByRole("button", { name: "Protokoll" })).toHaveCount(0);
  });

  test("RAM-Warnung: gelb bei knappem, rot bei zu wenig Speicher; Installation erst nach Bestätigung", async ({ page }) => {
    api.system = { ...api.system, ramGesamtMb: 8192, ramFreiMb: 2048 };
    api.app("jellyfin").ramMinMb = 4096;
    api.app("filebrowser").ramMinMb = 16384;
    api.app("uptime-kuma").ramMinMb = 256;
    await page.goto("/apps/");

    const knapp = page.getByRole("article").filter({ hasText: "Jellyfin" });
    await expect(knapp.getByRole("note")).toContainText("Arbeitsspeicher knapp");
    await expect(knapp.getByRole("note")).toContainText("frei sind gerade 2 GB");
    await expect(knapp).toContainText("Empfohlen: ab 4 GB freier Arbeitsspeicher");

    const zuWenig = page.getByRole("article").filter({ hasText: "Dateimanager" });
    await expect(zuWenig.getByRole("note")).toContainText("Zu wenig Arbeitsspeicher");
    await expect(page.getByRole("article").filter({ hasText: "Uptime Kuma" }).getByRole("note")).toHaveCount(0);
    await barrierefrei(page);

    // Erster Klick fragt nur nach, Abbrechen sendet nichts.
    await knapp.getByRole("button", { name: "Installieren" }).click();
    await expect(knapp.getByRole("group", { name: "Installation trotz Warnung bestätigen" })).toBeVisible();
    await knapp.getByRole("button", { name: "Abbrechen" }).click();
    expect(api.anfragen.some((a) => a.pfad === "/api/apps/jellyfin/installieren")).toBe(false);

    await knapp.getByRole("button", { name: "Installieren" }).click();
    await knapp.getByRole("button", { name: "Trotzdem installieren" }).click();
    await expect(knapp.getByText("Läuft", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(knapp.getByRole("note")).toHaveCount(0);
  });

  test("ohne Warnung installiert ein Klick sofort", async ({ page }) => {
    api.app("uptime-kuma").ramMinMb = 256;
    await page.goto("/apps/");
    const karte = page.getByRole("article").filter({ hasText: "Uptime Kuma" });
    await karte.getByRole("button", { name: "Installieren" }).click();
    await expect(karte.getByText("Wird installiert …")).toBeVisible();
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

test.describe("Einstellungen", () => {
  test("Kachel führt hin; Seite zeigt Version, Adressen und Geräte", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Einstellungen", exact: true }).click();
    await expect(page).toHaveURL(/\/einstellungen\/$/);
    await expect(page.getByRole("heading", { name: "Einstellungen", level: 1 })).toBeVisible();
    await expect(page.getByText("0.1.0-dev")).toBeVisible();
    await expect(page.getByRole("link", { name: /https:\/\/192\.168\.1\.20/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /https:\/\/localhost/ })).toHaveCount(0);
    const geraete = page.getByRole("region").filter({ hasText: "Angemeldete Geräte" });
    await expect(geraete.getByText("Firefox auf Windows")).toBeVisible();
    await expect(geraete.getByText("Safari auf iPhone")).toBeVisible();
    await expect(geraete.getByText("Dieses Gerät")).toHaveCount(1);
    await expect(geraete.getByText("Anmeldezeit unbekannt")).toBeVisible();
    await barrierefrei(page);
  });

  test("Hintergrund wählen: sofort sichtbar und nach dem Neuladen noch da", async ({ page }) => {
    await page.goto("/einstellungen/");
    const wahl = page.getByRole("group", { name: "Hintergrund wählen" });
    await expect(wahl.getByRole("button", { name: "Sonnenuntergang" })).toHaveAttribute("aria-pressed", "true");
    await wahl.getByRole("button", { name: "Ozean" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-hintergrund", "ozean");
    await expect(wahl.getByRole("button", { name: "Ozean" })).toHaveAttribute("aria-pressed", "true");
    await barrierefrei(page);

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hintergrund", "ozean");
  });

  test("Name der Box speichern: erscheint in der Kopfzeile; Fehler werden angezeigt", async ({ page }) => {
    await page.goto("/einstellungen/");
    const feld = page.getByLabel("Name der Box");
    await expect(feld).toHaveValue("Lion OS");
    await feld.fill("<b>");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Erlaubt sind Buchstaben")).toBeVisible();
    await feld.fill("Wohnzimmer");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Name gespeichert.")).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Wohnzimmer");
    expect(api.boxName).toBe("Wohnzimmer");
  });

  test("Passwort ändern: prüft Eingaben, zeigt Fehler vom Server und meldet andere Geräte ab", async ({ page }) => {
    await page.goto("/einstellungen/");
    const knopf = page.getByRole("button", { name: "Passwort ändern" });
    await page.getByLabel("Neues Passwort", { exact: true }).fill("kurz");
    await page.getByLabel("Neues Passwort wiederholen").fill("anders");
    await knopf.click();
    await expect(page.getByText("Bitte das bisherige Passwort eingeben.")).toBeVisible();
    await expect(page.getByText("Mindestens 12 Zeichen.", { exact: true })).toBeVisible();
    expect(api.anfragen.some((a) => a.pfad === "/api/auth/passwort")).toBe(false);

    await page.getByLabel("Bisheriges Passwort").fill("falsch-falsch-falsch");
    await page.getByLabel("Neues Passwort", { exact: true }).fill("ein-neues-langes-passwort");
    await page.getByLabel("Neues Passwort wiederholen").fill("ein-neues-langes-passwort");
    await knopf.click();
    await expect(page.getByText("Das bisherige Passwort stimmt nicht.")).toBeVisible();

    await page.getByLabel("Bisheriges Passwort").fill("richtiges-passwort");
    await knopf.click();
    await expect(page.getByText("Passwort geändert. 2 andere Geräte wurden abgemeldet.")).toBeVisible();
    await expect(page.getByLabel("Bisheriges Passwort")).toHaveValue("");
    await expect(page.getByText("Safari auf iPhone")).toHaveCount(0);
    expect(api.passwort).toBe("ein-neues-langes-passwort");
  });

  test("einzelnes Gerät und alle anderen abmelden", async ({ page }) => {
    await page.goto("/einstellungen/");
    await page.getByRole("button", { name: "Safari auf iPhone abmelden" }).click();
    await expect(page.getByText("Safari auf iPhone")).toHaveCount(0);
    expect(api.anfragen.find((a) => a.pfad === "/api/auth/sitzungen/abmelden")?.body).toEqual({ id: 2 });

    const alle = page.getByRole("button", { name: "Alle anderen Geräte abmelden" });
    await alle.click();
    await expect(page.getByText("Unbekanntes Gerät", { exact: true })).toHaveCount(0);
    await expect(alle).toBeDisabled();
    expect(api.anfragen.filter((a) => a.pfad === "/api/auth/sitzungen/abmelden").at(-1)?.body).toEqual({});
  });
});

test.describe("Backup", () => {
  test("Kachel zeigt den Zustand; Einrichten zeigt den Schlüssel genau einmal und verlangt Bestätigung", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Backup – Nicht eingerichtet" }).click();
    await expect(page).toHaveURL(/\/backup\/$/);
    await barrierefrei(page);

    await page.getByLabel("Ordner auf der Backup-Festplatte").fill("/etc");
    await page.getByRole("button", { name: "Backup einrichten" }).click();
    await expect(page.getByText("nur in Unterordnern von /mnt")).toBeVisible();

    await page.getByLabel("Ordner auf der Backup-Festplatte").fill("/mnt/usb-backup");
    await page.getByLabel("Tägliche Uhrzeit").fill("02:30");
    await page.getByRole("button", { name: "Backup einrichten" }).click();
    await expect(page.getByRole("heading", { name: "Dein Wiederherstellungsschlüssel" })).toBeVisible();
    await expect(page.getByLabel("Schlüssel", { exact: true })).toHaveText("ABCD-EFGH-JKLM-NPQR-STUV-WXYZ");
    await barrierefrei(page);
    const weiter = page.getByRole("button", { name: "Weiter" });
    await expect(weiter).toBeDisabled();
    await page.getByLabel(/sicher notiert/).check();
    await weiter.click();

    await expect(page.getByText("Noch kein Backup")).toBeVisible();
    await expect(page.getByText("/mnt/usb-backup")).toBeVisible();
    expect(api.anfragen.filter((a) => a.pfad === "/api/backup/einrichten").at(-1)?.body).toEqual({ ziel: "/mnt/usb-backup", zeit: "02:30" });
  });

  test("Jetzt sichern: läuft, dann gesichert und in der Liste", async ({ page }) => {
    api.backup = { ...api.backup, eingerichtet: true, ziel: "/mnt/usb" };
    await page.goto("/backup/");
    await page.getByRole("button", { name: "Jetzt sichern" }).click();
    await expect(page.getByText("Sicherung läuft …")).toBeVisible();
    await expect(page.getByText("Gesichert", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("12,4 MB neu")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sicherung vom .* wiederherstellen/ })).toBeVisible();
    expect(api.anfragen.find((a) => a.pfad === "/api/backup/jetzt")?.csrf).toBe("1");
  });

  test("Wiederherstellen verlangt App-Auswahl und Eintippen der ID; nichts wird gelöscht", async ({ page }) => {
    api.backup = { ...api.backup, eingerichtet: true, ziel: "/mnt/usb" };
    api.sicherungenListe = [{ id: "abcdef12".padEnd(64, "0"), kurz: "abcdef12", zeit: "2026-09-25T03:00:00.000Z", pfade: ["/daten"] }];
    await page.goto("/backup/");
    await page.getByRole("button", { name: /Sicherung vom .* wiederherstellen/ }).click();
    const dialog = page.getByRole("dialog");
    const los = dialog.getByRole("button", { name: "Wiederherstellen" });
    await expect(los).toBeDisabled();
    await dialog.getByLabel("Welche App?").selectOption("uptime-kuma");
    await expect(dialog).toContainText("Nichts wird gelöscht");
    await expect(dialog).toContainText("/srv/lion/apps/.uptime-kuma.vor-wiederherstellung-");
    await dialog.getByLabel(/Zur Bestätigung/).fill("uptime");
    await expect(los).toBeDisabled();
    await dialog.getByLabel(/Zur Bestätigung/).fill("uptime-kuma");
    await barrierefrei(page);
    await los.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("uptime-kuma wiederhergestellt")).toBeVisible({ timeout: 15_000 });
    expect(api.anfragen.find((a) => a.pfad === "/api/backup/wiederherstellen")?.body).toEqual({ sicherung: "abcdef12", app: "uptime-kuma", bestaetigung: "uptime-kuma" });
  });

  test("Schlüssel nur mit richtigem Passwort; Zeitplan speichern", async ({ page }) => {
    api.backup = { ...api.backup, eingerichtet: true, ziel: "/mnt/usb" };
    await page.goto("/backup/");
    await page.getByLabel("Dein Passwort").fill("falsch-falsch");
    await page.getByRole("button", { name: "Schlüssel anzeigen" }).click();
    await expect(page.getByText("Das Passwort stimmt nicht.")).toBeVisible();
    await page.getByLabel("Dein Passwort").fill("richtiges-passwort");
    await page.getByRole("button", { name: "Schlüssel anzeigen" }).click();
    await expect(page.getByLabel("Schlüssel", { exact: true })).toHaveText("ABCD-EFGH-JKLM-NPQR-STUV-WXYZ");

    await page.getByLabel("Täglich automatisch sichern").uncheck();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Zeitplan gespeichert.")).toBeVisible();
    expect(api.backup.aktiv).toBe(false);
    // Die Meldung bleibt stehen, auch nachdem der Status neu geladen wurde.
    await expect.poll(() => api.anfragen.filter((a) => a.pfad === "/api/backup").length).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("Zeitplan gespeichert.")).toBeVisible();
    await expect(page.getByLabel("Täglich automatisch sichern")).not.toBeChecked();
  });
});
