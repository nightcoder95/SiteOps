import { describe, expect, it } from "vitest";

import { buildCombinedRows, computeCappedTypes, swapDateRangeIfInverted } from "./entryFormat";

const grouped = {
  labour: [
    { labourEntryId: "l1", date: "2026-07-01", salaryAmount: "1000.00" },
    { labourEntryId: "l2", date: "2026-07-02", salaryAmount: "500.00" },
  ],
  material: [
    { materialEntryId: "m1", date: "2026-07-01", cost: "300.00" },
  ],
  machinery: [] as Array<Record<string, any>>,
  expense: [
    { expenseEntryId: "e1", date: "2026-07-03", amount: "40.00" },
  ],
};

describe("buildCombinedRows", () => {
  it("flattens all 4 spend types into one array with type/id/date/spend", () => {
    const rows = buildCombinedRows(grouped);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual(expect.objectContaining({ type: "labour", id: "l1", date: "2026-07-01", spend: 1000 }));
    expect(rows).toContainEqual(expect.objectContaining({ type: "labour", id: "l2", date: "2026-07-02", spend: 500 }));
    expect(rows).toContainEqual(expect.objectContaining({ type: "material", id: "m1", date: "2026-07-01", spend: 300 }));
    expect(rows).toContainEqual(expect.objectContaining({ type: "expense", id: "e1", date: "2026-07-03", spend: 40 }));
  });

  it("never includes an incident row (excluded type entirely)", () => {
    const rows = buildCombinedRows(grouped);
    const types: string[] = rows.map((row) => row.type);
    expect(types).not.toContain("incident");
  });

  it("returns an empty array when every spend type is empty", () => {
    expect(buildCombinedRows({ labour: [], material: [], machinery: [], expense: [] })).toEqual([]);
  });
});

describe("computeCappedTypes", () => {
  it("returns spend types whose list length equals the cap", () => {
    const capped = computeCappedTypes({ labour: [{}, {}], material: [{}], machinery: [], expense: [{}, {}] }, 2);
    expect(capped.sort()).toEqual(["expense", "labour"]);
  });

  it("returns an empty array when no type hits the cap", () => {
    const capped = computeCappedTypes({ labour: [{}], material: [], machinery: [], expense: [] }, 200);
    expect(capped).toEqual([]);
  });
});

describe("swapDateRangeIfInverted", () => {
  it("swaps from/to when from is after to (E3)", () => {
    expect(swapDateRangeIfInverted("2026-07-10", "2026-07-01")).toEqual({
      from: "2026-07-01",
      to: "2026-07-10",
      swapped: true,
    });
  });

  it("leaves an ordered range untouched", () => {
    expect(swapDateRangeIfInverted("2026-07-01", "2026-07-10")).toEqual({
      from: "2026-07-01",
      to: "2026-07-10",
      swapped: false,
    });
  });

  it("does not swap when either bound is empty (open-ended range)", () => {
    expect(swapDateRangeIfInverted("", "2026-07-10")).toEqual({ from: "", to: "2026-07-10", swapped: false });
    expect(swapDateRangeIfInverted("2026-07-10", "")).toEqual({ from: "2026-07-10", to: "", swapped: false });
    expect(swapDateRangeIfInverted("", "")).toEqual({ from: "", to: "", swapped: false });
  });

  it("leaves an equal from/to range untouched", () => {
    expect(swapDateRangeIfInverted("2026-07-10", "2026-07-10")).toEqual({
      from: "2026-07-10",
      to: "2026-07-10",
      swapped: false,
    });
  });
});
