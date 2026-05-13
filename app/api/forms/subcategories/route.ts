import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { categories, subcategories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";
import { normalizeLabel } from "@/lib/utils/stringSimilarity";

const createSubcategorySchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().min(1).max(100),
    overrideDuplicateWarning: z.boolean().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;
    const validation = validateBody(createSubcategorySchema, parsed.data, requestId);
    if (!validation.ok) return validation.response;

    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.categoryId, validation.data.categoryId));
    if (!category[0]) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
    }

    const normalized = normalizeLabel(validation.data.name);
    if (!normalized) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Subcategory name is invalid", 400, undefined, requestId);
    }

    const existing = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.categoryId, validation.data.categoryId));
    const duplicate = existing.find((item) => normalizeLabel(item.name) === normalized);
    if (duplicate) {
      return successResponse(duplicate, 200, requestId);
    }

    try {
      const inserted = await db
        .insert(subcategories)
        .values({
          categoryId: validation.data.categoryId,
          name: validation.data.name.trim(),
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
