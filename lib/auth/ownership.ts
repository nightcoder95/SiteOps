import { can } from "@/lib/auth/capabilities";
import { isRole } from "@/lib/auth/roles";

interface SessionUser {
  id: string;
  role: string;
}

// A user owns a resource if they created it, or if their role carries the
// cross-owner override capability (resource:manage_all — Admin today). Consults
// the capability layer, never a role-string literal.
export function checkOwnership(
  sessionUser: SessionUser,
  resourceOwnerId: string | null
): boolean {
  const hasOverride = isRole(sessionUser.role) && can(sessionUser.role, "resource:manage_all");
  return hasOverride || sessionUser.id === resourceOwnerId;
}
