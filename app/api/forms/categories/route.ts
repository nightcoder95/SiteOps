import { NextRequest } from "next/server";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { DEFAULT_CATEGORY_CATALOG } from "@/lib/db/defaultCatalog";
import { categories, subcategories } from "@/lib/db/schema";
import { handleDbError } from "@/lib/errors/db";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";
import { normalizeLabel } from "@/lib/utils/stringSimilarity";

async function seedDefaultCatalogIfEmpty() {
  const existing = await db.select().from(categories);
  if (existing.length > 0) return;

  for (const item of DEFAULT_CATEGORY_CATALOG) {
    const createdCategory = await db
      .insert(categories)
      .values({ name: item.name, icon: null })
      .returning();
    const category = createdCategory[0];
    if (!category) continue;

    if (item.subcategories.length > 0) {
      await db.insert(subcategories).values(
        item.subcategories.map((name) => ({
          categoryId: category.categoryId,
          name,
        })),
      );
    }
  }
}

const createCategorySchema = z
  .object({
    name: z.string().min(1).max(100),
    icon: z.string().max(50).optional(),
    overrideDuplicateWarning: z.boolean().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    await seedDefaultCatalogIfEmpty();
    const result = await db.select().from(categories);
    return successResponse(result, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireSiteAccess(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;
    const validation = validateBody(createCategorySchema, parsed.data, requestId);
    if (!validation.ok) return validation.response;

    const normalized = normalizeLabel(validation.data.name);
    if (!normalized) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Category name is invalid", 400, undefined, requestId);
    }

    const existing = await db.select().from(categories);
    const duplicate = existing.find((item) => normalizeLabel(item.name) === normalized);
    if (duplicate) {
      return successResponse(duplicate, 200, requestId);
    }

    try {
      const inserted = await db
        .insert(categories)
        .values({
          name: validation.data.name.trim(),
          icon: validation.data.icon ?? null,
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
