import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import type { EntryType } from "@/lib/db/queries/entries";
import { subcategories } from "@/lib/db/schema";

const CATEGORY_NAME_BY_ENTRY_TYPE: Record<EntryType, string> = {
  labour: "Labour",
  material: "Materials",
  machinery: "Machinery/Equipment",
  expense: "Expenses",
  incident: "Incident",
};
const EXPENSE_CATEGORY_OPTIONS = ["Labour", "Materials", "Equipment", "Misc"] as const;
const INCIDENT_CATEGORY_OPTIONS = ["Safety", "Block"] as const;

export async function getOperationCategoryOptions(type: EntryType) {
  if (type === "expense") {
    return [...EXPENSE_CATEGORY_OPTIONS];
  }
  if (type === "incident") {
    return [...INCIDENT_CATEGORY_OPTIONS];
  }

  const categoryName = CATEGORY_NAME_BY_ENTRY_TYPE[type];
  const categoryRow = await db.query.categories.findFirst({
    where: (table, { eq: equals }) => equals(table.name, categoryName),
    columns: { categoryId: true },
  });
  if (!categoryRow) {
    return [];
  }

  const rows = await db
    .select({ name: subcategories.name })
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryRow.categoryId))
    .orderBy(asc(subcategories.name));

  return rows.map((row) => row.name);
}
