import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ocad2geojson"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // OCAD-filer kan vara 20+ MB — default 10 MB räcker inte
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
