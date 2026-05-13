import { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ERROR_CODES } from "@/lib/errors/codes";
import {
  errorResponse,
  successResponse,
} from "@/lib/errors/response";
import { handleDbError } from "@/lib/errors/db";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";
import { z } from "zod";

const createSiteSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  status: z.enum(["In Progress", "Blocked", "Completed"]).optional(),
  budget: z.number().positive().optional(),
  currentProgress: z.number().int().min(0).max(100).optional(),
  currentPhase: z.string().max(100).optional(),
  supervisorId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        "Authentication required",
        auth.status,
        undefined,
        requestId
      );
    }

    const session = auth.session;
    const role = session.user.role;

    if (role === "Admin") {
      const result = await db.select().from(sites).where(isNull(sites.archivedAt));
      return successResponse(result, 200, requestId);
    }

    const result = await db
      .select()
      .from(sites)
      .where(
        and(eq(sites.supervisorId, session.user.id), isNull(sites.archivedAt))
      );

    return successResponse(result, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "An unexpected error occurred",
      500,
      undefined,
      requestId
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        "Authentication required",
        auth.status,
        undefined,
        requestId
      );
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;
    const validation = validateBody(createSiteSchema, parsed.data, requestId);
    if (!validation.ok) return validation.response;

    const session = auth.session;
    try {
      const supervisorId =
        session.user.role === "Admin"
          ? validation.data.supervisorId ?? session.user.id
          : session.user.id;

      const inserted = await db
        .insert(sites)
        .values({
          name: validation.data.name,
          location: validation.data.location,
          status: validation.data.status ?? "In Progress",
          budget:
            typeof validation.data.budget === "number"
              ? String(validation.data.budget)
              : null,
          currentProgress: validation.data.currentProgress ?? null,
          currentPhase: validation.data.currentPhase ?? null,
          supervisorId,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
        })
        .returning();

      return successResponse(inserted[0], 201, requestId);
    } catch (dbError) {
      const handled = handleDbError(dbError, requestId);
      if (handled) return handled;
      throw dbError;
    }
  } catch (error) {
    logError(requestId, error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "An unexpected error occurred",
      500,
      undefined,
      requestId
    );
  }
}
