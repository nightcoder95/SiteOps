import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { can } from "@/lib/auth/capabilities";
import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { measureDbQuery } from "@/lib/db/timing";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const createSiteSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  status: z.enum(["In Progress", "Blocked", "Completed"]).optional(),
  budget: z.number().positive().optional(),
  currentProgress: z.number().int().min(0).max(100).optional(),
  currentPhase: z.string().max(100).optional(),
  supervisorId: z.string().uuid().optional(),
});

export const GET = withApi(async ({ request, requestId }) => {
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

  if (can(role, "site:read_all")) {
    const result = await measureDbQuery(requestId, "sites.list.admin", () =>
      db.select().from(sites).where(isNull(sites.archivedAt))
    );
    return successResponse(result, 200, requestId);
  }

  const result = await measureDbQuery(requestId, "sites.list.supervisor", () =>
    db
      .select()
      .from(sites)
      .where(
        and(eq(sites.supervisorId, session.user.id), isNull(sites.archivedAt))
      )
  );

  return successResponse(result, 200, requestId);
});

export const POST = withApi(async ({ request, requestId }) => {
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
      can(session.user.role, "resource:manage_all")
        ? validation.data.supervisorId ?? session.user.id
        : session.user.id;

    const inserted = await measureDbQuery(requestId, "sites.create", () =>
      db
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
        .returning()
    );

    return successResponse(inserted[0], 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
