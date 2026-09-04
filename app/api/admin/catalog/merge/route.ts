import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { requireCapability } from "@/lib/auth/guards";
import { usageSourcesForCategory } from "@/lib/catalog/usageSources";
import { invalidateCatalogOverviewCache, invalidateCategoryTreeCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { categories, subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";

// Merge a duplicate catalog item into a canonical one (design §4.2): rewrite all
// entries referencing the source NAME to the target NAME, then deactivate the
// source so it leaves the active picker but stays auditable.
const mergeSchema = z
  .object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
  })
  .strict()
  .refine((v) => v.sourceId !== v.targetId, { message: "Cannot merge an item into itself" });

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "form_subcategory:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(mergeSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { sourceId, targetId } = validation.data;

  const rows = await db
    .select({
      subcategoryId: subcategories.subcategoryId,
      categoryId: subcategories.categoryId,
      name: subcategories.name,
    })
    .from(subcategories)
    .where(inArray(subcategories.subcategoryId, [sourceId, targetId]));

  const source = rows.find((r) => r.subcategoryId === sourceId);
  const target = rows.find((r) => r.subcategoryId === targetId);
  if (!source || !target) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Source or target item not found", 404, undefined, requestId);
  }
  if (source.categoryId !== target.categoryId) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      "Items must belong to the same category to merge",
      400,
      undefined,
      requestId,
    );
  }

  const catRows = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.categoryId, source.categoryId))
    .limit(1);
  const usageSources = catRows[0] ? usageSourcesForCategory(catRows[0].name) : [];

  try {
    await db.transaction(async (tx) => {
      for (const usageSource of usageSources) {
        // SET takes an unqualified column name; interpolating the PgColumn
        // renders it table-qualified, which Postgres rejects (42703).
        const setColumn = sql.identifier(usageSource.column.name);
        await tx.execute(
          sql`update ${usageSource.table} set ${setColumn} = ${target.name} where ${usageSource.column} = ${source.name}`,
        );
      }

      await tx
        .update(subcategories)
        .set({ isActive: false })
        .where(eq(subcategories.subcategoryId, sourceId));
    });

    runNonCritical(
      requestId,
      "category_tree_cache_invalidation_failed",
      invalidateCategoryTreeCache(source.categoryId, requestId),
    );
    runNonCritical(
      requestId,
      "catalog_overview_cache_invalidation_failed",
      invalidateCatalogOverviewCache(requestId),
    );

    return successResponse({ sourceId, targetId }, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
