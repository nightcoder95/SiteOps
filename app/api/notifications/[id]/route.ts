import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/guards";
import { markNotificationRead } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAuth(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const { id } = await context.params;

    const updated = await markNotificationRead(id, auth.session.user.id);
    if (!updated) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Notification not found", 404, undefined, requestId);
    }

    return successResponse(updated, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
