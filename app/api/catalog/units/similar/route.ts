import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { unitMaster } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

// Fuzzy-match a proposed unit name against existing active units. Mirrors
// /api/forms/subcategories/similar but for the unit_master list (units stay in
// their own table — no categoryId).
const payloadSchema = z.object({ name: z.string().min(1).max(100) }).strict();

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(payloadSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const rows = await db
    .select({ id: unitMaster.unitId, name: unitMaster.label })
    .from(unitMaster)
    .where(eq(unitMaster.isActive, true));

  const ranked = rankSimilarityCandidates(validation.data.name, rows);
  return successResponse(
    {
      ...ranked,
      requiresReview: ranked.topScore >= 0.7,
    },
    200,
    requestId,
  );
});
