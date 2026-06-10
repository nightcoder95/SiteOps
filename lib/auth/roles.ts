// Single source of truth for application roles.
//
// Roles are mapped to capabilities in lib/auth/capabilities.ts. All guards and
// ownership checks consult capabilities — never role-string literals — so the
// set of roles can grow without a cross-codebase rewrite.
//
// ── How to add a new role (e.g. "Viewer") ──────────────────────────────────
//   1. Add it to the `user_role` pgEnum in lib/db/schema.ts and ship an enum
//      migration:  ALTER TYPE user_role ADD VALUE 'Viewer';
//   2. Add the literal to ROLES below.
//   3. Add a ROLE_CAPABILITIES entry for it in lib/auth/capabilities.ts.
// No route handlers, guards, or UI need editing — they all go through can().

export const ROLES = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as readonly string[]).includes(value);
}
