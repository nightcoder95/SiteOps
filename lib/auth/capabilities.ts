import { ROLES, type Role } from "@/lib/auth/roles";

// Capabilities are `resource:action` strings. Guards and ownership checks
// authorize against these, never against role literals — so adding a role or
// re-scoping an action is a single edit here, not a codebase-wide change.
//
// Own-scope actions (entries, transfers, own requests) are enforced at the data
// layer via checkOwnership() + the `resource:manage_all` cross-owner override.
export type Capability =
  | "site:read"
  | "site:read_all"
  | "site:create"
  | "site:update"
  | "site:delete"
  | "entry:create"
  | "entry:read"
  | "entry:update"
  | "entry:delete"
  | "catalog:read"
  | "catalog:create"
  | "form_category:read"
  | "form_category:create"
  | "form_category:delete"
  | "form_subcategory:read"
  | "form_subcategory:create"
  | "form_subcategory:update"
  | "form_subcategory:delete"
  | "field_request:create"
  | "field_request:read"
  | "field_request:approve"
  | "field_request:delete"
  | "resource_request:create"
  | "resource_request:read"
  | "resource_request:approve"
  | "transfer:create"
  | "transfer:read"
  | "transfer:approve"
  | "dashboard:read"
  | "analytics:read"
  | "live_feed:read"
  | "notification:read"
  | "notification:update"
  | "profile:read_self"
  | "profile:update_self"
  | "user:list"
  | "user:create"
  | "user:manage_roles"
  | "resource:manage_all"
  | "data:export";

// Capabilities shared by every authenticated role. Supervisor === this set.
const SUPERVISOR_CAPABILITIES: readonly Capability[] = [
  "site:read",
  "entry:create",
  "entry:read",
  "entry:update",
  "entry:delete",
  "catalog:read",
  "catalog:create",
  "form_category:read",
  "form_category:create",
  "form_subcategory:read",
  "form_subcategory:create",
  "field_request:create",
  "field_request:delete", // own-scope: only the request's owner (checkOwnership)
  "resource_request:create",
  "resource_request:read",
  "transfer:create",
  "transfer:read",
  "dashboard:read",
  "notification:read",
  "notification:update",
  "profile:read_self",
  "profile:update_self",
];

// Admin === every capability. Listed explicitly so the matrix is auditable and
// a missing capability surfaces as a type error rather than silent over-grant.
const ADMIN_CAPABILITIES: readonly Capability[] = [
  ...SUPERVISOR_CAPABILITIES,
  "site:read_all",
  "site:create",
  "site:update",
  "site:delete",
  "form_category:delete",
  "form_subcategory:update",
  "form_subcategory:delete",
  "field_request:read",
  "field_request:approve",
  "resource_request:approve",
  "transfer:approve",
  "analytics:read",
  "live_feed:read",
  "user:list",
  "user:create",
  "user:manage_roles",
  "resource:manage_all",
  "data:export", // admin-only: full data egress (PII) — supervisors excluded
];

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  [ROLES.ADMIN]: new Set(ADMIN_CAPABILITIES),
  [ROLES.SUPERVISOR]: new Set(SUPERVISOR_CAPABILITIES),
};

// O(1) Set.has lookup against a module-level constant — no DB/network on the
// hot path. Unknown roles deny by default.
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}
