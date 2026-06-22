// Admin catalog page structure (design §4): operations, each owning one or more
// managed lists. A list is backed by a managed-list category whose active items
// feed a dropdown. (Units live in unit_master and are surfaced separately by the
// page; they are not part of this subcategory-backed overview.)

export type CatalogListSpec = {
  key: string;
  noun: string;
  categoryName: string;
};

export type CatalogOperationSpec = {
  operation: string;
  lists: CatalogListSpec[];
};

export const CATALOG_OPERATIONS: CatalogOperationSpec[] = [
  { operation: "Labour", lists: [{ key: "work_type", noun: "Work Type", categoryName: "Labour" }] },
  {
    operation: "Materials",
    lists: [
      { key: "material_type", noun: "Material Type", categoryName: "Materials" },
      { key: "work_stage", noun: "Work Stage", categoryName: "Material Work Stage" },
    ],
  },
  { operation: "Equipment", lists: [{ key: "equipment_type", noun: "Equipment Type", categoryName: "Machinery/Equipment" }] },
  { operation: "Expenses", lists: [{ key: "expense_category", noun: "Expense Category", categoryName: "Expense Category" }] },
  {
    operation: "Incident",
    lists: [
      { key: "incident_type", noun: "Incident Type", categoryName: "Incident Type" },
      { key: "severity", noun: "Severity", categoryName: "Incident Severity" },
    ],
  },
];

export type CatalogOverviewItem = {
  subcategoryId: string;
  categoryId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
};

export type CatalogOverviewList = CatalogListSpec & {
  categoryId: string | null;
  items: CatalogOverviewItem[];
};

export type CatalogOverviewOperation = {
  operation: string;
  lists: CatalogOverviewList[];
};

type Input = {
  categories: Array<{ categoryId: string; name: string }>;
  subcategories: Array<{
    subcategoryId: string;
    categoryId: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
  }>;
  usageBySubcategoryId: Record<string, number>;
};

export function buildCatalogOverview({
  categories,
  subcategories,
  usageBySubcategoryId,
}: Input): CatalogOverviewOperation[] {
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.categoryId]));

  return CATALOG_OPERATIONS.map((op) => ({
    operation: op.operation,
    lists: op.lists.map((spec) => {
      const categoryId = categoryIdByName.get(spec.categoryName) ?? null;
      const items = subcategories
        .filter((s) => s.categoryId === categoryId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((s) => ({
          subcategoryId: s.subcategoryId,
          categoryId: s.categoryId,
          name: s.name,
          isActive: s.isActive,
          sortOrder: s.sortOrder,
          usageCount: usageBySubcategoryId[s.subcategoryId] ?? 0,
        }));
      return { ...spec, categoryId, items };
    }),
  }));
}
