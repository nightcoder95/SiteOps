// lib/export/userDirectory.ts
// Builds the userId -> { role, label } map the CSV view uses to render user-id
// columns as "Name (Role)". Role comes from user_profiles; the human name comes
// from Supabase auth.users (emails live there, not in our tables) via the
// service-role admin API, resolved through the shared displayName() fallback
// chain (fullName -> email-derived -> designation -> id). Email enrichment is
// best-effort: if the admin API is unavailable the label still resolves.
import { createSupabaseServiceClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import type { UserDirectory } from "@/lib/export/csvView";
import { displayName } from "@/lib/users/displayName";

export async function buildUserDirectory(): Promise<UserDirectory> {
  const rows = await db
    .select({
      userId: userProfiles.userId,
      role: userProfiles.role,
      fullName: userProfiles.fullName,
      designation: userProfiles.designation,
    })
    .from(userProfiles);

  const emailById = new Map<string, string>();
  try {
    const supabase = createSupabaseServiceClient();
    const perPage = 1000;
    for (let page = 1; ; page += 1) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage });
      const batch = data?.users ?? [];
      for (const u of batch) if (u.id && u.email) emailById.set(u.id, u.email);
      if (batch.length < perPage) break;
    }
  } catch {
    // Best-effort: names still resolve via fullName/designation/id fallbacks.
  }

  const dir = new Map<string, { role: string; label: string }>();
  for (const r of rows) {
    dir.set(r.userId, {
      role: r.role,
      label: displayName(
        { fullName: r.fullName, designation: r.designation },
        emailById.get(r.userId) ?? null,
        r.userId,
      ),
    });
  }
  return dir;
}
