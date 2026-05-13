import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { fieldDefinitions, fieldRequests, resourceRequests } from "@/lib/db/schema";

type ReviewOutcome<T> =
  | { type: "not_found" }
  | { type: "conflict"; row: T }
  | { type: "ok"; row: T };

export async function reviewResourceRequest(
  id: string,
  status: "Approved" | "Declined",
  approvedBy: string
): Promise<ReviewOutcome<(typeof resourceRequests.$inferSelect)>> {
  const existing = await db
    .select()
    .from(resourceRequests)
    .where(eq(resourceRequests.requestId, id));

  const req = existing[0] ?? null;
  if (!req) return { type: "not_found" };

  if (req.status !== "Pending") {
    if (req.status === status) return { type: "ok", row: req };
    return { type: "conflict", row: req };
  }

  const updated = await db
    .update(resourceRequests)
    .set({
      status,
      approvedBy,
      updatedAt: new Date(),
    })
    .where(
      and(eq(resourceRequests.requestId, id), eq(resourceRequests.status, "Pending"))
    )
    .returning();

  const row = updated[0] ?? null;
  if (row) return { type: "ok", row };

  const latest = await db
    .select()
    .from(resourceRequests)
    .where(eq(resourceRequests.requestId, id));

  const current = latest[0] ?? null;
  if (!current) return { type: "not_found" };
  if (current.status === status) return { type: "ok", row: current };
  return { type: "conflict", row: current };
}

export async function reviewFieldRequest(
  id: string,
  status: "Approved" | "Declined"
): Promise<ReviewOutcome<(typeof fieldRequests.$inferSelect)>> {
  const existing = await db
    .select()
    .from(fieldRequests)
    .where(eq(fieldRequests.fieldRequestId, id));

  const req = existing[0] ?? null;
  if (!req) return { type: "not_found" };

  if (req.status !== "Pending") {
    if (req.status === status) return { type: "ok", row: req };
    return { type: "conflict", row: req };
  }

  const updated = await db
    .update(fieldRequests)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(fieldRequests.fieldRequestId, id), eq(fieldRequests.status, "Pending")))
    .returning();

  const row = updated[0] ?? null;
  const resolved = row ?? (await db
    .select()
    .from(fieldRequests)
    .where(eq(fieldRequests.fieldRequestId, id))
    .then((r) => r[0] ?? null));

  if (!resolved) return { type: "not_found" };
  if (resolved.status !== status) return { type: "conflict", row: resolved };

  if (resolved.status === "Approved" && resolved.subcategoryId) {
    const existingField = await db
      .select({ id: fieldDefinitions.id })
      .from(fieldDefinitions)
      .where(
        and(
          eq(fieldDefinitions.subcategoryId, resolved.subcategoryId),
          eq(fieldDefinitions.label, resolved.proposedName)
        )
      );
    if (existingField.length === 0) {
      await db.insert(fieldDefinitions).values({
        subcategoryId: resolved.subcategoryId,
        label: resolved.proposedName,
        fieldType: resolved.fieldType,
      });
    }
  }

  return { type: "ok", row: resolved };
}
