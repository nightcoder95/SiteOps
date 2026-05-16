import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";

// Report-only CSP for now: collect violation reports without breaking anything,
// then promote to enforcing Content-Security-Policy in a follow-up.
const cspReportOnly = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseUrl} ${posthogHost} https://*.upstash.io wss://${supabaseUrl.replace(/^https?:\/\//, "")}`.trim(),
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  // Prevent clickjacking by disallowing the page from being embedded in a frame.
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME type sniffing, which can lead to XSS in older browsers.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send the origin as the referrer for cross-origin requests.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict access to sensitive browser features that this app doesn't need.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Report-only mode; flip the header name to `Content-Security-Policy` once
  // violations are clean.
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  // `pg` and related packages must stay external to avoid bundling native bindings.
  serverExternalPackages: ["pg", "pg-pool", "pg-native", "pg-connection-string"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Hash-busted bundles — safe to cache forever.
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
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
