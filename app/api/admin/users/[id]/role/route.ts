import { eq } from "drizzle-orm";
import { z } from "zod";

import { scheduleAudit } from "@/lib/audit/log";
import { getActorRoleFromDb } from "@/lib/auth/actorRole";
import { can } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { invalidateUserClaims } from "@/lib/auth/refreshClaims";
import { revokeUserSessions } from "@/lib/auth/sessions";
import { ROLES, ROLES_TUPLE, type Role } from "@/lib/auth/roles";
import { invalidateUserProfileCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { resolveRoleChange, type RoleChangeOutcome } from "@/lib/services/users";

type RouteCtx = { params: Promise<{ id: string }> };

const updateRoleSchema = z.object({ role: z.enum(ROLES_TUPLE) }).strict();

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "user:manage_roles");
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId),
    );
  }

  // Stateful actor-role check (§8.7): authorize against the DB role, not the JWT.
  const actorRole = await getActorRoleFromDb(auth.session.user.id);
  if (!actorRole || !can(actorRole, "user:manage_roles")) {
    return withNoStore(
      errorResponse(ERROR_CODES.FORBIDDEN, "Admin access required", 403, undefined, requestId),
    );
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(updateRoleSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  const { id } = await context.params;
  const newRole = validation.data.role as (typeof userProfiles.$inferInsert)["role"];

  let outcome: RoleChangeOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      // Lock all Admin rows so concurrent demotions serialize and cannot both
      // pass a stale count and leave zero admins (§8.2 / §8.3).
      const admins = await tx
        .select({ userId: userProfiles.userId })
        .from(userProfiles)
        .where(eq(userProfiles.role, ROLES.ADMIN))
        .for("update");

      const target = await tx
        .select({ role: userProfiles.role })
        .from(userProfiles)
        .where(eq(userProfiles.userId, id))
        .limit(1);

      const decision = resolveRoleChange({
        adminCount: admins.length,
        currentRole: (target[0]?.role as Role | undefined) ?? null,
        newRole: newRole as Role,
      });

      if (decision.type === "ok") {
        await tx
          .update(userProfiles)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(userProfiles.userId, id));
      }

      return decision;
    });
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return withNoStore(handled);
    throw dbError;
  }

  if (outcome.type === "not_found") {
    return withNoStore(errorResponse(ERROR_CODES.NOT_FOUND, "User not found", 404, undefined, requestId));
  }
  if (outcome.type === "last_admin") {
    return withNoStore(
      errorResponse(
        ERROR_CODES.CONFLICT,
        "Cannot demote the only remaining admin",
        409,
        undefined,
        requestId,
      ),
    );
  }
  if (outcome.type === "noop") {
    return withNoStore(
      successResponse(
        { userId: id, role: outcome.role, changed: false },
        200,
        requestId,
      ),
    );
  }

  // Force a re-mint so the new role takes effect on next refresh, and drop any
  // cached profile so server reads pick up the change immediately.
  await invalidateUserClaims(id);
  await invalidateUserProfileCache(id, requestId);

  // On a demotion (Admin → lower), revoke the target's live sessions so they
  // lose elevated access immediately rather than after the JWT TTL — closes the
  // write-path half of S2. Promotions don't need it.
  if (outcome.demoted) {
    await revokeUserSessions(id);
  }

  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "role.changed",
    resourceType: "user",
    resourceId: id,
    allowed: true,
    role: actorRole,
    metadata: { from: outcome.previousRole, to: newRole },
  });

  return withNoStore(
    successResponse(
      {
        userId: id,
        role: newRole,
        changed: true,
        note: "Role change takes effect on the user's next token refresh.",
      },
      200,
      requestId,
    ),
  );
});
