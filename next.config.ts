import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const securityHeaders = [
  // Prevent clickjacking by disallowing the page from being embedded in a frame.
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME type sniffing, which can lead to XSS in older browsers.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin as the referrer for cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict access to sensitive browser features that this app doesn't need.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // `better-auth` removed — it's not a dependency of this project.
  // `pg` and related packages must stay external to avoid bundling native bindings.
  serverExternalPackages: ["pg", "pg-pool", "pg-native", "pg-connection-string"],
  async headers() {
    return [
      {
        // Apply security headers to every route.
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

const withPWA = withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withPWA(nextConfig);

