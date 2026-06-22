"use client";

import { useApiResult } from "@/lib/http/useApiQuery";

import {
  extractActiveSubcategoryNames,
  pickCategoryIdByName,
  type CategoryRowLike,
  type SubcategoryLike,
} from "./selectors";

type CategoryDetail = { subcategories?: SubcategoryLike[] };

// Reads the live catalog (active subcategory names) for a category addressed by
// its display name (e.g. "Labour", "Materials"). Replaces hardcoded option
// lists so dropdowns stay in sync with the admin-managed catalog.
export function useCatalogNames(categoryName: string): {
  names: string[];
  loading: boolean;
} {
  const listRes = useApiResult<CategoryRowLike[]>("/api/forms/categories");
  const categories = listRes.data?.ok ? listRes.data.data : [];
  const categoryId = pickCategoryIdByName(categories, categoryName);

  const detailRes = useApiResult<CategoryDetail>(
    categoryId ? `/api/forms/categories/${categoryId}` : null,
  );

  const names = detailRes.data?.ok
    ? extractActiveSubcategoryNames(detailRes.data.data)
    : [];

  const loading = !listRes.data || (Boolean(categoryId) && !detailRes.data);

  return { names, loading };
}
