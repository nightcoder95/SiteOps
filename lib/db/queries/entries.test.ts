import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/siteops_test";

const {
  calculateLabourTotal,
  calculateMaterialUnitRate,
} = await import("./entries");

describe("entry cost helpers", () => {
  it("calculates labour total from people count and wage per head", () => {
    expect(calculateLabourTotal(10, "1000.00")).toBe(10000);
  });

  it("returns zero labour total when wage is missing", () => {
    expect(calculateLabourTotal(10, null)).toBe(0);
  });

  it("calculates material unit rate from total cost and quantity", () => {
    expect(calculateMaterialUnitRate("22500.00", "50.00")).toBe(450);
  });

  it("returns null material unit rate when quantity is zero", () => {
    expect(calculateMaterialUnitRate("22500.00", "0")).toBeNull();
  });
});
