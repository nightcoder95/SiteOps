import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

// Revoke all of a user's live sessions by deleting their rows from
// auth.sessions. supabase-js exposes no admin "sign out by user id"
// (admin.signOut needs the user's JWT), so we delete the sessions directly
// through the service-role DB connection. GoTrue's refresh_tokens.session_id
// FK is ON DELETE CASCADE, so dropping a session invalidates its refresh
// tokens too — a stolen/borrowed session cannot survive a password rotation
// or a role demotion past this call (only the short access-token TTL remains).
//
// invalidateUserClaims() only bumps app_metadata to force a re-mint; it does
// NOT revoke. Use this when access must be cut immediately.
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.execute(sql`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid`);
}
