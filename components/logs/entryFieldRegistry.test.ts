import { describe, expect, it } from "vitest";

import {
  entryEndpointFor,
  fallbackFields,
  numericInputModeFor,
  resolveEntryFields,
  resolveEntryKind,
} from "./entryFieldRegistry";

describe("resolveEntryFields", () => {
  it("returns labour fields for 'Labour'", () => {
    const fields = resolveEntryFields("Labour");
    expect(fields.map((f) => f.name)).toEqual(["date", "workType", "peopleCount", "wagePerHead", "workStage", "remarks"]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveEntryFields("  labour ")).toEqual(resolveEntryFields("Labour"));
  });

  it("returns material fields for 'Material'", () => {
    expect(resolveEntryFields("Material").map((f) => f.name)).toEqual([
      "date", "materialType", "quantity", "unit", "workStage", "cost", "remarks",
    ]);
  });

  it("uses a real unit selector for material units", () => {
    const unit = resolveEntryFields("Material").find((f) => f.name === "unit");
    expect(unit?.kind).toBe("unit");
  });

  it("returns machinery fields for 'Machinery'", () => {
    expect(resolveEntryFields("Machinery").map((f) => f.name)).toEqual([
      "date", "equipmentType", "count", "hoursActive", "totalCost", "workStage", "remarks",
    ]);
  });

  it("keeps labour fields available for dynamic split-role rendering", () => {
    const fields = resolveEntryFields("Labour");
    expect(fields.some((f) => f.name === "workType")).toBe(true);
    expect(fields.some((f) => f.name === "peopleCount")).toBe(true);
    expect(fields.some((f) => f.name === "wagePerHead")).toBe(true);
  });

  it("returns expense fields for 'Expense'", () => {
    expect(resolveEntryFields("Expense").map((f) => f.name)).toEqual([
      "date", "category", "description", "workStage", "amount",
    ]);
  });

  it("returns incident fields for 'Incident'", () => {
    expect(resolveEntryFields("Incident").map((f) => f.name)).toEqual([
      "incidentType", "severity", "description", "durationEstimate",
    ]);
  });

  it("returns fallback for unknown category", () => {
    expect(resolveEntryFields("Custom thing")).toEqual(fallbackFields);
  });

  it("loads former-enum fields from their managed catalog list (design §3.3)", () => {
    const cases: Array<[string, string, string, string]> = [
      ["Material", "workStage", "Work Stage", "Work Stage"],
      ["Expense", "category", "Expense Category", "Expense Category"],
      ["Incident", "incidentType", "Incident Type", "Incident Type"],
      ["Incident", "severity", "Incident Severity", "Severity"],
    ];
    for (const [category, fieldName, catalogCategoryName, noun] of cases) {
      const field = resolveEntryFields(category).find((f) => f.name === fieldName);
      expect(field?.kind).toBe("subcategory");
      expect(field?.catalogCategoryName).toBe(catalogCategoryName);
      expect(field?.noun).toBe(noun);
      // No more hardcoded option arrays for these.
      expect(field?.options).toBeUndefined();
    }
  });

  it("gives labour/machinery/expense an optional, clearable Work Stage field", () => {
    for (const category of ["Labour", "Machinery", "Expense"]) {
      const field = resolveEntryFields(category).find((f) => f.name === "workStage");
      expect(field?.kind).toBe("subcategory");
      expect(field?.required).toBe(false);
      expect(field?.clearable).toBe(true);
      expect(field?.catalogCategoryName).toBe("Work Stage");
    }
  });

  it("keeps material's Work Stage required and not clearable", () => {
    const field = resolveEntryFields("Material").find((f) => f.name === "workStage");
    expect(field?.required).toBe(true);
    expect(field?.clearable).toBeUndefined();
  });
});

describe("resolveEntryKind", () => {
  it("identifies known kinds", () => {
    expect(resolveEntryKind("Labour")).toBe("labour");
    expect(resolveEntryKind("Material")).toBe("material");
    expect(resolveEntryKind("Machinery")).toBe("machinery");
    expect(resolveEntryKind("Expense")).toBe("expense");
    expect(resolveEntryKind("Incident")).toBe("incident");
  });

  it("falls back to dynamic for unknown categories", () => {
    expect(resolveEntryKind("Custom")).toBe("dynamic");
  });
});

describe("numericInputModeFor", () => {
  it("returns undefined for non-numeric fields", () => {
    expect(numericInputModeFor({ name: "remarks", label: "Remarks", kind: "textarea" })).toBeUndefined();
    expect(numericInputModeFor({ name: "date", label: "Date", kind: "date" })).toBeUndefined();
  });

  it("returns numeric for whole-number fields (step 1)", () => {
    expect(
      numericInputModeFor({ name: "peopleCount", label: "People Count", kind: "number", step: 1 }),
    ).toBe("numeric");
  });

  it("returns decimal for fractional fields", () => {
    expect(
      numericInputModeFor({ name: "wagePerHead", label: "Per Head Salary", kind: "number", step: 0.01 }),
    ).toBe("decimal");
    expect(
      numericInputModeFor({ name: "hoursActive", label: "Hours Active", kind: "number", step: 0.1 }),
    ).toBe("decimal");
  });

  it("defaults an unstepped number field to decimal", () => {
    expect(numericInputModeFor({ name: "quantity", label: "Quantity", kind: "number" })).toBe("decimal");
  });

  it("honours an explicit inputMode override", () => {
    expect(
      numericInputModeFor({ name: "count", label: "Count", kind: "number", step: 0.01, inputMode: "numeric" }),
    ).toBe("numeric");
  });

  it("assigns an inputMode to every numeric field in the registry", () => {
    for (const category of ["labour", "material", "machinery", "expense", "incident"]) {
      for (const field of resolveEntryFields(category)) {
        if (field.kind !== "number") continue;
        expect(numericInputModeFor(field), `${category}.${field.name}`).toBeDefined();
      }
    }
  });

  it("maps the known registry fields to the expected keyboards", () => {
    const byName = (cat: string, name: string) =>
      numericInputModeFor(resolveEntryFields(cat).find((f) => f.name === name)!);
    expect(byName("labour", "peopleCount")).toBe("numeric");
    expect(byName("labour", "wagePerHead")).toBe("decimal");
    expect(byName("material", "quantity")).toBe("decimal");
    expect(byName("material", "cost")).toBe("decimal");
    expect(byName("machinery", "count")).toBe("numeric");
    expect(byName("machinery", "hoursActive")).toBe("decimal");
    expect(byName("machinery", "totalCost")).toBe("decimal");
    expect(byName("expense", "amount")).toBe("decimal");
    expect(byName("incident", "durationEstimate")).toBe("numeric");
  });
});

describe("entryEndpointFor", () => {
  it("maps each kind to its API endpoint", () => {
    expect(entryEndpointFor("labour")).toBe("/api/entries/labour");
    expect(entryEndpointFor("material")).toBe("/api/entries/materials");
    expect(entryEndpointFor("machinery")).toBe("/api/entries/machinery");
    expect(entryEndpointFor("expense")).toBe("/api/entries/expenses");
    expect(entryEndpointFor("incident")).toBe("/api/entries/incidents");
    expect(entryEndpointFor("dynamic")).toBe("/api/entries/dynamic");
  });
});
