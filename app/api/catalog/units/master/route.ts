import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { unitMaster } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  const rows = await db.select().from(unitMaster);
  return successResponse(rows, 200, requestId);
});
