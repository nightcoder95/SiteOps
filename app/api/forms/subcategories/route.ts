import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { invalidateCatalogOverviewCache, invalidateCategoryTreeCache } from "@/lib/cache/invalidate";
import { buildFieldRequestRows, submitForReview, SIMILARITY_REVIEW_THRESHOLD } from "@/lib/catalog/review";
import { db } from "@/lib/db/client";
import { categories, fieldRequests, subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { normalizeLabel, rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

const createSubcategorySchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().min(1).max(100),
    overrideDuplicateWarning: z.boolean().optional(),
    siteId: z.string().uuid().optional(),
    customFields: z.array(z.object({
      label: z.string().min(1).max(100),
      fieldType: z.enum(["Number", "Text"]),
      unit: z.string().max(50).optional(),
    })).optional(),
    remarks: z.string().max(500).optional(),
  })
  .strict();

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(createSubcategorySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const category = await db
    .select()
    .from(categories)
    .where(eq(categories.categoryId, validation.data.categoryId))
    .limit(1);
  if (!category[0]) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
  }

  const subcategoryName = validation.data.name.trim();
  const normalized = normalizeLabel(subcategoryName);
  if (!normalized) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Subcategory name is invalid", 400, undefined, requestId);
  }

  const existing = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, validation.data.categoryId));
  const duplicate = existing.find((item) => normalizeLabel(item.name) === normalized);
  if (duplicate) {
    return successResponse(duplicate, 200, requestId);
  }

  const ranked = rankSimilarityCandidates(
    subcategoryName,
    existing.map((item) => ({ id: item.subcategoryId, name: item.name })),
  );
  const requiresReview = ranked.topScore >= SIMILARITY_REVIEW_THRESHOLD;
  if (requiresReview && !validation.data.overrideDuplicateWarning) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      "Similar subcategory already exists. Pick one of the suggestions or confirm creation.",
      409,
      {
        requiresReview: true,
        candidates: ranked.candidates,
        topScore: ranked.topScore,
      },
      requestId,
    );
  }

  // New items go to the end of the admin-ordered list; remark (if any) is kept
  // on the row itself (design §5). Inactive deactivation is admin-only later.
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 0) + 1;
  const remark = validation.data.remarks?.trim() || null;

  try {
    const inserted = await db
      .insert(subcategories)
      .values({
        categoryId: validation.data.categoryId,
        name: subcategoryName,
        sortOrder: nextSortOrder,
        remark,
      })
      .returning();

    const created = inserted[0];
    if (!created) {
      return errorResponse(ERROR_CODES.INTERNAL_ERROR, "Subcategory creation failed", 500, undefined, requestId);
    }

    if (requiresReview) {
      await submitForReview({
        requestId,
        noun: "subcategory",
        name: subcategoryName,
        categoryId: validation.data.categoryId,
        subcategoryId: created.subcategoryId,
        preferredSiteId: validation.data.siteId,
        sessionUserId: auth.session.user.id,
        role: auth.session.user.role,
      });
    }

    if (validation.data.siteId && (validation.data.customFields?.length || validation.data.remarks?.trim())) {
      const requestRows = buildFieldRequestRows({
        siteId: validation.data.siteId,
        categoryId: validation.data.categoryId,
        subcategoryId: created.subcategoryId,
        requestedBy: auth.session.user.id,
        customFields: validation.data.customFields,
        remarks: validation.data.remarks,
      });
      if (requestRows.length > 0) {
        await db.insert(fieldRequests).values(requestRows);
      }
    }

    runNonCritical(
      requestId,
      "category_tree_cache_invalidation_failed",
      invalidateCategoryTreeCache(validation.data.categoryId, requestId),
    );
    runNonCritical(
      requestId,
      "catalog_overview_cache_invalidation_failed",
      invalidateCatalogOverviewCache(requestId),
    );

    return successResponse(
      {
        ...created,
        flaggedForReview: requiresReview,
      },
      201,
      requestId,
    );
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
