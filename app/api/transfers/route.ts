import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { can } from "@/lib/auth/capabilities";
import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { resourceTransfers } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { MAX_QUANTITY } from "@/lib/validation/constants";

const labourDefaultTypes = [
  "Steel work",
  "Shuttering",
  "Brick work",
  "Concrete work",
  "Plastering",
  "Electric work",
  "Plumbing",
  "Tile work",
  "Wood work",
  "Paint work",
] as const;

const materialDefaultTypes = ["Cement", "M sand", "P sand", "Metal"] as const;

const transferSchema = z
  .object({
    fromSiteId: z.string().uuid(),
    toSiteId: z.string().uuid(),
    resourceType: z.enum(["Labour", "Materials", "Money", "Machinery"]),
    quantity: z.number().positive().max(MAX_QUANTITY),
    remarks: z.string().max(500).optional(),
    workTypeMode: z.enum(["default_enum", "custom"]).optional(),
    workTypeEnum: z.enum(labourDefaultTypes).optional(),
    workTypeCustomId: z.string().uuid().optional(),
    materialTypeMode: z.enum(["default_enum", "custom"]).optional(),
    materialTypeEnum: z.enum(materialDefaultTypes).optional(),
    materialTypeCustomId: z.string().uuid().optional(),
    unitMode: z.enum(["master", "custom"]).optional(),
    unitMasterId: z.string().uuid().optional(),
    unitCustomId: z.string().uuid().optional(),
  })
  .refine((v) => v.fromSiteId !== v.toSiteId, {
    message: "Source and destination sites must differ",
    path: ["toSiteId"],
  });

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);

  const rows = can(auth.session.user.role, "resource:manage_all")
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
  const validation = validateBody(transferSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const data = validation.data;

  // Both sites must exist and be active. The requester must supervise the
  // source site — without this check any supervisor could move resources
  // out of a site they have no access to.
  const [fromSite, toSite] = await Promise.all([
    db.query.sites.findFirst({
      where: (t, { eq: opEq }) => opEq(t.siteId, data.fromSiteId),
      columns: { supervisorId: true, archivedAt: true },
    }),
    db.query.sites.findFirst({
      where: (t, { eq: opEq }) => opEq(t.siteId, data.toSiteId),
      columns: { archivedAt: true },
    }),
  ]);

  if (!fromSite || fromSite.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Source site not found", 404, undefined, requestId);
  }
  if (!toSite || toSite.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Destination site not found", 404, undefined, requestId);
  }
  if (!checkOwnership(auth.session.user, fromSite.supervisorId)) {
    return errorResponse(
      ERROR_CODES.FORBIDDEN,
      "You can only transfer resources from sites you supervise",
      403,
      undefined,
      requestId,
    );
  }

  try {
    const inserted = await db
      .insert(resourceTransfers)
      .values({
        fromSiteId: data.fromSiteId,
        toSiteId: data.toSiteId,
        requestedByUserId: auth.session.user.id,
        resourceType: data.resourceType,
        workTypeMode: data.workTypeMode ?? null,
        workTypeEnum: data.workTypeEnum ?? null,
        workTypeCustomId: data.workTypeCustomId ?? null,
        materialTypeMode: data.materialTypeMode ?? null,
        materialTypeEnum: data.materialTypeEnum ?? null,
        materialTypeCustomId: data.materialTypeCustomId ?? null,
        unitMode: data.unitMode ?? null,
        unitMasterId: data.unitMasterId ?? null,
        unitCustomId: data.unitCustomId ?? null,
        quantity: String(data.quantity),
        remarks: data.remarks ?? null,
        status: "Pending",
      })
      .returning();

    return successResponse(inserted[0], 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
