import { getActorRoleFromDb } from "@/lib/auth/actorRole";
import { can } from "@/lib/auth/capabilities";
import { createSupabaseServiceClient } from "@/lib/auth/config";
import type { Role } from "@/lib/auth/roles";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

export type AdminUserListItem = {
  userId: string;
  email: string | null;
  role: Role;
  designation: string | null;
  mustChangePassword: boolean;
};

export type AdminUserListResult =
  | { ok: true; users: AdminUserListItem[] }
  | { ok: false; reason: "forbidden" };

// Shared by GET /api/admin/users and the server-rendered admin users page
// (audit F16), so the page renders the list without fetching its own HTTP route
// — and, critically, cannot skip the checks below.
//
// SECURITY (§8.7 / audit S2): this read leaks every user id + email, so the
// actor's role is re-read from the DB rather than trusted from the JWT header.
// That denies a demoted admin still holding a valid token. Any caller that
// bypasses this helper loses that protection.
export async function listAdminUsers(actorId: string): Promise<AdminUserListResult> {
  const actorRole = await getActorRoleFromDb(actorId);
  if (!actorRole || !can(actorRole, "user:list")) {
    return { ok: false, reason: "forbidden" };
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
  // Paginate so tenants beyond 1000 accounts are not silently truncated (S2).
  const supabase = createSupabaseServiceClient();
  const emailById = new Map<string, string>();
  try {
    const perPage = 1000;
    for (let page = 1; ; page += 1) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage });
      const batch = data?.users ?? [];
      for (const user of batch) {
        if (user.id && user.email) emailById.set(user.id, user.email);
      }
      if (batch.length < perPage) break;
    }
  } catch {
    // Email enrichment is best-effort; the list still returns roles/ids.
  }

  return {
    ok: true,
    users: profiles.map((profile) => ({
      userId: profile.userId,
      email: emailById.get(profile.userId) ?? null,
      role: profile.role,
      designation: profile.designation,
      mustChangePassword: profile.mustChangePassword,
    })),
  };
}
