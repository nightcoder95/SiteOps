import { eq } from "drizzle-orm";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { fieldDefinitions, genericEntries } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { dynamicEntrySchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(dynamicEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, fieldDefinitionId, value } = validation.data;

  const site = await db.query.sites.findFirst({
    where: (t, { eq: opEq }) => opEq(t.siteId, siteId),
    columns: { supervisorId: true, archivedAt: true },
  });

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only log entries for sites you supervise", 403, undefined, requestId);
  }

  const fieldDef = await db
    .select()
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.fieldDefinitionId, fieldDefinitionId))
    .limit(1);

  const def = fieldDef[0] ?? null;
  if (!def) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Field definition not found", 404, undefined, requestId);
  }

  if (def.fieldType === "Dropdown") {
    const options = Array.isArray(def.options) ? (def.options as unknown[]) : null;
    if (!options || !options.includes(value)) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid dropdown option", 400, undefined, requestId);
    }
  }

  try {
    const inserted = await db
      .insert(genericEntries)
      .values({
        siteId,
        date,
        fieldDefinitionId,
        value,
        createdBy: auth.session.user.id,
      })
      .returning();

    return successResponse(inserted[0], 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
