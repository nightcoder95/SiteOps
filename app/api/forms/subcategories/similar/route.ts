import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { subcategories } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

const payloadSchema = z
  .object({
    categoryId: z.string().uuid(),
    name: z.string().min(1).max(100),
  })
  .strict();

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(payloadSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const all = await db
    .select({ id: subcategories.subcategoryId, name: subcategories.name })
    .from(subcategories)
    .where(eq(subcategories.categoryId, validation.data.categoryId));
  const ranked = rankSimilarityCandidates(validation.data.name, all);
  return successResponse(
    {
      ...ranked,
      requiresReview: ranked.topScore >= 0.7,
    },
    200,
    requestId,
  );
});
