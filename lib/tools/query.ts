import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { toolAssignments, toolCategories, toolMovements, tools } from "@/lib/db/schema";

import type { AssignmentInput } from "./types";
import type { FreshTool } from "./applyBatch";

// List non-deleted tools with computed `free` and their assignments. Two queries
// (tools, then assignments for those tools) — NOT N+1. Optional `q` filters by
// name or code (case-insensitive).
export async function listTools(q?: string): Promise<FreshTool[]> {
  const trimmed = q?.trim();
  const where = trimmed
    ? and(
        eq(tools.isDeleted, false),
        or(ilike(tools.name, `%${trimmed}%`), ilike(tools.code, `%${trimmed}%`)),
      )
    : eq(tools.isDeleted, false);

  const toolRows = await db
    .select()
    .from(tools)
    .where(where)
    .orderBy(desc(tools.createdAt));

  if (toolRows.length === 0) return [];

  const ids = toolRows.map((t) => t.toolId);
  const assignmentRows = await db
    .select({ toolId: toolAssignments.toolId, siteId: toolAssignments.siteId, qty: toolAssignments.quantity })
    .from(toolAssignments)
    .where(inArray(toolAssignments.toolId, ids));

  const byTool = new Map<string, AssignmentInput[]>();
  for (const r of assignmentRows) {
    const list = byTool.get(r.toolId) ?? [];
    list.push({ siteId: r.siteId, qty: r.qty });
    byTool.set(r.toolId, list);
  }

  return toolRows.map((t) => {
    const assignments = byTool.get(t.toolId) ?? [];
    const assigned = assignments.reduce((s, a) => s + a.qty, 0);
    return {
      toolId: t.toolId,
      name: t.name,
      code: t.code,
      categoryId: t.categoryId,
      totalQuantity: t.totalQuantity,
      icon: t.icon,
      version: t.version,
      free: t.totalQuantity - assigned,
      assignments,
    };
  });
}

// Single non-deleted tool + its assignments, or null.
export async function getTool(toolId: string): Promise<FreshTool | null> {
  const t = (
    await db
      .select()
      .from(tools)
      .where(and(eq(tools.toolId, toolId), eq(tools.isDeleted, false)))
      .limit(1)
  )[0];
  if (!t) return null;

  const assignmentRows = await db
    .select({ siteId: toolAssignments.siteId, qty: toolAssignments.quantity })
    .from(toolAssignments)
    .where(eq(toolAssignments.toolId, toolId));
  const assignments = assignmentRows.map((r) => ({ siteId: r.siteId, qty: r.qty }));
  const assigned = assignments.reduce((s, a) => s + a.qty, 0);

  return {
    toolId: t.toolId,
    name: t.name,
    code: t.code,
    categoryId: t.categoryId,
    totalQuantity: t.totalQuantity,
    icon: t.icon,
    version: t.version,
    free: t.totalQuantity - assigned,
    assignments,
  };
}

export type MovementRow = typeof toolMovements.$inferSelect;

// Per-tool ledger timeline, newest first, paginated.
export async function listToolMovements(toolId: string, limit: number, offset: number): Promise<MovementRow[]> {
  return db
    .select()
    .from(toolMovements)
    .where(eq(toolMovements.toolId, toolId))
    .orderBy(desc(toolMovements.createdAt))
    .limit(limit)
    .offset(offset);
}

// Delete all movement history for a tool. Returns the number of rows deleted.
export async function clearToolMovements(toolId: string): Promise<number> {
  const result = await db
    .delete(toolMovements)
    .where(eq(toolMovements.toolId, toolId))
    .returning({ id: toolMovements.movementId });
  return result.length;
}

// Global ledger feed with optional filters (tool, site → from/to location, kind).
export async function listGlobalMovements(
  filters: { toolId?: string; siteId?: string; kind?: string },
  limit: number,
  offset: number,
): Promise<MovementRow[]> {
  const conds = [];
  if (filters.toolId) conds.push(eq(toolMovements.toolId, filters.toolId));
  if (filters.kind) conds.push(eq(toolMovements.kind, filters.kind));
  if (filters.siteId) {
    conds.push(
      or(eq(toolMovements.fromLocation, filters.siteId), eq(toolMovements.toLocation, filters.siteId))!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select()
    .from(toolMovements)
    .where(where)
    .orderBy(desc(toolMovements.createdAt))
    .limit(limit)
    .offset(offset);
}

export type ToolDashboard = {
  totalTools: number;
  totalQuantity: number;
  deployed: number;
  free: number;
  perCategory: { categoryId: string; name: string; codePrefix: string; toolCount: number; totalQuantity: number }[];
  perSite: { siteId: string; toolTypes: number; totalQuantity: number }[];
};

// Aggregate strip for the hub + Home tile. Single grouped queries, no N+1 (§14).
export async function dashboardAggregates(): Promise<ToolDashboard> {
  const totalsRow = (
    await db
      .select({
        totalTools: sql<number>`count(*)::int`,
        totalQuantity: sql<number>`coalesce(sum(${tools.totalQuantity}), 0)::int`,
      })
      .from(tools)
      .where(eq(tools.isDeleted, false))
  )[0];

  const deployedRow = (
    await db
      .select({ deployed: sql<number>`coalesce(sum(${toolAssignments.quantity}), 0)::int` })
      .from(toolAssignments)
      .innerJoin(tools, eq(tools.toolId, toolAssignments.toolId))
      .where(eq(tools.isDeleted, false))
  )[0];

  const perCategory = await db
    .select({
      categoryId: toolCategories.categoryId,
      name: toolCategories.name,
      codePrefix: toolCategories.codePrefix,
      toolCount: sql<number>`count(${tools.toolId})::int`,
      totalQuantity: sql<number>`coalesce(sum(${tools.totalQuantity}), 0)::int`,
    })
    .from(toolCategories)
    .leftJoin(tools, and(eq(tools.categoryId, toolCategories.categoryId), eq(tools.isDeleted, false)))
    .groupBy(toolCategories.categoryId, toolCategories.name, toolCategories.codePrefix, toolCategories.sortOrder)
    .orderBy(toolCategories.sortOrder);

  const perSite = await db
    .select({
      siteId: toolAssignments.siteId,
      toolTypes: sql<number>`count(distinct ${toolAssignments.toolId})::int`,
      totalQuantity: sql<number>`coalesce(sum(${toolAssignments.quantity}), 0)::int`,
    })
    .from(toolAssignments)
    .innerJoin(tools, and(eq(tools.toolId, toolAssignments.toolId), eq(tools.isDeleted, false)))
    .groupBy(toolAssignments.siteId);

  const totalQuantity = totalsRow?.totalQuantity ?? 0;
  const deployed = deployedRow?.deployed ?? 0;
  return {
    totalTools: totalsRow?.totalTools ?? 0,
    totalQuantity,
    deployed,
    free: totalQuantity - deployed,
    perCategory,
    perSite,
  };
}
