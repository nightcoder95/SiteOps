import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { invalidateUserProfileCache } from "@/lib/cache/invalidate";
import { userProfileCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";

type UserProfile = typeof userProfiles.$inferSelect;

const updateProfileSchema = z
  .object({
    phone: z.string().max(20).optional(),
    assignedRegion: z.string().max(100).optional(),
    designation: z.string().max(100).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAuth(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    const { value: profile } = await getOrSetJson<UserProfile | null>(
      requestId,
      userProfileCacheKey(auth.session.user.id),
      300,
      () =>
        db.query.userProfiles.findFirst({
          where: (t, { eq }) => eq(t.userId, auth.session.user.id),
        }).then((r) => r ?? null)
    );

    return successResponse(
      {
        user: auth.session.user,
        profile,
      },
      200,
      requestId
    );
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = generateRequestId();

  try {
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
      const current = await db.query.userProfiles.findFirst({
        where: (t, { eq: opEq }) => opEq(t.userId, auth.session.user.id),
      });

      const nextPhone = validation.data.phone ?? current?.phone ?? null;
      const nextAssignedRegion =
        validation.data.assignedRegion ?? current?.assignedRegion ?? null;
      const nextDesignation =
        validation.data.designation ?? current?.designation ?? null;

      await db
        .insert(userProfiles)
        .values({
          userId: auth.session.user.id,
          phone: nextPhone,
          assignedRegion: nextAssignedRegion,
          designation: nextDesignation,
        })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            phone: nextPhone,
            assignedRegion: nextAssignedRegion,
            designation: nextDesignation,
            updatedAt: new Date(),
          },
        });

      const profile = await db.query.userProfiles.findFirst({
        where: (t, { eq: opEq }) => opEq(t.userId, auth.session.user.id),
      });

      await invalidateUserProfileCache(auth.session.user.id, requestId);
      return successResponse(profile ?? null, 200, requestId);
    } catch (dbError) {
      const handled = handleDbError(dbError, requestId);
      if (handled) return handled;
      throw dbError;
    }
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
