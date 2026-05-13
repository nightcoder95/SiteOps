import { NextRequest } from "next/server";

import { requireAdmin, requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { fieldRequests } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";
import { z } from "zod";

const fieldRequestSchema = z.object({
  siteId: z.string().uuid(),
  proposedName: z.string().min(1).max(100),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  fieldType: z.enum(["Number", "Text", "Dropdown"]),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;
    const validation = validateBody(fieldRequestSchema, parsed.data, requestId);
    if (!validation.ok) return validation.response;

    const { siteId, proposedName, categoryId, subcategoryId, fieldType } = validation.data;

    const site = await db.query.sites.findFirst({
      where: (t, { eq }) => eq(t.siteId, siteId),
      columns: { supervisorId: true, archivedAt: true },
    });

    if (!site || site.archivedAt) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
    }

    if (!checkOwnership(auth.session.user, site.supervisorId)) {
      return errorResponse(ERROR_CODES.FORBIDDEN, "You can only propose fields for sites you supervise", 403, undefined, requestId);
    }

    try {
      const inserted = await db
        .insert(fieldRequests)
        .values({
          siteId,
          proposedName,
          categoryId,
          subcategoryId: subcategoryId ?? null,
          fieldType,
          requestedBy: auth.session.user.id,
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
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAdmin(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
    }

    const result = await db.select().from(fieldRequests);
    return successResponse(result, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
