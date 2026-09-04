import { describe, expect, it } from "vitest";

import type { EntryField } from "./entryFieldRegistry";
import { validateEntryValues } from "./EntryForm.validate";

const dateField: EntryField = { name: "date", label: "Date", kind: "date", required: true };
const workTypeField: EntryField = {
  name: "workType", label: "Work Type", kind: "subcategory", required: true, subcategoryHint: "labour",
};
const peopleField: EntryField = {
  name: "peopleCount", label: "People Count", kind: "number", required: true, min: 1, max: 10000, step: 1,
};
const wageField: EntryField = {
  name: "wagePerHead", label: "Per Head Salary", kind: "number", required: true, min: 0.01, step: 0.01,
};
const remarksField: EntryField = { name: "remarks", label: "Remarks", kind: "textarea" };

const base = {
  fields: [dateField, workTypeField, peopleField, wageField, remarksField],
  values: {
    date: "2026-08-06",
    workType: { subcategoryId: "s1", name: "Masonry" },
    peopleCount: "4",
    wagePerHead: "600",
    remarks: "",
  } as Record<string, unknown>,
  siteId: "site-1" as string | null,
  isEdit: false,
  splitLabour: false,
};

describe("validateEntryValues", () => {
  it("returns null when every required field is filled", () => {
    expect(validateEntryValues(base)).toBeNull();
  });

  it("requires a site on create", () => {
    expect(validateEntryValues({ ...base, siteId: null })).toEqual({
      field: "siteId",
      message: "Site is required",
    });
  });

  it("does not require a site on edit", () => {
    expect(validateEntryValues({ ...base, siteId: null, isEdit: true })).toBeNull();
  });

  it("reports the first missing required field by name and label", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, workType: null } }),
    ).toEqual({ field: "workType", message: "Work Type is required" });
  });

  it("treats empty string as missing for scalar fields", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: "" } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
  });

  it("treats null and undefined as missing for scalar fields", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: null } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: undefined } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
  });

  it("ignores optional fields left blank", () => {
    expect(validateEntryValues({ ...base, values: { ...base.values, remarks: "" } })).toBeNull();
  });

  it("skips peopleCount/wagePerHead when the work type is a split-labour type", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: { ...base.values, peopleCount: "", wagePerHead: "", masonCount: "3" },
      }),
    ).toBeNull();
  });

  it("requires at least one mason or helper value when split labour is active", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: {
          ...base.values,
          peopleCount: "", wagePerHead: "",
          masonCount: "0", masonSalaryAmount: "0", helperCount: "0", helperSalaryAmount: "0",
        },
      }),
    ).toEqual({ field: "masonCount", message: "Mason or Helper values are required" });
  });

  it("accepts a helper-only split entry", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: { ...base.values, peopleCount: "", wagePerHead: "", helperCount: "2", helperSalaryAmount: "900" },
      }),
    ).toBeNull();
  });
});
