import { describe, expect, it } from "vitest";

import { groupUnitsByCategory, unitCodeFromLabel } from "./units";

describe("unitCodeFromLabel", () => {
  it("uppercases and underscores a multi-word label", () => {
    expect(unitCodeFromLabel("Cubic Feet")).toBe("CUBIC_FEET");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(unitCodeFromLabel("  Bag (50 kg) ")).toBe("BAG_50_KG");
  });

  it("truncates to 40 chars", () => {
    const long = "a".repeat(60);
    expect(unitCodeFromLabel(long).length).toBe(40);
  });

  it("returns empty string for a label with no alphanumerics", () => {
    expect(unitCodeFromLabel("!!!")).toBe("");
  });
});

describe("groupUnitsByCategory", () => {
  it("groups units by category and sorts within a group by sortOrder", () => {
    const units = [
      { unitId: "1", label: "Litre", category: "Volume", sortOrder: 2, isActive: true, usageCount: 0 },
      { unitId: "2", label: "Tonne", category: "Weight", sortOrder: 0, isActive: true, usageCount: 1 },
      { unitId: "3", label: "ml", category: "Volume", sortOrder: 1, isActive: true, usageCount: 0 },
    ];
    const groups = groupUnitsByCategory(units);
    expect(groups.map((g) => g.category)).toEqual(["Volume", "Weight"]);
    expect(groups[0].units.map((u) => u.label)).toEqual(["ml", "Litre"]);
  });

  it("orders groups alphabetically by category name", () => {
    const units = [
      { unitId: "1", label: "x", category: "Zeta", sortOrder: 0, isActive: true, usageCount: 0 },
      { unitId: "2", label: "y", category: "Alpha", sortOrder: 0, isActive: true, usageCount: 0 },
    ];
    expect(groupUnitsByCategory(units).map((g) => g.category)).toEqual(["Alpha", "Zeta"]);
  });

  it("returns an empty array for no units", () => {
    expect(groupUnitsByCategory([])).toEqual([]);
  });
});
