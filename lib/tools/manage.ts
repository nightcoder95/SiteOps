import { and, eq, like, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { toolAssignments, toolCategories, toolMovements, tools } from "@/lib/db/schema";

import { nextToolCode, parseSequence } from "./code";
import { EXTERNAL, WAREHOUSE } from "./types";
import { type FreshTool } from "./applyBatch";

// Narrow a postgres.js unique-violation on a specific constraint.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint_name?: string; constraint?: string };
  return e?.code === "23505" && (e.constraint_name === constraint || e.constraint === constraint);
}

export type CreateToolInput = {
  name: string;
  categoryId: string;
  icon?: string | null;
  openingStock?: number;
  actorUserId: string;
};

export class CategoryNotFound extends Error {
  constructor(public readonly categoryId: string) {
    super(`tool category not found: ${categoryId}`);
    this.name = "CategoryNotFound";
  }
}

// Create a tool: mint `PREFIX-NNN` under a category-row lock (serializes
// sequence minting for that prefix), insert, and — if opening stock > 0 — write
// an `opening` movement (EXTERNAL→WAREHOUSE), all in one tx. Retries ≤3 on a
// code unique-violation (race backstop; the lock makes it rare).
export async function createTool(input: CreateToolInput): Promise<FreshTool> {
  const opening = input.openingStock ?? 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // Lock the category row: serializes code minting for its prefix.
        const cat = (
          await tx
            .select({ categoryId: toolCategories.categoryId, codePrefix: toolCategories.codePrefix })
            .from(toolCategories)
            .where(eq(toolCategories.categoryId, input.categoryId))
            .for("update")
            .limit(1)
        )[0];
        if (!cat) throw new CategoryNotFound(input.categoryId);

        const existing = await tx
          .select({ code: tools.code })
          .from(tools)
          .where(like(tools.code, `${cat.codePrefix}-%`));
        const sequences = existing
          .map((r) => parseSequence(cat.codePrefix, r.code))
          .filter((n): n is number => n !== null);
        const code = nextToolCode(cat.codePrefix, sequences);

        const inserted = (
          await tx
            .insert(tools)
            .values({
              name: input.name,
              code,
              categoryId: cat.categoryId,
              totalQuantity: opening,
              icon: input.icon ?? null,
              createdByUserId: input.actorUserId,
              updatedByUserId: input.actorUserId,
            })
            .returning()
        )[0];

        // case 15: opening movement only when stock > 0.
        if (opening > 0) {
          await tx.insert(toolMovements).values({
            toolId: inserted.toolId,
            fromLocation: EXTERNAL,
            toLocation: WAREHOUSE,
            quantity: opening,
            kind: "opening",
            actorUserId: input.actorUserId,
          });
        }

        const fresh: FreshTool = {
          toolId: inserted.toolId,
          name: inserted.name,
          code: inserted.code,
          categoryId: inserted.categoryId,
          totalQuantity: inserted.totalQuantity,
          icon: inserted.icon,
          version: inserted.version,
          free: inserted.totalQuantity,
          assignments: [],
        };
        return fresh;
      });
    } catch (err) {
      if (isUniqueViolation(err, "tools_code_unique") && attempt < 2) continue;
      throw err;
    }
  }
  // Unreachable: loop either returns or throws.
  throw new Error("createTool: exhausted code-mint retries");
}

export type UpdateToolInput = {
  toolId: string;
  name?: string;
  categoryId?: string;
  icon?: string | null;
  actorUserId: string;
};

// Edit tool identity/metadata only (name/category/icon) — never quantities.
// Bumps version + updated_by. Returns the fresh tool, or null if not found.
export async function updateTool(input: UpdateToolInput): Promise<FreshTool | null> {
  return db.transaction(async (tx) => {
    const tool = (
      await tx
        .select()
        .from(tools)
        .where(and(eq(tools.toolId, input.toolId), eq(tools.isDeleted, false)))
        .for("update")
        .limit(1)
    )[0];
    if (!tool) return null;

    const patch: Record<string, unknown> = {
      version: sql`${tools.version} + 1`,
      updatedByUserId: input.actorUserId,
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.icon !== undefined) patch.icon = input.icon;

    const updated = (await tx.update(tools).set(patch).where(eq(tools.toolId, input.toolId)).returning())[0];

    const assignmentRows = await tx
      .select({ siteId: toolAssignments.siteId, qty: toolAssignments.quantity })
      .from(toolAssignments)
      .where(eq(toolAssignments.toolId, input.toolId));
    const assignments = assignmentRows.map((r) => ({ siteId: r.siteId, qty: r.qty }));
    const assigned = assignments.reduce((s, a) => s + a.qty, 0);

    return {
      toolId: updated.toolId,
      name: updated.name,
      code: updated.code,
      categoryId: updated.categoryId,
      totalQuantity: updated.totalQuantity,
      icon: updated.icon,
      version: updated.version,
      free: updated.totalQuantity - assigned,
      assignments,
    };
  });
}

export type DeleteToolResult = { ok: true } | { ok: false; reason: "deployed" };

// Soft-delete a tool. Blocked when units are deployed (Σ assigned > 0) unless
// `force` — force writes a `return` movement for every site, deletes the
// assignment rows, then soft-deletes and bumps version, all in one tx (case 7).
export async function deleteTool(input: {
  toolId: string;
  force: boolean;
  actorUserId: string;
}): Promise<DeleteToolResult> {
  return db.transaction(async (tx) => {
    const tool = (
      await tx
        .select()
        .from(tools)
        .where(and(eq(tools.toolId, input.toolId), eq(tools.isDeleted, false)))
        .for("update")
        .limit(1)
    )[0];
    if (!tool) return { ok: true }; // already gone / not found → idempotent no-op

    const assigned = await tx
      .select({ siteId: toolAssignments.siteId, qty: toolAssignments.quantity })
      .from(toolAssignments)
      .where(eq(toolAssignments.toolId, input.toolId));

    if (assigned.length > 0) {
      if (!input.force) return { ok: false, reason: "deployed" };
      for (const row of assigned) {
        await tx.insert(toolMovements).values({
          toolId: input.toolId,
          fromLocation: row.siteId,
          toLocation: WAREHOUSE,
          quantity: row.qty,
          kind: "return",
          note: "tool_deleted",
          actorUserId: input.actorUserId,
        });
      }
      await tx.delete(toolAssignments).where(eq(toolAssignments.toolId, input.toolId));
    }

    await tx
      .update(tools)
      .set({
        isDeleted: true,
        version: sql`${tools.version} + 1`,
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(tools.toolId, input.toolId));

    return { ok: true };
  });
}
