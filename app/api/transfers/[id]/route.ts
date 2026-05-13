import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { resourceTransfers } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody } from "@/lib/http/request";
import { generateRequestId } from "@/lib/utils/requestId";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId();
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  if (auth.session.user.role !== "Admin") {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Only admins can review transfers", 403, undefined, requestId);
  }

  const { id } = await context.params;
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const status = String((parsed.data as Record<string, unknown>).status ?? "");
  if (!(["Approved", "Declined"] as const).includes(status as "Approved" | "Declined")) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "status must be Approved or Declined", 400, undefined, requestId);
  }

  const updated = await db.update(resourceTransfers).set({
    status: status as "Approved" | "Declined",
    approvedByUserId: auth.session.user.id,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(resourceTransfers.transferId, id)).returning();

  if (!updated[0]) return errorResponse(ERROR_CODES.NOT_FOUND, "Transfer not found", 404, undefined, requestId);
  return successResponse(updated[0], 200, requestId);
}
