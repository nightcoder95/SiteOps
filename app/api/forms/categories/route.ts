import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { invalidateCategoryListCache } from "@/lib/cache/invalidate";
import { categoryListCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { categories, fieldRequests, sites } from "@/lib/db/schema";
import { handleDbError } from "@/lib/errors/db";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { normalizeLabel, rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

type CategoryRow = typeof categories.$inferSelect;

const CATEGORY_LIST_TTL_SECONDS = 600;

async function resolveReviewSiteId(
  preferredSiteId: string | undefined,
  sessionUserId: string,
  role: "Admin" | "Supervisor",
) {
  if (preferredSiteId) {
    const rows = await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(and(eq(sites.siteId, preferredSiteId), isNull(sites.archivedAt)));
    if (rows[0]?.siteId) return rows[0].siteId;
  }

  const rows = role === "Admin"
    ? await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(isNull(sites.archivedAt))
      .limit(1)
    : await db
      .select({ siteId: sites.siteId })
      .from(sites)
      .where(and(eq(sites.supervisorId, sessionUserId), isNull(sites.archivedAt)))
      .limit(1);

  return rows[0]?.siteId ?? null;
}

const createCategorySchema = z
  .object({
    name: z.string().min(1).max(100),
    icon: z.string().max(50).optional(),
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

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { value: rows } = await getOrSetJson<CategoryRow[]>(
    requestId,
    categoryListCacheKey(),
    CATEGORY_LIST_TTL_SECONDS,
    () => db.select().from(categories),
  );

  return successResponse(rows, 200, requestId);
});

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(createCategorySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const categoryName = validation.data.name.trim();
  const normalized = normalizeLabel(categoryName);
  if (!normalized) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Category name is invalid", 400, undefined, requestId);
  }

  const existing = await db.select().from(categories);
  const duplicate = existing.find((item) => normalizeLabel(item.name) === normalized);
  if (duplicate) {
    return successResponse(duplicate, 200, requestId);
  }

  const ranked = rankSimilarityCandidates(
    categoryName,
    existing.map((item) => ({ id: item.categoryId, name: item.name })),
  );
  const requiresReview = ranked.topScore >= 0.7;
  if (requiresReview && !validation.data.overrideDuplicateWarning) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      "Similar category already exists. Pick one of the suggestions or confirm creation.",
      409,
      {
        requiresReview: true,
        candidates: ranked.candidates,
        topScore: ranked.topScore,
      },
      requestId,
    );
  }

  try {
    const inserted = await db
      .insert(categories)
      .values({
        name: categoryName,
        icon: validation.data.icon ?? null,
      })
      .returning();

    const created = inserted[0];
    if (!created) {
      return errorResponse(ERROR_CODES.INTERNAL_ERROR, "Category creation failed", 500, undefined, requestId);
    }

    if (requiresReview) {
      const admins = await getAllAdmins();
      runNonCritical(
        requestId,
        "category_review_notification_failed",
        Promise.all(
          admins.map((admin) =>
            createNotification(
              admin.id,
              "approval",
              "Category needs review",
              `A similar category "${categoryName}" was created and flagged for admin review.`,
              validation.data.siteId
                ? `/app/sites/${validation.data.siteId}`
                : "/app/logs/new",
            ),
          ),
        ),
        { categoryId: created.categoryId, name: categoryName },
      );

      const reviewSiteId = await resolveReviewSiteId(
        validation.data.siteId,
        auth.session.user.id,
        auth.session.user.role,
      );
      if (reviewSiteId) {
        await db.insert(fieldRequests).values({
          siteId: reviewSiteId,
          proposedName: `[Category Review] ${categoryName}`,
          categoryId: created.categoryId,
          subcategoryId: null,
          fieldType: "Text",
          status: "Pending",
          requestedBy: auth.session.user.id,
        });
      }
    }

    if (validation.data.siteId && (validation.data.customFields?.length || validation.data.remarks?.trim())) {
      const requestRows = [
        ...(validation.data.customFields ?? [])
          .filter((item) => item.label.trim())
          .map((item) => ({
            siteId: validation.data.siteId as string,
            proposedName: item.unit?.trim() ? `${item.label.trim()} (${item.unit.trim()})` : item.label.trim(),
            categoryId: created.categoryId,
            subcategoryId: null,
            fieldType: item.fieldType,
            status: "Pending" as const,
            requestedBy: auth.session.user.id,
          })),
        ...(validation.data.remarks?.trim()
          ? [{
            siteId: validation.data.siteId as string,
            proposedName: `Remarks: ${validation.data.remarks.trim()}`,
            categoryId: created.categoryId,
            subcategoryId: null,
            fieldType: "Text" as const,
            status: "Pending" as const,
            requestedBy: auth.session.user.id,
          }]
          : []),
      ];
      if (requestRows.length > 0) {
        await db.insert(fieldRequests).values(requestRows);
      }
    }

    runNonCritical(
      requestId,
      "category_cache_invalidation_failed",
      invalidateCategoryListCache(requestId),
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
