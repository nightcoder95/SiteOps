import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireCapability } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { fieldRequests } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { reviewFieldRequest } from "@/lib/services/reviews";

type RouteCtx = { params: Promise<{ id: string }> };

const updateFieldRequestSchema = z.object({
  status: z.enum(["Approved", "Declined"]),
  mergeTargetCategoryId: z.string().uuid().optional(),
  mergeTargetSubcategoryId: z.string().uuid().nullable().optional(),
});

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "field_request:approve");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(updateFieldRequestSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { id } = await context.params;

  try {
    const outcome = await reviewFieldRequest(id, validation.data.status, {
      mergeTargetCategoryId: validation.data.mergeTargetCategoryId,
      mergeTargetSubcategoryId: validation.data.mergeTargetSubcategoryId ?? undefined,
    });
    if (outcome.type === "not_found") {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Request not found", 404, undefined, requestId);
    }
    if (outcome.type === "conflict") {
      const existing = await db
        .select()
        .from(fieldRequests)
        .where(eq(fieldRequests.fieldRequestId, id))
        .limit(1);
      const req = existing[0];
      const reviewRow = req?.proposedName.startsWith("[Category Review]") || req?.proposedName.startsWith("[Subcategory Review]");
      if (reviewRow && validation.data.status === "Declined" && !validation.data.mergeTargetCategoryId) {
        return errorResponse(ERROR_CODES.CONFLICT, "Select a merge target category to decline this review", 409, undefined, requestId);
      }
      if (req?.proposedName.startsWith("[Subcategory Review]") && validation.data.status === "Declined" && !validation.data.mergeTargetSubcategoryId) {
        return errorResponse(ERROR_CODES.CONFLICT, "Select a merge target subcategory to decline this review", 409, undefined, requestId);
      }
      return errorResponse(ERROR_CODES.CONFLICT, "Request already reviewed", 409, undefined, requestId);
    }

    return successResponse(outcome.row, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "field_request:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await db
    .select()
    .from(fieldRequests)
    .where(eq(fieldRequests.fieldRequestId, id))
    .limit(1);

  const req = existing[0] ?? null;
  if (!req) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Request not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, req.requestedBy)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot withdraw another supervisor's request", 403, undefined, requestId);
  }

  await db.delete(fieldRequests).where(eq(fieldRequests.fieldRequestId, id));
  return successResponse(null, 200, requestId);
});
