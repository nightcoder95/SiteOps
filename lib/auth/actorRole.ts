import { eq } from "drizzle-orm";

import { isRole, type Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

// Stateful actor-role read for privilege-critical paths (§8.7). Reads the
// actor's current role straight from the DB — bypassing the JWT header and the
// profile cache — so a demoted admin's still-valid token can't be used to
// escalate on the user-management endpoints. Cold paths only.
export async function getActorRoleFromDb(userId: string): Promise<Role | null> {
  const rows = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const role = rows[0]?.role;
  return isRole(role) ? role : null;
}
