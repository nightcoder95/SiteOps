import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { getSiteById } from "@/lib/db/queries/sites";
import {
  getStageComposition,
  LEGACY_STAGE_KEY,
  UNTAGGED_STAGE_KEY,
} from "@/lib/db/queries/stageSummary";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string; stage: string }> };

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const { id: siteId, stage: rawStage } = await context.params;

  const [auth, site] = await Promise.all([
    requireSiteAccess(request),
    getSiteById(siteId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(
      ERROR_CODES.FORBIDDEN,
      "You can only view stages for sites you supervise",
      403,
      undefined,
      requestId,
    );
  }

  // The two untagged buckets travel as sentinels — a null cannot be a URL
  // segment. Anything else is a stage name, bound as a query parameter.
  const decoded = decodeURIComponent(rawStage);
  const isLegacy = decoded === LEGACY_STAGE_KEY;
  const stage = isLegacy || decoded === UNTAGGED_STAGE_KEY ? null : decoded;

  const rows = await getStageComposition(db, siteId, stage, { legacy: isLegacy });
  return successResponse({ rows }, 200, requestId);
});
