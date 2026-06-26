import { can } from "@/lib/auth/capabilities";
import { requireAuth } from "@/lib/auth/guards";
import { isRole } from "@/lib/auth/roles";
import { searchRemarks } from "@/lib/db/queries/search";
import { getSitesBySupervisor } from "@/lib/db/queries/sites";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { logError } from "@/lib/logging/log";
import { withApi } from "@/lib/http/withApi";
import { SEARCH_MIN_CHARS } from "@/lib/http/searchKeys";
import { clampInt } from "@/lib/utils/clampInt";

const MAX_QUERY_LEN = 100;
const EMPTY = { hits: [], hasMore: false } as const;

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = clampInt(url.searchParams.get("limit"), 7, 1, 50);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000);

  if (q.length < SEARCH_MIN_CHARS) return successResponse(EMPTY, 200, requestId);
  if (q.length > MAX_QUERY_LEN) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Search query is too long", 400, undefined, requestId);
  }

  const { id: userId, role } = auth.session.user;
  const isAdmin = isRole(role) && can(role, "resource:manage_all");
  const siteIds = isAdmin ? [] : (await getSitesBySupervisor(userId)).map((s) => s.siteId);

  // A supervisor with no sites can match nothing — skip the DB round-trip.
  if (!isAdmin && siteIds.length === 0) return successResponse(EMPTY, 200, requestId);

  try {
    const result = await searchRemarks({ q, limit, offset, scope: { isAdmin, siteIds } });
    return successResponse(result, 200, requestId);
  } catch (error) {
    // handleDbError maps known pg codes (FK/unique/…) and returns null otherwise.
    // A statement_timeout (57014) from an abandoned keystroke query falls through
    // to an explicit 503 rather than a generic 500.
    const mapped = handleDbError(error, requestId);
    if (mapped) return mapped;
    logError(requestId, error, { route: "search/remarks" });
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "Search failed", 503, undefined, requestId);
  }
});
