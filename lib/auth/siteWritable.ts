import type { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";

// The auth + site-lookup + archived + ownership preamble that was copy-pasted
// verbatim into all four entry POST routes. Returns either the session and site
// row, or a ready-to-return error Response — callers never re-derive statuses.
//
// `forbiddenMessage` is required, not defaulted: the entry routes' copy is
// entry-specific ("You can only log entries for sites you supervise") and is
// asserted by their route tests. A default would let a caller ship wrong copy.
export async function assertSiteWritable(input: {
  request: NextRequest;
  siteId: string;
  requestId: string;
  forbiddenMessage: string;
}) {
  const { request, siteId, requestId, forbiddenMessage } = input;

  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return {
      ok: false as const,
      response: errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId),
    };
  }

  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    // budget/name are a superset of what the four entry routes need: expenses
    // reads budget for its threshold notification. Selecting them here keeps
    // every caller at exactly one site lookup instead of two.
    columns: { supervisorId: true, archivedAt: true, budget: true, name: true },
  });

  // Archived folds into 404 exactly as the routes have always done — an
  // archived site is deliberately indistinguishable from a missing one here.
  if (!site || site.archivedAt) {
    return {
      ok: false as const,
      response: errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId),
    };
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return {
      ok: false as const,
      response: errorResponse(ERROR_CODES.FORBIDDEN, forbiddenMessage, 403, undefined, requestId),
    };
  }

  return { ok: true as const, site, session: auth.session };
}
