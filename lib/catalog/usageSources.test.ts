import { describe, expect, it } from "vitest";

import { labourEntries, materialEntries } from "@/lib/db/schema";

import { USAGE_SOURCES, usageSourceForCategory } from "./usageSources";

describe("usageSources", () => {
  it("maps a category name to its free-text entry column", () => {
    const src = usageSourceForCategory("Materials");
    expect(src?.column).toBe(materialEntries.materialType);
    expect(src?.table).toBe(materialEntries);
  });

  it("distinguishes columns within the same table by category name", () => {
    expect(usageSourceForCategory("Materials")?.column).toBe(materialEntries.materialType);
    expect(usageSourceForCategory("Material Work Stage")?.column).toBe(materialEntries.workStage);
  });

  it("maps Labour to workType", () => {
    expect(usageSourceForCategory("Labour")?.column).toBe(labourEntries.workType);
  });

  it("returns undefined for an unmanaged category", () => {
    expect(usageSourceForCategory("Nonexistent")).toBeUndefined();
  });

  it("has a source per managed category in USAGE_SOURCES", () => {
    expect(USAGE_SOURCES.length).toBeGreaterThan(0);
    for (const src of USAGE_SOURCES) {
      expect(usageSourceForCategory(src.categoryName)).toBe(src);
    }
  });
});
