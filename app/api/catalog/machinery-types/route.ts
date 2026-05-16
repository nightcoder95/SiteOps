import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { customMachineryTypes } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { checkDuplicateOrSimilar } from "@/lib/services/duplicateGuard";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  const rows = await db.select().from(customMachineryTypes);
  return successResponse(rows, 200, requestId);
});

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name) return errorResponse(ERROR_CODES.VALIDATION_ERROR, "name is required", 400, undefined, requestId);

  const existing = await db.select({ id: customMachineryTypes.equipmentTypeId, name: customMachineryTypes.name }).from(customMachineryTypes);
  const guard = checkDuplicateOrSimilar(name, existing);
  if (guard.blocked) return errorResponse(ERROR_CODES.CONFLICT, "Possible duplicate machinery type", 409, { guard }, requestId);

  const inserted = await db.insert(customMachineryTypes).values({
    name,
    createdByUserId: auth.session.user.id,
    updatedByUserId: auth.session.user.id,
  }).returning();

  return successResponse(inserted[0], 201, requestId);
});
