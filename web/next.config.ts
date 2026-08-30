import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp måste externa:as så libvips-native hittas i Vercel serverless
  serverExternalPackages: ["ocad2geojson", "sharp"],
  outputFileTracingIncludes: {
    "/api/maps/[slug]/versions/[id]/tiles/**": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
      "./node_modules/sharp/**",
    ],
    "/api/maps/[slug]/versions/[id]/export-geotiff": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
      "./node_modules/sharp/**",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // OCAD-filer kan vara 20+ MB — default 10 MB räcker inte
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
