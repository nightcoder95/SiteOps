import { eq } from "drizzle-orm";

import { createSupabaseServiceClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { displayName } from "@/lib/users/displayName";

export type SupervisorOption = { userId: string; displayName: string };

/**
 * Supervisor accounts with a human display name. Emails live in Supabase
 * auth.users, so merge them via the service-role admin API (best-effort) and
 * resolve a label through displayName(): fullName → email → designation → id.
 */
export async function listSupervisors(): Promise<SupervisorOption[]> {
  const rows = await db
    .select({
      userId: userProfiles.userId,
      fullName: userProfiles.fullName,
      designation: userProfiles.designation,
    })
    .from(userProfiles)
    .where(eq(userProfiles.role, "Supervisor"));

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
    // Email enrichment is best-effort; names still resolve via fallbacks.
  }

  return rows.map((r) => ({
    userId: r.userId,
    displayName: displayName(
      { fullName: r.fullName, designation: r.designation },
      emailById.get(r.userId) ?? null,
      r.userId,
    ),
  }));
}
