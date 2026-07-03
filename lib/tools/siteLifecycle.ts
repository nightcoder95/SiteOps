import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { toolAssignments, toolMovements, tools } from "@/lib/db/schema";

import { WAREHOUSE } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Auto-return every tool assignment held by a site to the warehouse, ledgered.
// MUST run in the SAME tx that flips the site's archived_at / is_deleted, so the
// ledger always reconciles and no assignment is orphaned (case 8, §19 pitfall 2).
// The FK onDelete cascade on tool_assignments.site_id is a backstop only — this
// is the ledgered path. Sites are never hard-deleted; if that ever changes it
// MUST route through here too.
export async function returnSiteToolsOnLifecycle(
  tx: Tx,
  siteId: string,
  actorUserId: string,
  note: "site_archived" | "site_deleted",
): Promise<void> {
  const rows = await tx
    .select({ toolId: toolAssignments.toolId, qty: toolAssignments.quantity })
    .from(toolAssignments)
    .where(eq(toolAssignments.siteId, siteId));

  for (const row of rows) {
    await tx.insert(toolMovements).values({
      toolId: row.toolId,
      fromLocation: siteId,
      toLocation: WAREHOUSE,
      quantity: row.qty,
      kind: "return",
      note,
      actorUserId,
    });
    await tx
      .delete(toolAssignments)
      .where(and(eq(toolAssignments.toolId, row.toolId), eq(toolAssignments.siteId, siteId)));
    await tx
      .update(tools)
      .set({ version: sql`${tools.version} + 1`, updatedAt: new Date() })
      .where(eq(tools.toolId, row.toolId));
  }
}
