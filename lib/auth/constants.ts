export const PUBLIC_ROUTES = ["/", "/auth/sign-in", "/auth/sign-up"];

// Prefixes that skip JWT verify + cookie sync in middleware entirely.
// Use sparingly — anything listed here MUST do its own auth check if it
// touches user data.
export const PUBLIC_ROUTE_PREFIXES = ["/api/health", "/api/webhooks/"];

// ROLES moved to lib/auth/roles.ts (single source of truth for roles +
// capabilities). This file intentionally keeps only the public-route config
// consumed by middleware.ts.
