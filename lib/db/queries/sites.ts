import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  expenseEntries,
  labourEntries,
  machineryEntries,
  materialEntries,
  sites,
} from "@/lib/db/schema";
import { calculateSiteTrackedSpend } from "@/lib/db/queries/operationTotals";

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

export async function getSiteTrackedSpend(siteId: string) {
  const [labour, material, machinery, expense] = await Promise.all([
    db.select().from(labourEntries).where(eq(labourEntries.siteId, siteId)),
    db.select().from(materialEntries).where(eq(materialEntries.siteId, siteId)),
    db.select().from(machineryEntries).where(eq(machineryEntries.siteId, siteId)),
    db.select().from(expenseEntries).where(eq(expenseEntries.siteId, siteId)),
  ]);

  return String(calculateSiteTrackedSpend({ labour, material, machinery, expense }));
}

export const getSiteTotalExpenses = getSiteTrackedSpend;
