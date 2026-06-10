import { eq } from "drizzle-orm";
import { z } from "zod";

import { can } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { invalidateSiteCache } from "@/lib/cache/invalidate";
import { siteCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { coerceDecimals } from "@/lib/services/decimals";

type RouteCtx = { params: Promise<{ id: string }> };

const updateSiteSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    location: z.string().min(1).max(255).optional(),
    status: z.enum(["In Progress", "Blocked", "Completed"]).optional(),
    budget: z.number().positive().optional(),
    currentProgress: z.number().int().min(0).max(100).optional(),
    currentPhase: z.string().max(100).optional(),
    supervisorId: z.string().uuid().optional(),
  })
  .strict();

type SiteRow = typeof sites.$inferSelect;

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const { id } = await context.params;

  // Confirm the session BEFORE touching the cache/DB (S5): an unauthenticated or
  // forbidden caller must not trigger a DB read or populate the cache key.
  const auth = await requireCapability(request, "site:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { value: record } = await getOrSetJson<SiteRow | null>(
    requestId,
    siteCacheKey(id),
    300,
    async () => {
      const rows = await db.select().from(sites).where(eq(sites.siteId, id)).limit(1);
      return rows[0] ?? null;
    },
  );

  if (!record || record.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!can(auth.session.user.role, "site:read_all") && record.supervisorId !== auth.session.user.id) {
    return errorResponse(
      ERROR_CODES.FORBIDDEN,
      "You can only access sites you supervise",
      403,
      undefined,
      requestId,
    );
  }

  return successResponse(record, 200, requestId);
});

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "site:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(updateSiteSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { id } = await context.params;

  const existing = await db.select().from(sites).where(eq(sites.siteId, id)).limit(1);
  const record = existing[0] ?? null;
  if (!record || record.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  const updates: Record<string, unknown> = {
    ...validation.data,
    updatedAt: new Date(),
  };
  coerceDecimals(updates, ["budget"]);

  try {
    const updated = await db
      .update(sites)
      .set(updates)
      .where(eq(sites.siteId, id))
      .returning();

    await invalidateSiteCache(id, requestId);
    return successResponse(updated[0] ?? null, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "site:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await db.select().from(sites).where(eq(sites.siteId, id)).limit(1);
  const record = existing[0] ?? null;

  if (!record) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (record.archivedAt) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site already archived", 409, undefined, requestId);
  }

  await db
    .update(sites)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(sites.siteId, id));

  await invalidateSiteCache(id, requestId);
  return successResponse(null, 200, requestId);
});
