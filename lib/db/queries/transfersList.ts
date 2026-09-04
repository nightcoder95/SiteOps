import { and, desc, eq, or } from "drizzle-orm";

import { can } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { resourceTransfers } from "@/lib/db/schema";

// Server-side equivalent of GET /api/transfers, for server components that need
// the list without a round trip through their own HTTP route (audit F16).
//
// SECURITY: the role branch is the authorization boundary — without
// resource:manage_all a caller sees only transfers they requested or approved.
export async function listTransfersFor(user: { id: string; role: Role }) {
  if (can(user.role, "resource:manage_all")) {
    return db.select().from(resourceTransfers).orderBy(desc(resourceTransfers.createdAt));
  }

  return db
    .select()
    .from(resourceTransfers)
    .where(
      or(
        eq(resourceTransfers.requestedByUserId, user.id),
        and(
          eq(resourceTransfers.status, "Approved"),
          eq(resourceTransfers.approvedByUserId, user.id),
        ),
      ),
    )
    .orderBy(desc(resourceTransfers.createdAt));
}
