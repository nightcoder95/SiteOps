import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireCapability } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { materialTypeUnits, unitMaster } from "@/lib/db/schema";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ subcategoryId: string }> };

// Per material subcategory, the admin chooses which units are allowed and which
// is the default. An empty mapping means "all active units" (design §3.3).
const putSchema = z
  .object({
    unitIds: z.array(z.string().min(1)),
    defaultUnitId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => v.defaultUnitId === undefined || v.unitIds.includes(v.defaultUnitId), {
    message: "Default unit must be one of the chosen units",
  });

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_subcategory:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { subcategoryId } = await context.params;

  const mappings = await db
    .select({ unitId: unitMaster.unitId, label: unitMaster.label, isDefault: materialTypeUnits.isDefault })
    .from(materialTypeUnits)
    .innerJoin(unitMaster, eq(materialTypeUnits.unitId, unitMaster.unitId))
    .where(eq(materialTypeUnits.subcategoryId, subcategoryId));

  const activeUnits = await db
    .select({ unitId: unitMaster.unitId, label: unitMaster.label })
    .from(unitMaster)
    .where(eq(unitMaster.isActive, true));

  return successResponse({ mappings, activeUnits }, 200, requestId);
});

export const PUT = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "form_subcategory:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { subcategoryId } = await context.params;
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(putSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { unitIds, defaultUnitId } = validation.data;

  try {
    // Replace the whole set so the admin's picker is the source of truth.
    await db.delete(materialTypeUnits).where(eq(materialTypeUnits.subcategoryId, subcategoryId));
    if (unitIds.length > 0) {
      await db.insert(materialTypeUnits).values(
        unitIds.map((unitId) => ({ subcategoryId, unitId, isDefault: unitId === defaultUnitId })),
      );
    }
    return successResponse({ subcategoryId, count: unitIds.length }, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
