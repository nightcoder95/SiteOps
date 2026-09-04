import { and, eq, isNull } from "drizzle-orm";

import { can } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";

// Server-side equivalent of GET /api/sites, for server components that need the
// site list without a round trip through their own HTTP route (audit F16).
//
// SECURITY: the role branch is the authorization boundary — without
// site:read_all a caller sees only the sites they supervise.
export async function listSitesFor(user: { id: string; role: Role }) {
  if (can(user.role, "site:read_all")) {
    return db
      .select()
      .from(sites)
      .where(and(isNull(sites.archivedAt), eq(sites.isDeleted, false)));
  }

  return db
    .select()
    .from(sites)
    .where(
      and(
        eq(sites.supervisorId, user.id),
        isNull(sites.archivedAt),
        eq(sites.isDeleted, false),
      ),
    );
}
