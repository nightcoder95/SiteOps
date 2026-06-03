import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/siteops_test";

const {
  calculateLabourTotal,
  calculateMaterialUnitRate,
  calculateMachineryTotal,
  calculateSiteTrackedSpend,
  consolidationKeyForEntry,
} = await import("./operationTotals");

describe("entry cost helpers", () => {
  it("calculates ordinary labour total from stored salary amount first", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00", salaryAmount: "12345.00" })).toBe(12345);
  });

  it("falls back to people count and wage for historical labour rows", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00" })).toBe(10000);
  });

  it("calculates split labour total from Mason and Helper salary amounts", () => {
    expect(calculateLabourTotal({
      masonSalaryAmount: "2600.00",
      helperSalaryAmount: "900.00",
    })).toBe(3500);
  });

  it("returns zero labour total when all salary fields are missing", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: null })).toBe(0);
  });

  it("calculates material unit rate from total cost and quantity", () => {
    expect(calculateMaterialUnitRate("22500.00", "50.00")).toBe(450);
  });

  it("returns null material unit rate when quantity is zero", () => {
    expect(calculateMaterialUnitRate("22500.00", "0")).toBeNull();
  });

  it("calculates machinery total from totalCost", () => {
    expect(calculateMachineryTotal({ totalCost: "10000.00" })).toBe(10000);
  });

  it("builds operation-specific consolidation keys", () => {
    expect(consolidationKeyForEntry("labour", { date: "2026-06-04", workType: "Plastering" })).toBe("2026-06-04|Plastering");
    expect(consolidationKeyForEntry("material", { date: "2026-06-04", materialType: "Cement", workStage: "Roof Level" })).toBe("2026-06-04|Cement|Roof Level");
    expect(consolidationKeyForEntry("machinery", { date: "2026-06-04", equipmentType: "JCB" })).toBe("2026-06-04|JCB");
    expect(consolidationKeyForEntry("expense", { date: "2026-06-04", category: "Labour" })).toBe("2026-06-04|Labour");
  });

  it("calculates tracked spend across cost-bearing operations", () => {
    expect(calculateSiteTrackedSpend({
      labour: [{ salaryAmount: "1000.00" }],
      material: [{ cost: "2000.00" }],
      machinery: [{ totalCost: "3000.00" }],
      expense: [{ amount: "4000.00" }],
    })).toBe(10000);
  });
});
