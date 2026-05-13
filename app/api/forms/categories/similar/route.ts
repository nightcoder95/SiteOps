import { NextRequest } from "next/server";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";
import { rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

const payloadSchema = z
  .object({
    name: z.string().min(1).max(100),
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
    const validation = validateBody(payloadSchema, parsed.data, requestId);
    if (!validation.ok) return validation.response;

    const all = await db.select({ id: categories.categoryId, name: categories.name }).from(categories);
    const ranked = rankSimilarityCandidates(validation.data.name, all);
    return successResponse(ranked, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
