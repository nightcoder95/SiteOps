import { eq } from "drizzle-orm";

import { requireCapability } from "@/lib/auth/guards";
import { invalidateSiteCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/sites/[id]/restore — un-archive a site (admin only).
export const POST = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "site:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const existing = await db.select().from(sites).where(eq(sites.siteId, id)).limit(1);
  const record = existing[0] ?? null;
  if (!record || record.isDeleted) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }
  if (!record.archivedAt) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is not archived", 409, undefined, requestId);
  }

  try {
    await db
      .update(sites)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sites.siteId, id));
    await invalidateSiteCache(id, requestId);
    return successResponse(null, 200, requestId);
  } catch (dbError) {
    // An active site may now hold this name — the partial unique index raises
    // here; surface it as a conflict rather than a 500.
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
