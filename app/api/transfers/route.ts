import { and, desc, eq, or } from "drizzle-orm";

import { requireSiteAccess } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { resourceTransfers } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);

  const rows = auth.session.user.role === "Admin"
    ? await db.select().from(resourceTransfers).orderBy(desc(resourceTransfers.createdAt))
    : await db.select().from(resourceTransfers).where(
      or(
        eq(resourceTransfers.requestedByUserId, auth.session.user.id),
        and(eq(resourceTransfers.status, "Approved"), eq(resourceTransfers.approvedByUserId, auth.session.user.id)),
      ),
    ).orderBy(desc(resourceTransfers.createdAt));

  return successResponse(rows, 200, requestId);
});

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  if (auth.session.user.role !== "Supervisor") {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Only supervisors can create transfers", 403, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data as Record<string, unknown>;

  const fromSiteId = String(data.fromSiteId ?? "");
  const toSiteId = String(data.toSiteId ?? "");
  const resourceType = String(data.resourceType ?? "") as "Labour" | "Materials";
  const quantity = Number(data.quantity ?? 0);

  if (!fromSiteId || !toSiteId || !["Labour", "Materials"].includes(resourceType) || !Number.isFinite(quantity) || quantity <= 0) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid transfer payload", 400, undefined, requestId);
  }

  const inserted = await db.insert(resourceTransfers).values({
    fromSiteId,
    toSiteId,
    requestedByUserId: auth.session.user.id,
    resourceType,
    workTypeMode: data.workTypeMode ? String(data.workTypeMode) as "default_enum" | "custom" : null,
    workTypeEnum: data.workTypeEnum ? String(data.workTypeEnum) as any : null,
    workTypeCustomId: data.workTypeCustomId ? String(data.workTypeCustomId) : null,
    materialTypeMode: data.materialTypeMode ? String(data.materialTypeMode) as "default_enum" | "custom" : null,
    materialTypeEnum: data.materialTypeEnum ? String(data.materialTypeEnum) as any : null,
    materialTypeCustomId: data.materialTypeCustomId ? String(data.materialTypeCustomId) : null,
    unitMode: data.unitMode ? String(data.unitMode) as "master" | "custom" : null,
    unitMasterId: data.unitMasterId ? String(data.unitMasterId) : null,
    unitCustomId: data.unitCustomId ? String(data.unitCustomId) : null,
    quantity: String(quantity),
    remarks: data.remarks ? String(data.remarks) : null,
    status: "Pending",
  }).returning();

  return successResponse(inserted[0], 201, requestId);
});
