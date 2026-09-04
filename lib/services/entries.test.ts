import { describe, expect, it } from "vitest";

import {
  decimalFieldsFor,
  evaluateLabourSplit,
  resolveMaterialUnit,
  stripImmutableEntryFields,
} from "./entries";
import type { LabourEntryRow } from "@/lib/types/entry";

const labourRow = (workType: string) => ({ workType } as unknown as LabourEntryRow);

describe("stripImmutableEntryFields", () => {
  it("keeps mutable fields untouched", () => {
    expect(stripImmutableEntryFields({ peopleCount: 5, remarks: "ok" }))
      .toEqual({ peopleCount: 5, remarks: "ok" });
  });

  it("strips ownership and site reassignment attempts", () => {
    expect(stripImmutableEntryFields({
      siteId: "other-site",
      createdBy: "someone",
      reportedBy: "someone-else",
      peopleCount: 5,
    })).toEqual({ peopleCount: 5 });
  });

  it("strips every type's id field regardless of the entry being updated", () => {
    expect(stripImmutableEntryFields({
      id: 1,
      labourEntryId: "l",
      materialEntryId: "m",
      machineryEntryId: "k",
      expenseEntryId: "e",
      incidentReportId: "i",
      remarks: "kept",
    })).toEqual({ remarks: "kept" });
  });

  it("does not mutate the input object", () => {
    const input = { siteId: "other", peopleCount: 5 };
    stripImmutableEntryFields(input);
    expect(input).toEqual({ siteId: "other", peopleCount: 5 });
  });
});

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
    const res = evaluateLabourSplit(labourRow("Plastering"), {
      masonCount: 2, masonSalaryAmount: 1300, helperCount: 1, helperSalaryAmount: 1100,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toMatchObject({ peopleCount: 0, wagePerHead: "0", salaryAmount: null });
    }
  });

  // The salary is a per-person wage, so count and salary have to move together.
  // The PATCH schema cannot express this — every field there is optional — so
  // the rule is checked against the patch merged over the stored row.
  it("rejects a split update that leaves a role with a salary but no head count", () => {
    const res = evaluateLabourSplit(labourRow("Plastering"), {
      masonCount: 0, masonSalaryAmount: 1300,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Mason count is required/);
  });

  it("rejects a count-only patch when the stored row has no salary for that role", () => {
    const row = { workType: "Plastering", masonCount: 0, masonSalaryAmount: null } as unknown as LabourEntryRow;
    const res = evaluateLabourSplit(row, { masonCount: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Mason salary is required/);
  });

  it("accepts a count-only patch when the stored row already carries that role's salary", () => {
    const row = { workType: "Plastering", masonCount: 2, masonSalaryAmount: "1300.00" } as unknown as LabourEntryRow;
    const res = evaluateLabourSplit(row, { masonCount: 3 });
    expect(res.ok).toBe(true);
  });

  // labourSpend PREFERS the stored salaryAmount over peopleCount × wagePerHead,
  // so an edit to either input that left salaryAmount alone kept the old total.
  it("recomputes salaryAmount when an ordinary labour edit changes peopleCount", () => {
    const row = {
      workType: "Steel work", peopleCount: 2, wagePerHead: "500.00", salaryAmount: "1000.00",
    } as unknown as LabourEntryRow;
    const res = evaluateLabourSplit(row, { peopleCount: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.salaryAmount).toBe("2500");
  });

  it("recomputes salaryAmount when an ordinary labour edit changes wagePerHead", () => {
    const row = {
      workType: "Steel work", peopleCount: 2, wagePerHead: "500.00", salaryAmount: "1000.00",
    } as unknown as LabourEntryRow;
    const res = evaluateLabourSplit(row, { wagePerHead: 600 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.salaryAmount).toBe("1200");
  });

  it("leaves an explicitly supplied salaryAmount alone", () => {
    const row = {
      workType: "Steel work", peopleCount: 2, wagePerHead: "500.00", salaryAmount: "1000.00",
    } as unknown as LabourEntryRow;
    const res = evaluateLabourSplit(row, { peopleCount: 5, wagePerHead: 500, salaryAmount: 9999 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.salaryAmount).toBeUndefined();
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

const units = [
  { unitId: "u-bag", label: "Bag" },
  { unitId: "u-tonne", label: "Tonne" },
  { unitId: "u-kg", label: "kilogram" }, // display-normalises to "KG"
];

describe("resolveMaterialUnit", () => {
  it("auto-assigns the only allowed unit, ignoring what was submitted", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Cement",
        rule: { allowedNames: ["Bag"], preferredName: "Bag" },
        submittedUnitName: "Tonne",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-bag", unitName: "Bag" });
  });

  it("accepts a submitted unit that is in the allowed list", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
        submittedUnitName: "Tonne",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-tonne", unitName: "Tonne" });
  });

  it("rejects a submitted unit that is not allowed — no silent fallback", () => {
    const result = resolveMaterialUnit({
      materialType: "Sand",
      rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
      submittedUnitName: "Bag",
      activeUnits: units,
    });
    expect(result).toEqual({ ok: false, message: "Sand must use Tonne or CFT as the unit" });
  });

  it("rejects an empty submission when more than one unit is allowed", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
        submittedUnitName: "",
        activeUnits: units,
      }),
    ).toEqual({ ok: false, message: "Sand must use Tonne or CFT as the unit" });
  });

  it("rejects when the allowed unit is not among the active units", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["CFT"], preferredName: "CFT" },
        submittedUnitName: "CFT",
        activeUnits: units, // no CFT row
      }),
    ).toEqual({ ok: false, message: "Sand must use CFT as the unit" });
  });

  it("rejects when the rule allows nothing", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Ghost",
        rule: { allowedNames: [], preferredName: null },
        submittedUnitName: "Bag",
        activeUnits: units,
      }),
    ).toEqual({ ok: false, message: "Ghost must use  as the unit" });
  });

  it("matches units through display normalisation", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Steel",
        rule: { allowedNames: ["KG"], preferredName: "KG" },
        submittedUnitName: "kilogram",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-kg", unitName: "KG" });
  });

  it("is case/whitespace tolerant on the submitted name via displayUnitName", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Steel",
        rule: { allowedNames: ["KG", "Tonne"], preferredName: "KG" },
        submittedUnitName: "  KG  ",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-kg", unitName: "KG" });
  });
});
