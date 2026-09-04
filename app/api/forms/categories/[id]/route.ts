import { and, eq } from "drizzle-orm";

import { requireCapability } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import {
  invalidateCatalogOverviewCache,
  invalidateCategoryListCache,
  invalidateCategoryTreeCache,
} from "@/lib/cache/invalidate";
import { categoryTreeCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { categories, fieldDefinitions, subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";

type RouteCtx = { params: Promise<{ id: string }> };

type CategoryRow = typeof categories.$inferSelect;
type SubcategoryRow = typeof subcategories.$inferSelect;
type FieldDefinitionRow = typeof fieldDefinitions.$inferSelect;

type CategoryTree = CategoryRow & {
  subcategories: Array<SubcategoryRow & { fields: FieldDefinitionRow[] }>;
};

const CATEGORY_TREE_TTL_SECONDS = 600;

async function loadCategoryTree(id: string): Promise<CategoryTree | null> {
  // Single roundtrip via LEFT JOIN. Each row can be:
  //   - category only (no subcategories)
  //   - category + subcategory (no fields on it)
  //   - category + subcategory + field
  const rows = await db
    .select({
      category: categories,
      sub: subcategories,
      field: fieldDefinitions,
    })
    .from(categories)
    // Only active subcategories reach the form dropdowns; deactivated rows stay
    // selectable in history but are excluded here (admin catalog uses its own route).
    .leftJoin(
      subcategories,
      and(eq(subcategories.categoryId, categories.categoryId), eq(subcategories.isActive, true)),
    )
    .leftJoin(fieldDefinitions, eq(fieldDefinitions.subcategoryId, subcategories.subcategoryId))
    .where(eq(categories.categoryId, id));

  const first = rows[0];
  if (!first) return null;

  const subsById = new Map<string, SubcategoryRow & { fields: FieldDefinitionRow[] }>();
  for (const row of rows) {
    if (!row.sub) continue;
    let bucket = subsById.get(row.sub.subcategoryId);
    if (!bucket) {
      bucket = { ...row.sub, fields: [] };
      subsById.set(row.sub.subcategoryId, bucket);
    }
    if (row.field && !bucket.fields.find((f) => f.fieldDefinitionId === row.field!.fieldDefinitionId)) {
      bucket.fields.push(row.field);
    }
  }

  return {
    ...first.category,
    subcategories: Array.from(subsById.values()),
  };
}

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_category:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;

  const { value: tree } = await getOrSetJson<CategoryTree | null>(
    requestId,
    categoryTreeCacheKey(id),
    CATEGORY_TREE_TTL_SECONDS,
    () => loadCategoryTree(id),
  );

  if (!tree) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
  }

  return successResponse(tree, 200, requestId);
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_category:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const existing = await db
    .select({ categoryId: categories.categoryId })
    .from(categories)
    .where(eq(categories.categoryId, id))
    .limit(1);
  if (!existing[0]) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
  }

  await db.delete(categories).where(eq(categories.categoryId, id));

  runNonCritical(
    requestId,
    "category_cache_invalidation_failed",
    Promise.all([
      invalidateCategoryTreeCache(id, requestId),
      invalidateCategoryListCache(requestId),
    ]),
  );

  runNonCritical(
    requestId,
    "catalog_overview_cache_invalidation_failed",
    invalidateCatalogOverviewCache(requestId),
  );

  return successResponse(null, 200, requestId);
});
