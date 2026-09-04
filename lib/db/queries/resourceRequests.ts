import { eq } from "drizzle-orm";

import { can } from "@/lib/auth/capabilities";
import { db } from "@/lib/db/client";
import { resourceRequests } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/roles";

type Executor = Pick<typeof db, "select">;

// Server-side read for the resource-requests page, mirroring GET
// /api/requests/resource exactly. The server component calls this directly
// rather than fetching its own HTTP route (audit F16) — a round trip through
// the load balancer to reach code in the same process.
//
// SECURITY: the role branch is the authorization boundary. Without
// resource:manage_all a caller sees only rows they requested.
export async function getResourceRequestsFor(
  user: { id: string; role: Role },
  executor: Executor = db,
) {
  if (can(user.role, "resource:manage_all")) {
    return executor.select().from(resourceRequests);
  }

  return executor
    .select()
    .from(resourceRequests)
    .where(eq(resourceRequests.requestedBy, user.id));
}
