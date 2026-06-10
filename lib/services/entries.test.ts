import { describe, expect, it } from "vitest";

import { decimalFieldsFor, evaluateLabourSplit } from "./entries";
import type { LabourEntryRow } from "@/lib/types/entry";

const labourRow = (workType: string) => ({ workType } as unknown as LabourEntryRow);

describe("decimalFieldsFor", () => {
  it("returns the decimal columns for each type", () => {
    expect(decimalFieldsFor("expense")).toEqual(["amount"]);
    expect(decimalFieldsFor("material")).toEqual(["quantity", "cost"]);
    expect(decimalFieldsFor("incident")).toEqual([]);
  });
});

describe("evaluateLabourSplit", () => {
  it("rejects split fields on a non-split work type", () => {
    const res = evaluateLabourSplit(labourRow("Steel work"), { masonCount: 2 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Plastering and Brickwork/);
  });

  it("zeroes head-count fields when applying a split update", () => {
    const res = evaluateLabourSplit(labourRow("Plastering"), { masonCount: 2, helperCount: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toMatchObject({ peopleCount: 0, wagePerHead: "0", salaryAmount: null });
    }
  });

  it("clears split fields when switching to a non-split work type", () => {
    const res = evaluateLabourSplit(labourRow("Plastering"), { workType: "Steel work" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toMatchObject({
        masonCount: null,
        masonSalaryAmount: null,
        helperCount: null,
        helperSalaryAmount: null,
      });
    }
  });

  it("no-ops when an unrelated field is updated on a split type", () => {
    const res = evaluateLabourSplit(labourRow("Plastering"), { remarks: "x" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch).toEqual({});
  });
});
