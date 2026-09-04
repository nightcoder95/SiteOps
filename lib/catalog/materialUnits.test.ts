import { describe, expect, it } from "vitest";

import {
  computeMaterialUnitRule,
  dedupeUnitOptionsByName,
  displayUnitName,
} from "./units";

describe("computeMaterialUnitRule", () => {
  it("uses the mapped units when a material type has an allow-list", () => {
    const rule = computeMaterialUnitRule({
      mappedUnits: [
        { label: "Bag", isDefault: true },
        { label: "KG", isDefault: false },
      ],
      activeUnitLabels: ["Bag", "KG", "Tonne", "Litre"],
    });
    expect(rule.allowedNames).toEqual(["Bag", "KG"]);
    expect(rule.preferredName).toBe("Bag");
  });

  it("prefers the first mapped unit when none is flagged default", () => {
    const rule = computeMaterialUnitRule({
      mappedUnits: [
        { label: "CFT", isDefault: false },
        { label: "Tonne", isDefault: false },
      ],
      activeUnitLabels: ["CFT", "Tonne"],
    });
    expect(rule.preferredName).toBe("CFT");
  });

  it("falls back to ALL active units when there is no mapping (design §3.3)", () => {
    const rule = computeMaterialUnitRule({
      mappedUnits: [],
      activeUnitLabels: ["Tonne", "Litre", "KG"],
    });
    expect(rule.allowedNames).toEqual(["Tonne", "Litre", "KG"]);
    expect(rule.preferredName).toBe("Tonne");
  });

  it("returns no preferred unit when nothing is available", () => {
    const rule = computeMaterialUnitRule({ mappedUnits: [], activeUnitLabels: [] });
    expect(rule.allowedNames).toEqual([]);
    expect(rule.preferredName).toBeNull();
  });

  it("normalizes legacy labels for display", () => {
    const rule = computeMaterialUnitRule({
      mappedUnits: [{ label: "Kilogram", isDefault: true }],
      activeUnitLabels: ["Kilogram"],
    });
    expect(rule.allowedNames).toEqual(["KG"]);
    expect(rule.preferredName).toBe("KG");
  });
});

describe("displayUnitName", () => {
  it("normalizes existing master unit labels for display", () => {
    expect(displayUnitName("Kilogram")).toBe("KG");
    expect(displayUnitName("Nos")).toBe("Numbers");
  });

  it("no longer collapses 'Bag (50 kg)' into 'Bag'", () => {
    expect(displayUnitName("Bag (50 kg)")).toBe("Bag (50 kg)");
    expect(displayUnitName("Bag")).not.toBe(displayUnitName("Bag (50 kg)"));
  });
});

describe("dedupeUnitOptionsByName", () => {
  it("keeps the first occurrence of each display name", () => {
    const options = [
      { unitId: "1", name: "Tonne", label: "Tonne" },
      { unitId: "2", name: "Tonne", label: "Tonne" },
      { unitId: "3", name: "Litre", label: "Litre" },
      { unitId: "4", name: "Litre", label: "Litre" },
    ];
    expect(dedupeUnitOptionsByName(options)).toEqual([
      { unitId: "1", name: "Tonne", label: "Tonne" },
      { unitId: "3", name: "Litre", label: "Litre" },
    ]);
  });

  it("treats display names case/whitespace-insensitively", () => {
    const options = [
      { unitId: "1", name: "Bag" },
      { unitId: "2", name: " bag " },
    ];
    expect(dedupeUnitOptionsByName(options)).toHaveLength(1);
  });

  it("returns an empty array unchanged", () => {
    expect(dedupeUnitOptionsByName([])).toEqual([]);
  });
});
