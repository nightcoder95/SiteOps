import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/db/queries/notifications";
import { resourceTransfers } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";

type RouteCtx = { params: Promise<{ id: string }> };

const reviewTransferSchema = z.object({
  status: z.enum(["Approved", "Declined"]),
});

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireAdmin(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(reviewTransferSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { status } = validation.data;

  const existing = await db
    .select()
    .from(resourceTransfers)
    .where(eq(resourceTransfers.transferId, id))
    .limit(1);
  const transfer = existing[0] ?? null;
  if (!transfer) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Transfer not found", 404, undefined, requestId);
  }

  // Idempotency: a non-pending transfer cannot be re-reviewed. Returning the
  // row when the requested status already matches keeps retries safe.
  if (transfer.status !== "Pending") {
    if (transfer.status === status) {
      return successResponse(transfer, 200, requestId);
    }
    return errorResponse(ERROR_CODES.CONFLICT, "Transfer already reviewed", 409, undefined, requestId);
  }

  try {
    // Conditional update guards against two admins reviewing concurrently.
    const updated = await db
      .update(resourceTransfers)
      .set({
        status,
        approvedByUserId: auth.session.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(resourceTransfers.transferId, id), eq(resourceTransfers.status, "Pending")),
      )
      .returning();

    const row = updated[0] ?? null;
    if (!row) {
      // Lost the race — re-read and report the resolved state.
      const latest = await db
        .select()
        .from(resourceTransfers)
        .where(eq(resourceTransfers.transferId, id))
        .limit(1);
      const current = latest[0] ?? null;
      if (current && current.status === status) {
        return successResponse(current, 200, requestId);
      }
      return errorResponse(ERROR_CODES.CONFLICT, "Transfer already reviewed", 409, undefined, requestId);
    }

    runNonCritical(
      requestId,
      "transfer_review_notification_failed",
      createNotification(
        row.requestedByUserId,
        "approval",
        `Transfer ${row.status}`,
        `Your ${row.resourceType.toLowerCase()} transfer request was ${row.status.toLowerCase()}`,
        "/app/dashboard",
      ),
      { transferId: row.transferId },
    );

    return successResponse(row, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
