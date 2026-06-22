import { requireCapability } from "@/lib/auth/guards";
import { buildCatalogOverview } from "@/lib/catalog/overview";
import { fetchUsageCounts } from "@/lib/catalog/overviewQuery";
import { withStatementTimeout } from "@/lib/db/guard";
import { categories, subcategories } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:read_all");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  // All reads run under a statement_timeout guard: an aborted request can no
  // longer orphan an in-flight query and pin a pool slot (the freeze cause).
  // Usage counts collapse from 7 parallel group-by queries to one UNION ALL.
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

  const overview = buildCatalogOverview({
    categories: categoryRows,
    subcategories: subcategoryRows,
    usageBySubcategoryId,
  });

  return successResponse({ operations: overview }, 200, requestId);
});
