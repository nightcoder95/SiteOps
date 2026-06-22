import { describe, expect, it } from "vitest";

import {
  extractActiveSubcategoryNames,
  filterToAllowedCanonical,
  pickCategoryIdByName,
} from "./selectors";

describe("pickCategoryIdByName", () => {
  const rows = [
    { categoryId: "lab", name: "Labour" },
    { categoryId: "mat", name: "Materials" },
  ];

  it("finds a category id by exact name", () => {
    expect(pickCategoryIdByName(rows, "Materials")).toBe("mat");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(pickCategoryIdByName(rows, "  labour ")).toBe("lab");
  });

  it("returns null when no category matches", () => {
    expect(pickCategoryIdByName(rows, "Nope")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(pickCategoryIdByName([], "Labour")).toBeNull();
    expect(pickCategoryIdByName(rows, "")).toBeNull();
  });
});

describe("extractActiveSubcategoryNames", () => {
  it("returns names preserving order", () => {
    const payload = {
      subcategories: [
        { subcategoryId: "1", name: "Cement" },
        { subcategoryId: "2", name: "Steel" },
      ],
    };
    expect(extractActiveSubcategoryNames(payload)).toEqual(["Cement", "Steel"]);
  });

  it("drops inactive subcategories when isActive is present", () => {
    const payload = {
      subcategories: [
        { subcategoryId: "1", name: "Cement", isActive: true },
        { subcategoryId: "2", name: "Other", isActive: false },
      ],
    };
    expect(extractActiveSubcategoryNames(payload)).toEqual(["Cement"]);
  });

  it("returns an empty array for missing/empty payloads", () => {
    expect(extractActiveSubcategoryNames(null)).toEqual([]);
    expect(extractActiveSubcategoryNames({})).toEqual([]);
    expect(extractActiveSubcategoryNames({ subcategories: [] })).toEqual([]);
  });

  it("skips entries with blank names", () => {
    const payload = { subcategories: [{ subcategoryId: "1", name: "  " }] };
    expect(extractActiveSubcategoryNames(payload)).toEqual([]);
  });
});

describe("filterToAllowedCanonical", () => {
  const allowed = ["Cement", "M sand", "Steel"];

  it("keeps catalog names present in the allowed set, in catalog order", () => {
    expect(filterToAllowedCanonical(["Steel", "Cement"], allowed)).toEqual([
      "Steel",
      "Cement",
    ]);
  });

  it("drops catalog names not in the allowed set", () => {
    expect(filterToAllowedCanonical(["Cement", "Red Brick"], allowed)).toEqual([
      "Cement",
    ]);
  });

  it("returns the canonical allowed casing even if catalog casing drifts", () => {
    // Submitting must match the server enum exactly, so we emit the allowed
    // value, not the catalog's possibly-different casing/spacing.
    expect(filterToAllowedCanonical(["cement", " m  sand "], allowed)).toEqual([
      "Cement",
      "M sand",
    ]);
  });

  it("does not emit duplicates", () => {
    expect(filterToAllowedCanonical(["Cement", "cement"], allowed)).toEqual([
      "Cement",
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterToAllowedCanonical([], allowed)).toEqual([]);
    expect(filterToAllowedCanonical(["X"], allowed)).toEqual([]);
  });
});
