import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { invalidateUserProfileCache } from "@/lib/cache/invalidate";
import { userProfileCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { measureDbQuery } from "@/lib/db/timing";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

type UserProfile = typeof userProfiles.$inferSelect;

const updateProfileSchema = z
  .object({
    phone: z.string().max(20).optional(),
    assignedRegion: z.string().max(100).optional(),
    designation: z.string().max(100).optional(),
    fullName: z.string().max(120).optional(),
  })
  .strict();

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { value: profile } = await getOrSetJson<UserProfile | null>(
    requestId,
    userProfileCacheKey(auth.session.user.id),
    300,
    () =>
      measureDbQuery(requestId, "users.me.profile", () =>
        db.query.userProfiles
          .findFirst({
            where: (t, { eq }) => eq(t.userId, auth.session.user.id),
          })
          .then((r) => r ?? null)
      )
  );

  return successResponse(
    {
      user: auth.session.user,
      profile,
    },
    200,
    requestId
  );
});

export const PATCH = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireAuth(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(updateProfileSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  try {
    const current = await measureDbQuery(requestId, "users.me.profile.read", () =>
      db.query.userProfiles.findFirst({
        where: (t, { eq: opEq }) => opEq(t.userId, auth.session.user.id),
      })
    );

    const nextPhone = validation.data.phone ?? current?.phone ?? null;
    const nextAssignedRegion =
      validation.data.assignedRegion ?? current?.assignedRegion ?? null;
    const nextDesignation =
      validation.data.designation ?? current?.designation ?? null;
    const nextFullName =
      validation.data.fullName ?? current?.fullName ?? null;

    await measureDbQuery(requestId, "users.me.profile.upsert", () =>
      db
        .insert(userProfiles)
        .values({
          userId: auth.session.user.id,
          phone: nextPhone,
          assignedRegion: nextAssignedRegion,
          designation: nextDesignation,
          fullName: nextFullName,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            phone: nextPhone,
            assignedRegion: nextAssignedRegion,
            designation: nextDesignation,
            fullName: nextFullName,
            updatedAt: new Date(),
          },
        })
    );

    const profile = await measureDbQuery(requestId, "users.me.profile.read.updated", () =>
      db.query.userProfiles.findFirst({
        where: (t, { eq: opEq }) => opEq(t.userId, auth.session.user.id),
      })
    );

    await invalidateUserProfileCache(auth.session.user.id, requestId);
    // Mirror GET's `{ user, profile }` shape so the client can write the response
    // straight into the /api/users/me cache without losing `user` or the nested
    // `profile` (revalidate:false).
    return successResponse(
      { user: auth.session.user, profile: profile ?? null },
      200,
      requestId,
    );
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
