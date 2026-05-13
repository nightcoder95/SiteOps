import { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import {
  deleteEntryById,
  getEntryById,
  updateEntryById,
  type EntryType,
} from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import {
  errorResponse,
  successResponse,
} from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { runNonCritical } from "@/lib/services/nonCritical";
import { generateRequestId } from "@/lib/utils/requestId";
import {
  updateExpenseEntrySchema,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
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
    if (type === "material" && typeof (updateData as any).quantity === "number") {
      updateData.quantity = String((updateData as any).quantity);
    }
    if (type === "machinery" && typeof (updateData as any).hoursActive === "number") {
      updateData.hoursActive = String((updateData as any).hoursActive);
    }

    try {
      const updated = await updateEntryById(id, type, updateData);

      runNonCritical(
        requestId,
        "analytics_cache_invalidation_failed",
        invalidateAdminAnalyticsCache(requestId)
      );

      return successResponse(updated, 200, requestId);
    } catch (dbError) {
      const handled = handleDbError(dbError, requestId);
      if (handled) return handled;
      throw dbError;
    }
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
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

    await deleteEntryById(id, type);

    runNonCritical(
      requestId,
      "analytics_cache_invalidation_failed",
      invalidateAdminAnalyticsCache(requestId)
    );

    return successResponse(null, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
