import { describe, expect, it } from "vitest";
import { geraetText, istMobil } from "@/lib/geraet";

describe("geraetText", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0", "Firefox auf Windows"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36", "Chrome auf Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari auf iPhone"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0", "Edge auf Mac"],
    ["curl/8.5.0", "curl"],
    ["irgendwas", "Unbekanntes Gerät"],
  ])("%s → %s", (ua, erwartet) => {
    expect(geraetText(ua)).toBe(erwartet);
  });

  it("ohne Angabe", () => {
    expect(geraetText(null)).toBe("Unbekanntes Gerät");
  });

  it("erkennt Handys", () => {
    expect(istMobil("Mozilla/5.0 (Linux; Android 14) Mobile")).toBe(true);
    expect(istMobil("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
    expect(istMobil(null)).toBe(false);
  });
});
