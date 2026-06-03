import type { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import {
  deleteEntryById,
  getEntryById,
  updateEntryById,
  type EntryType,
} from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import {
  updateExpenseEntrySchema,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

type RouteCtx = { params: Promise<{ id: string }> };

// Entries on an archived site are read-only — block edits/deletes even for
// the original author so a reassigned/closed site can't be mutated.
async function siteIsArchived(entry: unknown): Promise<boolean> {
  const siteId = (entry as { siteId?: unknown }).siteId;
  if (typeof siteId !== "string") return false;
  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { archivedAt: true },
  });
  return !site || site.archivedAt != null;
}

function parseType(request: NextRequest): EntryType | null {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (
    type === "labour" ||
    type === "material" ||
    type === "machinery" ||
    type === "expense" ||
    type === "incident"
  ) {
    return type;
  }
  return null;
}

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const type = parseType(request);
  if (!type) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing or invalid type", 400, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await getEntryById(id, type);
  if (!existing) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Entry not found", 404, undefined, requestId);
  }

  const ownerId = (existing as any).createdBy ?? (existing as any).reportedBy ?? null;
  if (!checkOwnership(auth.session.user, ownerId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot edit another supervisor's entry", 403, undefined, requestId);
  }

  if (await siteIsArchived(existing)) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is archived; entries are read-only", 409, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;

  const schema =
    type === "labour"
      ? updateLabourEntrySchema
      : type === "material"
        ? updateMaterialEntrySchema
        : type === "machinery"
          ? updateMachineryEntrySchema
          : type === "expense"
            ? updateExpenseEntrySchema
            : type === "incident"
              ? updateIncidentEntrySchema
              : null;

  if (!schema) {
    return errorResponse(ERROR_CODES.INVALID_REQUEST, "Unsupported entry type", 400, undefined, requestId);
  }

  const validation = validateBody(schema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const updateData: Record<string, unknown> = { ...validation.data };
  if (type === "expense" && typeof (updateData as any).amount === "number") {
    updateData.amount = String((updateData as any).amount);
  }
  if (type === "labour" && typeof (updateData as any).wagePerHead === "number") {
    updateData.wagePerHead = String((updateData as any).wagePerHead);
  }
  if (type === "labour" && typeof (updateData as any).salaryAmount === "number") {
    updateData.salaryAmount = String((updateData as any).salaryAmount);
  }
  if (type === "labour" && typeof (updateData as any).masonSalaryAmount === "number") {
    updateData.masonSalaryAmount = String((updateData as any).masonSalaryAmount);
  }
  if (type === "labour" && typeof (updateData as any).helperSalaryAmount === "number") {
    updateData.helperSalaryAmount = String((updateData as any).helperSalaryAmount);
  }
  if (type === "material" && typeof (updateData as any).quantity === "number") {
    updateData.quantity = String((updateData as any).quantity);
  }
  if (type === "material" && typeof (updateData as any).cost === "number") {
    updateData.cost = String((updateData as any).cost);
  }
  if (type === "machinery" && typeof (updateData as any).hoursActive === "number") {
    updateData.hoursActive = String((updateData as any).hoursActive);
  }
  if (type === "machinery" && typeof (updateData as any).totalCost === "number") {
    updateData.totalCost = String((updateData as any).totalCost);
  }

  try {
    const updated = await updateEntryById(id, type, updateData);

    runNonCritical(
      requestId,
      "analytics_cache_invalidation_failed",
      invalidateAdminAnalyticsCache(requestId),
    );

    return successResponse(updated, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const type = parseType(request);
  if (!type) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing or invalid type", 400, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await getEntryById(id, type);
  if (!existing) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Entry not found", 404, undefined, requestId);
  }

  const ownerId = (existing as any).createdBy ?? (existing as any).reportedBy ?? null;
  if (!checkOwnership(auth.session.user, ownerId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot delete another supervisor's entry", 403, undefined, requestId);
  }

  if (await siteIsArchived(existing)) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is archived; entries are read-only", 409, undefined, requestId);
  }

  await deleteEntryById(id, type);

  runNonCritical(
    requestId,
    "analytics_cache_invalidation_failed",
    invalidateAdminAnalyticsCache(requestId),
  );

  return successResponse(null, 200, requestId);
});
