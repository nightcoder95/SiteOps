import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

import { buildSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // `pg` and related packages must stay external to avoid bundling native bindings.
  serverExternalPackages: ["pg", "pg-pool", "pg-native", "pg-connection-string"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(),
      },
      {
        // `/_next/static` already gets `public, max-age=31536000, immutable`
        // automatically in production builds; a custom Cache-Control here is
        // redundant and breaks dev HMR, so it's intentionally omitted.
        source: "/icons/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [390, 768, 1024, 1280],
    minimumCacheTTL: 86400,
  },
};

const withPWA = withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withPWA(nextConfig);
