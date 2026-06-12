import { z } from "zod";

import { scheduleAudit } from "@/lib/audit/log";
import { getActorRoleFromDb } from "@/lib/auth/actorRole";
import { can } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import {
  customLabourTypes,
  customMachineryTypes,
  customMaterialTypes,
  customUnits,
  expenseEntries,
  fieldRequests,
  genericEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
  notifications,
  resourceRequests,
  resourceTransfers,
  sites,
} from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const PURGE_PHRASE = "I am Sure";
const purgeSchema = z.object({ confirm: z.literal(PURGE_PHRASE) }).strict();

// POST /api/admin/purge — tenant-wide hard delete of all domain data. Keeps user
// accounts/profiles and the master catalog (unit_master, default categories).
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:delete");
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId),
    );
  }

  // Stateful actor-role re-check (§8.7) — never trust the JWT header alone for a
  // destructive, irreversible operation.
  const actorRole = await getActorRoleFromDb(auth.session.user.id);
  if (!actorRole || !can(actorRole, "site:delete")) {
    return withNoStore(
      errorResponse(ERROR_CODES.FORBIDDEN, "Admin access required", 403, undefined, requestId),
    );
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(purgeSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  // Children before parents. Custom catalog references user_profiles (kept).
  await db.transaction(async (tx) => {
    await tx.delete(genericEntries);
    await tx.delete(labourEntries);
    await tx.delete(materialEntries);
    await tx.delete(machineryEntries);
    await tx.delete(expenseEntries);
    await tx.delete(incidentReports);
    await tx.delete(fieldRequests);
    await tx.delete(resourceRequests);
    await tx.delete(resourceTransfers);
    await tx.delete(notifications);
    await tx.delete(customUnits);
    await tx.delete(customLabourTypes);
    await tx.delete(customMaterialTypes);
    await tx.delete(customMachineryTypes);
    await tx.delete(sites);
  });

  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "tenant.purged",
    resourceType: "tenant",
    resourceId: null,
    allowed: true,
    role: actorRole,
    metadata: {},
  });

  return withNoStore(successResponse(null, 200, requestId));
});
