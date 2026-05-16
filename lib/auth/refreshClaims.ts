import { createSupabaseServiceClient } from "@/lib/auth/config";

// Force Supabase to re-mint a user's JWT on next refresh so updated values
// (role, etc.) injected by the custom_access_token hook take effect quickly.
//
// Call this from any privileged route that mutates a user's role or
// permissions. Until the user's existing access token expires, they will
// still carry stale claims — this is bounded by the JWT TTL (default 1h).
// For immediate revocation, also call signOut for that user.
export async function invalidateUserClaims(userId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { _claims_refreshed_at: Date.now() },
  });
}
