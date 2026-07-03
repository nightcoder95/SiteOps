import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { toolCategories } from "@/lib/db/schema";

export type ToolCategoryRow = typeof toolCategories.$inferSelect;

export async function listCategories(): Promise<ToolCategoryRow[]> {
  return db.select().from(toolCategories).orderBy(asc(toolCategories.sortOrder), asc(toolCategories.name));
}

export async function createCategory(input: {
  name: string;
  codePrefix: string;
  sortOrder?: number;
}): Promise<ToolCategoryRow> {
  const inserted = await db
    .insert(toolCategories)
    .values({ name: input.name, codePrefix: input.codePrefix, sortOrder: input.sortOrder ?? 0 })
    .returning();
  return inserted[0];
}

export async function updateCategory(
  categoryId: string,
  patch: { name?: string; codePrefix?: string; isActive?: boolean; sortOrder?: number },
): Promise<ToolCategoryRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.codePrefix !== undefined) set.codePrefix = patch.codePrefix;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;

  const updated = await db
    .update(toolCategories)
    .set(set)
    .where(eq(toolCategories.categoryId, categoryId))
    .returning();
  return updated[0] ?? null;
}
