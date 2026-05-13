import { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { unitMaster } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { generateRequestId } from "@/lib/utils/requestId";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  const rows = await db.select().from(unitMaster);
  return successResponse(rows, 200, requestId);
}
