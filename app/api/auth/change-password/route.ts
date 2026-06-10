import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseAuthClient, createSupabaseServiceClient } from "@/lib/auth/config";
import { invalidateUserClaims } from "@/lib/auth/refreshClaims";
import { revokeUserSessions } from "@/lib/auth/sessions";
import { invalidateUserProfileCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const changePasswordSchema = z
  .object({
    // Re-auth: the caller must prove the current password (the temp password on
    // forced rotation, or their existing one on self-service). Closes the
    // hijacked-session takeover vector (S1) — no session can set a new password
    // without proof.
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(10).max(72),
  })
  .strict();

// Service-role endpoint: re-authenticate the caller, update the password, clear
// the must_change_password flag (source of truth), force a claim re-mint, and
// revoke every existing session so a stolen token cannot survive the rotation.
// Because all sessions (including the caller's) are revoked, the client signs
// out and re-authenticates with the new password — no stale must_change_password
// claim can bounce the redirect (§4.4).
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId),
    );
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(changePasswordSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  const userId = auth.session.user.id;
  const supabase = createSupabaseServiceClient();

  // Resolve the canonical email from auth.users (the forwarded header may be
  // empty) so the re-auth check below can't be skipped.
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? auth.session.user.email;
  if (!email) {
    return withNoStore(
      errorResponse(ERROR_CODES.INTERNAL_ERROR, "Account email unavailable", 500, undefined, requestId),
    );
  }

  // Re-authenticate with the supplied current password on an isolated client
  // (noop cookies — never touches the caller's session).
  const authClient = createSupabaseAuthClient();
  const { error: reauthError } = await authClient.auth.signInWithPassword({
    email,
    password: validation.data.currentPassword,
  });
  if (reauthError) {
    return withNoStore(
      errorResponse(ERROR_CODES.UNAUTHORIZED, "Current password is incorrect", 401, undefined, requestId),
    );
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: validation.data.newPassword,
  });
  if (updateError) {
    return withNoStore(
      errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        updateError.message ?? "Failed to update password",
        400,
        undefined,
        requestId,
      ),
    );
  }

  await db
    .update(userProfiles)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));

  // Re-mint so the cleared must_change_password claim takes effect, drop the
  // cached profile, and revoke all live sessions (kills any stolen token).
  await invalidateUserClaims(userId);
  await invalidateUserProfileCache(userId, requestId);
  await revokeUserSessions(userId);

  return withNoStore(successResponse({ success: true }, 200, requestId));
});
