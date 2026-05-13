import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { expenseEntries, sites } from "@/lib/db/schema";

/**
 * Fetch a site by its public UUID.
 *
 * By default archived sites are excluded to match the behaviour of
 * `getAllSites` and `getSitesBySupervisor`. Pass `{ includeArchived: true }`
 * only when you explicitly need to inspect or restore an archived site.
 */
export async function getSiteById(
  id: string,
  { includeArchived = false }: { includeArchived?: boolean } = {}
) {
  const result = await db
    .select()
    .from(sites)
    .where(
      includeArchived
        ? eq(sites.siteId, id)
        : and(eq(sites.siteId, id), isNull(sites.archivedAt))
    );
  return result[0] ?? null;
}

export async function getSitesBySupervisor(supervisorId: string) {
  return db
    .select()
    .from(sites)
    .where(and(eq(sites.supervisorId, supervisorId), isNull(sites.archivedAt)));
}

export async function getAllSites() {
  return db.select().from(sites).where(isNull(sites.archivedAt));
}

export async function getSiteTotalExpenses(siteId: string) {
  const result = await db
    .select({ total: sql<string>`coalesce(sum(${expenseEntries.amount}), 0)` })
    .from(expenseEntries)
    .where(eq(expenseEntries.siteId, siteId));

  return result[0]?.total ?? "0";
}
