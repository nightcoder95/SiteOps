import { describe, expect, it } from "vitest";

import {
  entryEndpointFor,
  fallbackFields,
  resolveEntryFields,
  resolveEntryKind,
} from "./entryFieldRegistry";

describe("resolveEntryFields", () => {
  it("returns labour fields for 'Labour'", () => {
    const fields = resolveEntryFields("Labour");
    expect(fields.map((f) => f.name)).toEqual(["date", "workType", "peopleCount", "remarks"]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(resolveEntryFields("  labour ")).toEqual(resolveEntryFields("Labour"));
  });

  it("returns material fields for 'Material'", () => {
    expect(resolveEntryFields("Material").map((f) => f.name)).toEqual([
      "date", "materialType", "quantity", "unit", "remarks",
    ]);
  });

  it("returns machinery fields for 'Machinery'", () => {
    expect(resolveEntryFields("Machinery").map((f) => f.name)).toEqual([
      "date", "equipmentType", "count", "hoursActive", "remarks",
    ]);
  });

  it("returns expense fields for 'Expense'", () => {
    expect(resolveEntryFields("Expense").map((f) => f.name)).toEqual([
      "date", "category", "description", "amount",
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
