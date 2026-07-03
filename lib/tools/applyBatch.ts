import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sites, toolAssignments, toolMovements, tools } from "@/lib/db/schema";

import { diffAssignments, type AssignmentDiff } from "./diff";
import { validateDistribution } from "./invariant";
import { EXTERNAL, WAREHOUSE, type AssignmentInput, type InvalidReason } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FreshTool = {
  toolId: string;
  name: string;
  code: string;
  categoryId: string;
  totalQuantity: number;
  icon: string | null;
  version: number;
  free: number;
  assignments: AssignmentInput[];
};

export type ToolPayload = {
  toolId: string;
  version: number;
  totalQuantity?: number; // omitted → total unchanged (§6)
  assignments?: AssignmentInput[]; // omitted → distribution untouched (§6)
};

export type ApplyResult =
  | { toolId: string; status: "ok" | "conflict"; tool: FreshTool }
  | { toolId: string; status: "invalid"; reason: InvalidReason; tool: FreshTool };

// Raised when the tool row is missing/deleted under the lock. The batch route
// converts it into a per-tool `invalid: not_found` result so one bad id never
// fails the whole batch.
export class ToolNotFound extends Error {
  constructor(public readonly toolId: string) {
    super(`tool not found: ${toolId}`);
    this.name = "ToolNotFound";
  }
}

type ToolRow = typeof tools.$inferSelect;

async function readAssignments(tx: Tx, toolId: string): Promise<AssignmentInput[]> {
  const rows = await tx
    .select({ siteId: toolAssignments.siteId, qty: toolAssignments.quantity })
    .from(toolAssignments)
    .where(eq(toolAssignments.toolId, toolId));
  return rows.map((r) => ({ siteId: r.siteId, qty: r.qty }));
}

function toFresh(tool: ToolRow, assignments: AssignmentInput[]): FreshTool {
  const assigned = assignments.reduce((s, a) => s + a.qty, 0);
  return {
    toolId: tool.toolId,
    name: tool.name,
    code: tool.code,
    categoryId: tool.categoryId,
    totalQuantity: tool.totalQuantity,
    icon: tool.icon,
    version: tool.version,
    free: tool.totalQuantity - assigned,
    assignments,
  };
}

// Apply ONE tool in its OWN transaction (§6). Callers (the batch route) invoke
// this SEQUENTIALLY on the single shared pool — never in parallel. Sequential +
// single-connection is deliberate: parallel txs would multiply connection
// demand and risk the pooler exhaustion this codebase already fought.
export async function applyOneTool(payload: ToolPayload, actorUserId: string): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    // 1. Lock the tool row to serialize concurrent writers on the same tool.
    const locked = await tx
      .select()
      .from(tools)
      .where(and(eq(tools.toolId, payload.toolId), eq(tools.isDeleted, false)))
      .for("update")
      .limit(1);
    const tool = locked[0];
    if (!tool) throw new ToolNotFound(payload.toolId);

    const current = await readAssignments(tx, payload.toolId);

    // 2. Version check → conflict (no writes).
    if (tool.version !== payload.version) {
      return { toolId: payload.toolId, status: "conflict", tool: toFresh(tool, current) };
    }

    // Field-presence semantics (§6): omitted → untouched.
    const nextTotal = payload.totalQuantity ?? tool.totalQuantity;
    const desired: AssignmentInput[] = payload.assignments ?? current.map((a) => ({ ...a }));
    const currentSum = current.reduce((s, a) => s + a.qty, 0);

    // 3a. Structural checks on the new total apply in every path.
    if (!Number.isInteger(nextTotal)) {
      return { toolId: payload.toolId, status: "invalid", reason: "non_integer", tool: toFresh(tool, current) };
    }
    if (nextTotal < 0) {
      return { toolId: payload.toolId, status: "invalid", reason: "negative_total", tool: toFresh(tool, current) };
    }

    // 3b. case 2 / case 14: when assignments are NOT present, desired Σ equals
    // currentSum, so dropping total below it means retiring deployed units — that
    // is `total_below_assigned`, NOT the payload-level `sum_exceeds_total`. This
    // check MUST precede validateDistribution, which would otherwise report the
    // less specific sum_exceeds_total for the omitted-assignments path.
    if (payload.assignments === undefined && nextTotal < currentSum) {
      return {
        toolId: payload.toolId,
        status: "invalid",
        reason: "total_below_assigned",
        tool: toFresh(tool, current),
      };
    }

    // 3c. Full structural + aggregate invariant on the desired end-state
    // (authoritative for the assignments-present path).
    const inv = validateDistribution({
      totalQuantity: nextTotal,
      assignments: desired.filter((a) => a.qty > 0),
    });
    if (!inv.ok) {
      return { toolId: payload.toolId, status: "invalid", reason: inv.reason, tool: toFresh(tool, current) };
    }

    // 3b. case 5: every desired site must exist, be active (not archived), not
    // deleted — checked against committed state under the lock.
    if (payload.assignments && payload.assignments.length > 0) {
      const siteIds = payload.assignments.map((a) => a.siteId);
      const live = await tx
        .select({ siteId: sites.siteId })
        .from(sites)
        .where(
          and(
            inArray(sites.siteId, siteIds),
            sql`${sites.archivedAt} IS NULL`,
            eq(sites.isDeleted, false),
          ),
        );
      const liveSet = new Set(live.map((s) => s.siteId));
      if (siteIds.some((id) => !liveSet.has(id))) {
        return {
          toolId: payload.toolId,
          status: "invalid",
          reason: "site_unavailable",
          tool: toFresh(tool, current),
        };
      }
    }

    // 5. Apply: diff desired vs current (only when assignments present).
    const diff: AssignmentDiff = payload.assignments
      ? diffAssignments(current, payload.assignments)
      : { inserts: [], updates: [], deletes: [], movements: [] };

    for (const ins of diff.inserts) {
      await tx.insert(toolAssignments).values({ toolId: payload.toolId, siteId: ins.siteId, quantity: ins.qty });
    }
    for (const up of diff.updates) {
      await tx
        .update(toolAssignments)
        .set({ quantity: up.qty, updatedAt: new Date() })
        .where(and(eq(toolAssignments.toolId, payload.toolId), eq(toolAssignments.siteId, up.siteId)));
    }
    if (diff.deletes.length > 0) {
      await tx
        .delete(toolAssignments)
        .where(and(eq(toolAssignments.toolId, payload.toolId), inArray(toolAssignments.siteId, diff.deletes)));
    }

    // Ledger: assign/return deltas (site ↔ warehouse).
    for (const m of diff.movements) {
      await tx.insert(toolMovements).values({
        toolId: payload.toolId,
        fromLocation: m.kind === "assign" ? WAREHOUSE : m.siteId,
        toLocation: m.kind === "assign" ? m.siteId : WAREHOUSE,
        quantity: m.qty,
        kind: m.kind,
        actorUserId,
      });
    }

    // Ledger: total change → procure (EXTERNAL→WAREHOUSE) / retire (WAREHOUSE→EXTERNAL).
    if (nextTotal !== tool.totalQuantity) {
      const delta = nextTotal - tool.totalQuantity;
      await tx.insert(toolMovements).values({
        toolId: payload.toolId,
        fromLocation: delta > 0 ? EXTERNAL : WAREHOUSE,
        toLocation: delta > 0 ? WAREHOUSE : EXTERNAL,
        quantity: Math.abs(delta),
        kind: delta > 0 ? "procure" : "retire",
        actorUserId,
      });
    }

    // Current-state: bump total, version, actor.
    const newVersion = tool.version + 1;
    await tx
      .update(tools)
      .set({ totalQuantity: nextTotal, version: newVersion, updatedByUserId: actorUserId, updatedAt: new Date() })
      .where(eq(tools.toolId, payload.toolId));

    const nextAssignments = await readAssignments(tx, payload.toolId);
    const updatedRow: ToolRow = { ...tool, totalQuantity: nextTotal, version: newVersion };
    return { toolId: payload.toolId, status: "ok", tool: toFresh(updatedRow, nextAssignments) };
  });
}
