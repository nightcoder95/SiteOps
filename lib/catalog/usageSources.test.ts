import { describe, expect, it } from "vitest";

import { expenseEntries, labourEntries, machineryEntries, materialEntries } from "@/lib/db/schema";

import { USAGE_SOURCES, usageSourcesForCategory } from "./usageSources";

describe("usageSourcesForCategory", () => {
  it("maps a single-table category to a one-element array", () => {
    const sources = usageSourcesForCategory("Materials");
    expect(sources).toHaveLength(1);
    expect(sources[0]?.column).toBe(materialEntries.materialType);
    expect(sources[0]?.table).toBe(materialEntries);
  });

  it("maps Labour to workType", () => {
    expect(usageSourcesForCategory("Labour")[0]?.column).toBe(labourEntries.workType);
  });

  it("maps Work Stage to all four entry tables that carry it", () => {
    const sources = usageSourcesForCategory("Work Stage");
    expect(sources).toHaveLength(4);
    expect(sources.find((s) => s.table === materialEntries)?.column).toBe(materialEntries.workStage);
    expect(sources.find((s) => s.table === labourEntries)?.column).toBe(labourEntries.workStage);
    expect(sources.find((s) => s.table === machineryEntries)?.column).toBe(machineryEntries.workStage);
    expect(sources.find((s) => s.table === expenseEntries)?.column).toBe(expenseEntries.workStage);
  });

  it("returns an empty array for an unmanaged category", () => {
    expect(usageSourcesForCategory("Nonexistent")).toEqual([]);
  });

  it("resolves a non-empty result for every categoryName present in USAGE_SOURCES, each entry a genuine member", () => {
    expect(USAGE_SOURCES.length).toBeGreaterThan(0);
    for (const src of USAGE_SOURCES) {
      const resolved = usageSourcesForCategory(src.categoryName);
      expect(resolved.length).toBeGreaterThan(0);
      expect(resolved).toContain(src);
    }
  });
});
