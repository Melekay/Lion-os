import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reiner statischer Export: Caddy liefert die Dateien aus, Daten kommen nur über /api (lion-core).
  output: "export",
  // /apps → /apps/index.html: funktioniert mit jedem Dateiserver ohne Umschreibregeln.
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
