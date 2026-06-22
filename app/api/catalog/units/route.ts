import { sql } from "drizzle-orm";

import { requireCapability } from "@/lib/auth/guards";
import { groupUnitsByCategory, unitCodeFromLabel, type UnitRow } from "@/lib/catalog/units";
import { db } from "@/lib/db/client";
import { materialEntries, unitMaster } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { normalizeLabel } from "@/lib/utils/stringSimilarity";

// Units live in unit_master, a separate SSOT from subcategory-backed lists.
// Usage is counted against the free-text material_entries.unit column.
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:read_all");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const rows = await db
    .select({
      unitId: unitMaster.unitId,
      label: unitMaster.label,
      category: unitMaster.category,
      sortOrder: unitMaster.sortOrder,
      isActive: unitMaster.isActive,
    })
    .from(unitMaster);

  const usageRows = await db
    .select({ value: materialEntries.unit, n: sql<number>`count(*)::int` })
    .from(materialEntries)
    .groupBy(materialEntries.unit);

  const usageByLabel = new Map<string, number>();
  for (const row of usageRows) {
    if (row.value != null) usageByLabel.set(String(row.value), Number(row.n));
  }

  const unitRows: UnitRow[] = rows.map((r) => ({
    ...r,
    usageCount: usageByLabel.get(r.label) ?? 0,
  }));

  return successResponse({ groups: groupUnitsByCategory(unitRows) }, 200, requestId);
});

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "catalog:create");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  const label = String(body.label ?? "").trim();
  const category = String(body.category ?? "").trim();

  if (!label) return errorResponse(ERROR_CODES.VALIDATION_ERROR, "label is required", 400, undefined, requestId);
  if (!category) return errorResponse(ERROR_CODES.VALIDATION_ERROR, "category is required", 400, undefined, requestId);

  const code = unitCodeFromLabel(label);
  if (!code) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "label must contain letters or numbers", 400, undefined, requestId);
  }

  const existing = await db
    .select({ label: unitMaster.label, category: unitMaster.category, sortOrder: unitMaster.sortOrder })
    .from(unitMaster);

  const normalized = normalizeLabel(label);
  if (existing.some((u) => normalizeLabel(u.label) === normalized)) {
    return errorResponse(ERROR_CODES.CONFLICT, "A unit with this name already exists", 409, undefined, requestId);
  }

  const maxSort = existing
    .filter((u) => u.category === category)
    .reduce((max, u) => Math.max(max, u.sortOrder), -1);

  try {
    const inserted = await db
      .insert(unitMaster)
      .values({ code, label, category, isActive: true, sortOrder: maxSort + 1 })
      .returning();
    return successResponse(inserted[0], 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
