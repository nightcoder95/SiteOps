// The response security headers, extracted from next.config.ts so they can be
// unit-tested. next.config.ts imports @serwist/next, which is not loadable in a
// plain node test environment; this module has no such dependency.

export type SecurityHeader = { key: string; value: string };

// Report-only CSP for now: collect violation reports without breaking anything,
// then promote to enforcing Content-Security-Policy once a full week of real
// reports (installed PWA included) comes back clean. See phase 7, S1 task 9.
//
// `'unsafe-inline'` stays in script-src deliberately. The app has ZERO inline
// scripts of its own (grepped: no <script> tags, no dangerouslySetInnerHTML);
// the only need comes from Next's own hydration payload. Removing it requires
// per-request nonces threaded through middleware, which is incompatible with the
// statically prerendered auth routes. The honest trade is to take the win on
// every other directive rather than ship a nonce scheme that breaks static
// rendering — recorded here so the next reader knows it was a decision.
export function buildContentSecurityPolicy(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "";

  return [
    "default-src 'self'",
    `connect-src 'self' ${supabaseUrl} ${posthogHost} https://*.upstash.io wss://${supabaseUrl.replace(/^https?:\/\//, "")}`.trim(),
    // 'unsafe-eval' dropped: nothing in this stack needs it in a production
    // build — Serwist/Workbox and posthog-js are both eval-free, and Next's dev
    // overlay never ships. Watch the reports for `eval` before enforcing.
    "script-src 'self' 'unsafe-inline'",
    // Google Fonts removed in phase 6: Inter now comes through next/font/google,
    // which self-hosts at build time, so no external font origin is reachable.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Free, and blocks a whole class of legacy plugin injection.
    "object-src 'none'",
    // The service worker is same-origin; nothing else may register one.
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Both channels: report-to is the modern Reporting API (paired with the
    // Reporting-Endpoints header below), report-uri the deprecated fallback
    // that Safari and older Chrome still rely on. Without one of these,
    // report-only mode is invisible outside each user's own devtools console.
    "report-to csp-endpoint",
    "report-uri /api/csp-report",
  ].join("; ");
}

export function buildSecurityHeaders(): SecurityHeader[] {
  return [
    // Prevent clickjacking by disallowing the page from being embedded in a frame.
    { key: "X-Frame-Options", value: "DENY" },
    // Prevent MIME type sniffing, which can lead to XSS in older browsers.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Only send the origin as the referrer for cross-origin requests.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Restrict access to sensitive browser features that this app doesn't need.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    // Downgrade protection. Vercel sets this on *.vercel.app automatically, but
    // custom domains need it explicitly, or a first visit over http:// can be
    // stripped. Two years, per the usual guidance. `preload` is deliberately
    // omitted: submitting to the browser preload list is effectively
    // irreversible and removal takes months.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    // Names the group that the CSP's `report-to` directive points at.
    { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
    // Report-only mode; flip the header name to `Content-Security-Policy` once
    // violations are clean.
    { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicy() },
  ];
}
