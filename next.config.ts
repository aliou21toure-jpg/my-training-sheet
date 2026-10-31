import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // ExcelJS is a Node library: load it with require() on the server, don't bundle it.
  serverExternalPackages: ["exceljs"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
