import { and, asc, eq } from "drizzle-orm";

import { catalogListNamesCacheKey } from "@/lib/cache/keys";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { db } from "@/lib/db/client";
import { categories, subcategories } from "@/lib/db/schema";

const CATALOG_LIST_TTL_SECONDS = 600;

// Active item names of a managed list addressed by its category name
// (e.g. "Incident Severity"), ordered by sortOrder then name. Backs the
// runtime validation that replaced the former pg enums.
export async function loadActiveCatalogNames(listKey: string): Promise<string[]> {
  const { value } = await getOrSetJson<string[]>(
    "catalog_list",
    catalogListNamesCacheKey(listKey),
    CATALOG_LIST_TTL_SECONDS,
    async () => {
      const rows = await db
        .select({ name: subcategories.name })
        .from(subcategories)
        .innerJoin(categories, eq(categories.categoryId, subcategories.categoryId))
        .where(and(eq(categories.name, listKey), eq(subcategories.isActive, true)))
        .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));
      return rows.map((row) => row.name);
    },
  );
  return value;
}
