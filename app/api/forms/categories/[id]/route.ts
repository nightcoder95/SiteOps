import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { categories, fieldDefinitions, subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const { id } = await context.params;

    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.categoryId, id));

    const cat = category[0] ?? null;
    if (!cat) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
    }

    const subs = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.categoryId, id));

    const subIds = subs.map((s) => s.subcategoryId);
    const allFields =
      subIds.length === 0
        ? []
        : await db
            .select()
            .from(fieldDefinitions)
            .where(inArray(fieldDefinitions.subcategoryId, subIds));

    const fieldsBySub = new Map<string, typeof allFields>();
    for (const field of allFields) {
      const existing = fieldsBySub.get(field.subcategoryId) ?? [];
      existing.push(field);
      fieldsBySub.set(field.subcategoryId, existing);
    }

    const fields = subs.map((s) => ({ ...s, fields: fieldsBySub.get(s.subcategoryId) ?? [] }));

    return successResponse({ ...cat, subcategories: fields }, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
