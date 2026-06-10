import { eq } from "drizzle-orm";

import { requireCapability } from "@/lib/auth/guards";
import { invalidateCategoryTreeCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_subcategory:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const rows = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.subcategoryId, id))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Subcategory not found", 404, undefined, requestId);
  }

  return successResponse(row, 200, requestId);
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_subcategory:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const rows = await db
    .select({ categoryId: subcategories.categoryId })
    .from(subcategories)
    .where(eq(subcategories.subcategoryId, id))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Subcategory not found", 404, undefined, requestId);
  }

  await db.delete(subcategories).where(eq(subcategories.subcategoryId, id));

  runNonCritical(
    requestId,
    "category_tree_cache_invalidation_failed",
    invalidateCategoryTreeCache(row.categoryId, requestId),
  );

  return successResponse(null, 200, requestId);
});
