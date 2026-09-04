export const PUBLIC_ROUTES = ["/", "/auth/sign-in", "/auth/sign-up"];

// Prefixes that skip JWT verify + cookie sync in middleware entirely.
// Use sparingly — anything listed here MUST do its own auth check if it
// touches user data.
// "/api/csp-report" is the CSP violation sink: browsers post reports without
// credentials, and a violation can happen on the sign-in page or after a session
// expires, so it cannot sit behind the JWT verify. It does its own defending
// instead — bounded body, allowlisted fields, no DB access, no echo.
export const PUBLIC_ROUTE_PREFIXES = [
  "/api/health",
  "/api/webhooks/",
  "/api/csp-report",
];

// ROLES moved to lib/auth/roles.ts (single source of truth for roles +
// capabilities). This file intentionally keeps only the public-route config
// consumed by middleware.ts.
