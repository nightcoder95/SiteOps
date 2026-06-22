import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireCapability } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { unitMaster } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { normalizeLabel } from "@/lib/utils/stringSimilarity";

type RouteCtx = { params: Promise<{ id: string }> };

// Admin unit management: rename label, (de)activate, reorder. At least one field.
const patchSchema = z
  .object({
    label: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((v) => v.label !== undefined || v.isActive !== undefined || v.sortOrder !== undefined, {
    message: "At least one field is required",
  });

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_subcategory:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(patchSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const rows = await db
    .select({ unitId: unitMaster.unitId, label: unitMaster.label, category: unitMaster.category })
    .from(unitMaster)
    .where(eq(unitMaster.unitId, id))
    .limit(1);
  const row = rows[0] ?? null;
  if (!row) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Unit not found", 404, undefined, requestId);
  }

  const updates: Partial<typeof unitMaster.$inferInsert> = {};
  if (validation.data.isActive !== undefined) updates.isActive = validation.data.isActive;
  if (validation.data.sortOrder !== undefined) updates.sortOrder = validation.data.sortOrder;

  if (validation.data.label !== undefined) {
    const label = validation.data.label.trim();
    const normalized = normalizeLabel(label);
    if (!normalized) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Label is invalid", 400, undefined, requestId);
    }
    // The label is what entries reference and what dedupes the dropdown — reject a
    // rename that collides with any other unit. The code stays stable.
    const all = await db.select({ unitId: unitMaster.unitId, label: unitMaster.label }).from(unitMaster);
    if (all.some((u) => u.unitId !== id && normalizeLabel(u.label) === normalized)) {
      return errorResponse(ERROR_CODES.CONFLICT, "Another unit with this name already exists", 409, undefined, requestId);
    }
    updates.label = label;
  }

  try {
    const updated = await db.update(unitMaster).set(updates).where(eq(unitMaster.unitId, id)).returning();
    return successResponse(updated[0], 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
