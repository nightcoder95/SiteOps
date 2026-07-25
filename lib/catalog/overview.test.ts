import { describe, expect, it } from "vitest";

import { CATALOG_OPERATIONS, buildCatalogOverview } from "./overview";

const categories = [
  { categoryId: "c-labour", name: "Labour" },
  { categoryId: "c-mat", name: "Materials" },
  { categoryId: "c-stage", name: "Work Stage" },
  { categoryId: "c-equip", name: "Machinery/Equipment" },
];

const subcategories = [
  { subcategoryId: "s1", categoryId: "c-labour", name: "Brick work", isActive: true, sortOrder: 1 },
  { subcategoryId: "s2", categoryId: "c-labour", name: "Steel work", isActive: true, sortOrder: 0 },
  { subcategoryId: "s3", categoryId: "c-labour", name: "Mason", isActive: false, sortOrder: 2 },
  { subcategoryId: "s4", categoryId: "c-mat", name: "Cement", isActive: true, sortOrder: 0 },
  { subcategoryId: "s5", categoryId: "c-stage", name: "Roof Level", isActive: true, sortOrder: 3 },
];

describe("buildCatalogOverview", () => {
  const overview = buildCatalogOverview({
    categories,
    subcategories,
    usageBySubcategoryId: { s2: 5, s3: 2 },
  });

  it("groups lists under their operation per CATALOG_OPERATIONS", () => {
    const labour = overview.find((op) => op.operation === "Labour");
    expect(labour?.lists.map((l) => l.noun)).toEqual(["Work Type"]);
    const materials = overview.find((op) => op.operation === "Materials");
    expect(materials?.lists.map((l) => l.noun)).toEqual(["Material Type", "Work Stage"]);
  });

  it("orders items by sortOrder then name", () => {
    const workType = overview[0].lists[0];
    expect(workType.items.map((i) => i.name)).toEqual(["Steel work", "Brick work", "Mason"]);
  });

  it("attaches usage counts (0 when none)", () => {
    const workType = overview[0].lists[0];
    const byName = Object.fromEntries(workType.items.map((i) => [i.name, i.usageCount]));
    expect(byName).toEqual({ "Steel work": 5, "Brick work": 0, Mason: 2 });
  });

  it("exposes isActive and the owning categoryId on each item", () => {
    const mason = overview[0].lists[0].items.find((i) => i.name === "Mason");
    expect(mason).toMatchObject({ subcategoryId: "s3", isActive: false, categoryId: "c-labour" });
  });

  it("yields an empty list (not missing) when a category has no items", () => {
    const equip = overview.find((op) => op.operation === "Equipment");
    expect(equip?.lists[0].items).toEqual([]);
  });

  it("covers every configured operation", () => {
    expect(overview.map((o) => o.operation)).toEqual(CATALOG_OPERATIONS.map((o) => o.operation));
  });
});
