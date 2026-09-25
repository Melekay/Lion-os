import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Baut die Demo als EINE HTML-Datei (Skripte, Stile und Schriften eingebettet).
 * Aufruf aus ui/: npm run demo:build → demo/dist/index.html
 */
type LionAppYaml = {
  id: string;
  name: string;
  beschreibung: string;
  kategorie: string;
  version: string;
  sicherheitsstufe: string;
  hinweise?: string[];
  medien?: "keine" | "lesen" | "schreiben";
  ressourcen?: { ram_min_mb?: number };
};

const hier = dirname(fileURLToPath(import.meta.url));
const ui = resolve(hier, "..");
const APPS = resolve(ui, "../apps");

function logoDaten(id: string): string | null {
  try {
    return `data:image/svg+xml;base64,${readFileSync(join(APPS, id, "logo.svg")).toString("base64")}`;
  } catch {
    return null;
  }
}

/** App-Katalog aus apps/<id>/lion-app.yaml – dieselben Vorlagen wie im echten Lion OS. */
function katalog(): Plugin {
  const ID = "virtual:lion-katalog";
  return {
    name: "lion-katalog",
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    load(id) {
      if (id !== `\0${ID}`) return;
      // yaml kommt aus lion-core (dort ohnehin Abhängigkeit), damit die UI kein weiteres Paket braucht.
      const { parse } = createRequire(join(ui, "../core/package.json"))("yaml") as { parse: (text: string) => LionAppYaml };
      const eintraege = readdirSync(APPS, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => parse(readFileSync(join(APPS, e.name, "lion-app.yaml"), "utf8")))
        .map((m) => ({
          id: m.id,
          name: m.name,
          beschreibung: m.beschreibung,
          kategorie: m.kategorie,
          version: m.version,
          sicherheitsstufe: m.sicherheitsstufe,
          hinweise: m.hinweise ?? [],
          medien: m.medien ?? "keine",
          ramMinMb: m.ressourcen?.ram_min_mb ?? 0,
          // In der Demo als data:-Adresse eingebettet – im echten Lion OS liefert lion-core das geprüfte Logo aus.
          logo: logoDaten(m.id),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return `export default ${JSON.stringify(eintraege)};`;
    },
  };
}

/** Bettet das gebaute JS und CSS direkt in index.html ein. */
function eineDatei(): Plugin {
  return {
    name: "eine-datei",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((d) => d.fileName === "index.html");
      if (!html || html.type !== "asset") return;
      let text = String(html.source);
      for (const [name, datei] of Object.entries(bundle)) {
        if (datei.type === "chunk" && datei.isEntry) {
          text = text.replace(new RegExp(`<script type="module" crossorigin src="[^"]*${name}"></script>`), () => `<script type="module">${datei.code.replace(/<\/script/g, "<\\/script")}</script>`);
          delete bundle[name];
        } else if (datei.type === "asset" && name.endsWith(".css")) {
          text = text.replace(new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${name}">`), () => `<style>${String(datei.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = text;
    },
  };
}

export default defineConfig({
  root: hier,
  base: "./",
  plugins: [katalog(), eineDatei()],
  resolve: {
    alias: [
      { find: /^next\/link$/, replacement: join(hier, "shims/link.tsx") },
      { find: /^next\/navigation$/, replacement: join(hier, "shims/navigation.ts") },
      { find: /^@\//, replacement: `${ui}/` },
    ],
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  css: { postcss: ui },
  build: {
    outDir: join(hier, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
