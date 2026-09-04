import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { catalogOverviewCacheKey } from "@/lib/cache/keys";
import { buildCatalogOverview } from "@/lib/catalog/overview";
import { fetchUsageCounts } from "@/lib/catalog/overviewQuery";
import { withStatementTimeout } from "@/lib/db/guard";
import { categories, subcategories } from "@/lib/db/schema";
import { successResponse } from "@/lib/errors/response";
import { withAuthedApi } from "@/lib/http/withApi";

export const GET = withAuthedApi(
  "site:read_all",
  async ({ requestId }) => {
    // The usage aggregate is a full scan of every entry table with no site
    // predicate, so its cost grows with total data volume forever. It is
    // display-only (the delete-guard runs its own live counts), so a short TTL is
    // safe. Invalidated explicitly on catalog writes; entry writes just age out.
    //
    // Only buildCatalogOverview's plain output crosses the Redis boundary —
    // fetchUsageCounts returns Maps, which JSON.stringify flattens to {}. Caching
    // the raw tuple instead would zero every usage count on a hit.
    const { value: overview } = await getOrSetJson(
      requestId,
      catalogOverviewCacheKey(),
      60,
      async () => {
        // All reads run under a statement_timeout guard: an aborted request can no
        // longer orphan an in-flight query and pin a pool slot (the freeze cause).
        // The guard stays INSIDE compute — it must wrap the query, not the lookup.
        const { categoryRows, subcategoryRows, usageByName } = await withStatementTimeout(
          async (tx) => {
            const [categoryRows, subcategoryRows, usageByName] = await Promise.all([
              tx.select({ categoryId: categories.categoryId, name: categories.name }).from(categories),
              tx
                .select({
                  subcategoryId: subcategories.subcategoryId,
                  categoryId: subcategories.categoryId,
                  name: subcategories.name,
                  isActive: subcategories.isActive,
                  sortOrder: subcategories.sortOrder,
                })
                .from(subcategories),
              fetchUsageCounts(tx),
            ]);
            return { categoryRows, subcategoryRows, usageByName };
          },
        );

        const categoryNameById = new Map(categoryRows.map((c) => [c.categoryId, c.name]));
        const usageBySubcategoryId: Record<string, number> = {};
        for (const sub of subcategoryRows) {
          const catName = categoryNameById.get(sub.categoryId);
          if (!catName) continue;
          usageBySubcategoryId[sub.subcategoryId] = usageByName.get(catName)?.get(sub.name) ?? 0;
        }

        return buildCatalogOverview({
          categories: categoryRows,
          subcategories: subcategoryRows,
          usageBySubcategoryId,
        });
      },
    );

      return successResponse({ operations: overview }, 200, requestId);
    },
  { unauthorizedMessage: "Admin access required" },
);
