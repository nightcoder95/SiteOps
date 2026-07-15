import { describe, expect, it } from "vitest";
import { buildCategorySummaries, entryMatchesSearch, buildGroupedRows, entrySuccessDestination } from "./categoryView";

const m = (over: Record<string, unknown>) => ({
  materialEntryId: Math.random().toString(), materialType: "Metals", workStage: "Foundation",
  quantity: "1", cost: "100", date: "2026-07-10", createdAt: "2026-07-10T00:00:00Z", ...over,
});

describe("buildCategorySummaries", () => {
  it("groups material by materialType (ignores work-stage) with count/spend/last-activity", () => {
    const entries = [
      m({ materialType: "Metals", cost: "100", date: "2026-07-10" }),
      m({ materialType: "Metals", workStage: "Slab", cost: "50", date: "2026-07-12" }),
      m({ materialType: "Cement", cost: "30", date: "2026-07-11" }),
    ];
    const out = buildCategorySummaries(entries as any, "material");
    const metals = out.find((c) => c.key === "Metals")!;
    expect(metals.count).toBe(2);
    expect(metals.totalSpend).toBe(150);
    expect(metals.lastActivity).toBe("2026-07-12");
    expect(out.map((c) => c.key).sort()).toEqual(["Cement", "Metals"]);
  });
});

describe("entryMatchesSearch", () => {
  it("matches remarks case-insensitively", () => {
    expect(entryMatchesSearch(m({ remarks: "Site A delivery" }) as any, "material", "delivery")).toBe(true);
  });
  it("matches amount as text", () => {
    expect(entryMatchesSearch(m({ cost: "1500" }) as any, "material", "1500")).toBe(true);
  });
  it("empty query matches everything", () => {
    expect(entryMatchesSearch(m({}) as any, "material", "")).toBe(true);
  });
  it("non-match returns false", () => {
    expect(entryMatchesSearch(m({ remarks: "abc", cost: "10" }) as any, "material", "zzz")).toBe(false);
  });
});

describe("buildGroupedRows", () => {
  it("renders each entry as its own independent card for every spend type", () => {
    const entries = [
      { expenseEntryId: "e1", category: "Materials", amount: "100", date: "2026-07-10", createdAt: "2026-07-10T01:00:00Z" },
      { expenseEntryId: "e2", category: "Materials", amount: "200", date: "2026-07-10", createdAt: "2026-07-10T02:00:00Z" },
    ];
    const { groupedRows, totalSpend } = buildGroupedRows(entries as any, "expense", "newest");
    const day = groupedRows.find((g) => g.date === "2026-07-10")!;
    expect(day.rows).toHaveLength(2);          // NOT visually merged
    expect(day.rows.every((r) => r.editable)).toBe(true);
    expect(totalSpend).toBe(300);
  });
});

describe("entrySuccessDestination", () => {
  it("routes a created material to its category detail with highlight", () => {
    const entry = { materialEntryId: "m1", materialType: "Ready Mix" };
    expect(entrySuccessDestination(entry as any, "material", "s1")).toBe(
      "/app/sites/s1/operations/material/Ready%20Mix?highlight=m1",
    );
  });
  it("routes expense by category", () => {
    const entry = { expenseEntryId: "e1", category: "Materials" };
    expect(entrySuccessDestination(entry as any, "expense", "s1")).toBe(
      "/app/sites/s1/operations/expense/Materials?highlight=e1",
    );
  });
  it("falls back to site page when siteId missing", () => {
    expect(entrySuccessDestination({} as any, "expense", "")).toBe("/app/dashboard");
  });
});
