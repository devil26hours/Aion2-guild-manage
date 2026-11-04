import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    // Static map package (public/map-data/v1): tiles/icons/portraits never change under a given file name; the JSON is revalidated.
    return [
      { source: "/map-data/v1/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/map-data/v1/:path((?!assets/).*)", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    ];
  },
  async redirects() {
    return [
      // The API Lab moved into the DEV menu.
      { source: "/api-lab", destination: "/dev/api-lab", permanent: false },
      { source: "/dev", destination: "/dev/overview", permanent: false },
    ];
  },
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
