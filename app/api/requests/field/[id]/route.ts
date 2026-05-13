import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAdmin, requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { fieldRequests } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { reviewFieldRequest } from "@/lib/services/reviews";
import { generateRequestId } from "@/lib/utils/requestId";

const updateFieldRequestSchema = z.object({
  status: z.enum(["Approved", "Declined"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAdmin(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;
    const validation = validateBody(
      updateFieldRequestSchema,
      parsed.data,
      requestId
    );
    if (!validation.ok) return validation.response;

    const { id } = await context.params;

    try {
      const outcome = await reviewFieldRequest(id, validation.data.status);
      if (outcome.type === "not_found") {
        return errorResponse(ERROR_CODES.NOT_FOUND, "Request not found", 404, undefined, requestId);
      }
      if (outcome.type === "conflict") {
        return errorResponse(ERROR_CODES.CONFLICT, "Request already reviewed", 409, undefined, requestId);
      }

      return successResponse(outcome.row, 200, requestId);
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

    const { id } = await context.params;

    const existing = await db
      .select()
      .from(fieldRequests)
      .where(eq(fieldRequests.fieldRequestId, id));

    const req = existing[0] ?? null;
    if (!req) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Request not found", 404, undefined, requestId);
    }

    if (auth.session.user.role !== "Admin" && req.requestedBy !== auth.session.user.id) {
      return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot withdraw another supervisor's request", 403, undefined, requestId);
    }

    await db.delete(fieldRequests).where(eq(fieldRequests.fieldRequestId, id));
    return successResponse(null, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
