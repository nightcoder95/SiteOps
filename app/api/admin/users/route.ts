import { z } from "zod";

import { scheduleAudit } from "@/lib/audit/log";
import { getActorRoleFromDb } from "@/lib/auth/actorRole";
import { can } from "@/lib/auth/capabilities";
import { createSupabaseServiceClient } from "@/lib/auth/config";
import { requireCapability } from "@/lib/auth/guards";
import { ALL_ROLES } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const roleEnum = z.enum(ALL_ROLES as unknown as [string, ...string[]]);

const createUserSchema = z
  .object({
    email: z.string().email().max(255),
    tempPassword: z.string().min(8).max(72), // bcrypt hard-caps at 72 bytes
    role: roleEnum,
    designation: z.string().max(100).optional(),
    phone: z.string().max(20).optional(),
    assignedRegion: z.string().max(100).optional(),
  })
  .strict();

// GET /api/admin/users — list provisioned accounts (id, email, role, designation).
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "user:list");
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId),
    );
  }

  const profiles = await db
    .select({
      userId: userProfiles.userId,
      role: userProfiles.role,
      designation: userProfiles.designation,
      mustChangePassword: userProfiles.mustChangePassword,
    })
    .from(userProfiles);

  // Emails live in auth.users — fetch via the service-role admin API and merge.
  const supabase = createSupabaseServiceClient();
  const emailById = new Map<string, string>();
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }
  } catch {
    // Email enrichment is best-effort; the list still returns roles/ids.
  }

  const users = profiles.map((p) => ({
    userId: p.userId,
    email: emailById.get(p.userId) ?? null,
    role: p.role,
    designation: p.designation,
    mustChangePassword: p.mustChangePassword,
  }));

  return withNoStore(successResponse(users, 200, requestId));
});

// POST /api/admin/users — provision an account (closed/invite-only model).
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "user:create");
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId),
    );
  }

  // Stateful actor-role check (§8.7): re-read the actor's role from the DB,
  // bypassing the JWT header, to close the stale-token escalation window.
  const actorRole = await getActorRoleFromDb(auth.session.user.id);
  if (!actorRole || !can(actorRole, "user:create")) {
    return withNoStore(
      errorResponse(ERROR_CODES.FORBIDDEN, "Admin access required", 403, undefined, requestId),
    );
  }

  // Validate locally before touching GoTrue so a bad body never creates an auth user.
  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(createUserSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  const { email, tempPassword, role, designation, phone, assignedRegion } = validation.data;

  const supabase = createSupabaseServiceClient();
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError || !authUser?.user) {
    const message = authError?.message ?? "Failed to create account";
    // 422 from GoTrue typically means the email already exists.
    const status = authError?.status === 422 ? 409 : 400;
    return withNoStore(
      errorResponse(
        status === 409 ? ERROR_CODES.CONFLICT : ERROR_CODES.VALIDATION_ERROR,
        message,
        status,
        undefined,
        requestId,
      ),
    );
  }

  try {
    await db.insert(userProfiles).values({
      userId: authUser.user.id,
      role: role as (typeof userProfiles.$inferInsert)["role"],
      mustChangePassword: true,
      designation: designation ?? null,
      phone: phone ?? null,
      assignedRegion: assignedRegion ?? null,
    });
  } catch (dbError) {
    // Compensating action: GoTrue + Postgres can't share one transaction, so
    // roll back the just-created auth user to avoid an orphan.
    await supabase.auth.admin.deleteUser(authUser.user.id).catch(() => {});
    const handled = handleDbError(dbError, requestId);
    if (handled) return withNoStore(handled);
    throw dbError;
  }

  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "user.created",
    resourceType: "user",
    resourceId: authUser.user.id,
    allowed: true,
    role: actorRole,
    metadata: { email, role },
  });

  return withNoStore(
    successResponse(
      { userId: authUser.user.id, email, role, mustChangePassword: true },
      201,
      requestId,
    ),
  );
});
