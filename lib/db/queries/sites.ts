import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";

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

// Accepts the shared db or a transaction handle (for tests).
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

// Per-site tracked spend computed entirely in SQL — previously this pulled every
// entry row for the site into JS just to sum them (unbounded transfer). The labour
// branch mirrors calculateLabourTotal: prefer the mason+helper split (each role
// costs count × per-person wage), else the stored salary, else
// people_count * wage_per_head. NULL numerics coalesce to 0.
export async function siteTrackedSpend(executor: Executor, siteId: string): Promise<string> {
  const rows = (await executor.execute(sql`
    select
      coalesce((
        select sum(
          case
            when coalesce(mason_count,0) * coalesce(mason_salary_amount,0)
               + coalesce(helper_count,0) * coalesce(helper_salary_amount,0) > 0
              then coalesce(mason_count,0) * coalesce(mason_salary_amount,0)
                 + coalesce(helper_count,0) * coalesce(helper_salary_amount,0)
            when coalesce(salary_amount,0) > 0 then salary_amount
            else coalesce(people_count,0) * coalesce(wage_per_head,0)
          end
        ) from labour_entries where site_id = ${siteId}::uuid
      ), 0)
      + coalesce((select sum(coalesce(cost,0)) from material_entries where site_id = ${siteId}::uuid), 0)
      + coalesce((select sum(coalesce(total_cost,0)) from machinery_entries where site_id = ${siteId}::uuid), 0)
      + coalesce((select sum(coalesce(amount,0)) from expense_entries where site_id = ${siteId}::uuid), 0)
      as total
  `)) as Array<{ total: string | number }>;
  return String(Number(rows[0]?.total ?? 0));
}

export async function getSiteTrackedSpend(siteId: string) {
  return siteTrackedSpend(db, siteId);
}

export const getSiteTotalExpenses = getSiteTrackedSpend;
