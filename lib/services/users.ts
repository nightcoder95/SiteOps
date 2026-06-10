import { ROLES, type Role } from "@/lib/auth/roles";

export type RoleChangeOutcome =
  | { type: "ok"; previousRole: Role; demoted: boolean }
  | { type: "not_found" }
  | { type: "last_admin" }
  | { type: "noop"; role: Role };

// Pure decision for a role change, given the count of locked Admin rows and the
// target's current role. Encapsulates the last-admin guard (§8.2/§8.3) so the
// rule is unit-testable without a DB or transaction. The caller owns the
// `SELECT … FOR UPDATE` lock and the `UPDATE`; this only decides the outcome.
export function resolveRoleChange(args: {
  adminCount: number;
  currentRole: Role | null;
  newRole: Role;
}): RoleChangeOutcome {
  const { adminCount, currentRole, newRole } = args;
  if (!currentRole) return { type: "not_found" };
  if (currentRole === newRole) return { type: "noop", role: currentRole };

  const demoting = currentRole === ROLES.ADMIN && newRole !== ROLES.ADMIN;
  if (demoting && adminCount <= 1) return { type: "last_admin" };

  return { type: "ok", previousRole: currentRole, demoted: demoting };
}
