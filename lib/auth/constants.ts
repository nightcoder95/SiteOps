export const PUBLIC_ROUTES = ["/", "/auth/sign-in", "/auth/sign-up"];

// Prefixes that skip JWT verify + cookie sync in middleware entirely.
// Use sparingly — anything listed here MUST do its own auth check if it
// touches user data.
export const PUBLIC_ROUTE_PREFIXES = ["/api/health", "/api/webhooks/"];

export const ROLES = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
} as const;
