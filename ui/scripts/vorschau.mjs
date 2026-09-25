#!/usr/bin/env node
// Vorschau des statischen Exports (out/) mit Weiterleitung von /api an lion-core – wie Caddy im Betrieb.
// Nur für Entwicklung und Tests. Aufruf: npm run build && LION_API=http://127.0.0.1:8080 npm run vorschau
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 3200);
const API = new URL(process.env.LION_API ?? "http://127.0.0.1:8080");
const WURZEL = resolve(fileURLToPath(new URL("../out", import.meta.url)));

const TYPEN = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function datei(pfad) {
  try {
    const s = await stat(pfad);
    return s.isFile() ? pfad : s.isDirectory() ? datei(join(pfad, "index.html")) : null;
  } catch {
    return null;
  }
}

function senden(res, status, pfad) {
  res.writeHead(status, { "content-type": TYPEN[extname(pfad)] ?? "application/octet-stream" });
  createReadStream(pfad).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://vorschau");

  if (url.pathname.startsWith("/api/")) {
    const weiter = http.request(
      { hostname: API.hostname, port: API.port, path: req.url, method: req.method, headers: { ...req.headers, host: API.host } },
      (antwort) => {
        res.writeHead(antwort.statusCode ?? 502, antwort.headers);
        antwort.pipe(res);
      },
    );
    weiter.on("error", () => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ fehler: "lion-core nicht erreichbar." }));
    });
    req.pipe(weiter);
    return;
  }

  // Pfad bereinigen und im out/-Ordner halten.
  const ziel = resolve(WURZEL, "." + normalize(decodeURIComponent(url.pathname)));
  if (!ziel.startsWith(WURZEL)) {
    res.writeHead(400).end();
    return;
  }
  // Wie Caddys file_server: Ordner ohne Schrägstrich → Umleitung auf die kanonische Adresse.
  if (!url.pathname.endsWith("/") && !extname(url.pathname) && (await datei(join(ziel, "index.html")))) {
    res.writeHead(308, { location: `${url.pathname}/${url.search}` }).end();
    return;
  }
  const gefunden = await datei(ziel);
  if (gefunden) return senden(res, 200, gefunden);
  const nichtGefunden = await datei(join(WURZEL, "404.html"));
  if (nichtGefunden) return senden(res, 404, nichtGefunden);
  res.writeHead(404).end("Nicht gefunden");
});

server.listen(PORT, () => console.log(`Vorschau: http://localhost:${PORT} (API → ${API.origin})`));
