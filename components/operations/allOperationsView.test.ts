import { describe, expect, it } from "vitest";

import {
  boundaryIdsFor,
  buildApplyFiltersUrl,
  canApplyFilters,
  canLoadMore,
  mergeLoadedRows,
  deriveOperationsView,
  parseTypesParam,
  sumSpendTypeSummary,
} from "./allOperationsView";
import type { CombinedRow } from "./entryFormat";

const rows: CombinedRow[] = [
  { type: "labour", id: "l1", date: "2026-07-02", spend: 1000, entry: {} },
  { type: "material", id: "m1", date: "2026-07-02", spend: 300, entry: {} },
  { type: "expense", id: "e1", date: "2026-07-01", spend: 40, entry: {} },
  { type: "machinery", id: "k1", date: "2026-07-03", spend: 750, entry: {} },
];

describe("deriveOperationsView", () => {
  it("computes the grand total over visible rows only", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "newest");
    expect(view.grandTotal).toBe(1000 + 300 + 40 + 750);
  });

  it("excludes a disabled type from the grand total and groups", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "expense"]), "newest");
    expect(view.grandTotal).toBe(1000 + 300 + 40);
    expect(view.visibleLogCount).toBe(3);
    expect(view.groupedRows.every((g) => g.rows.every((r) => r.type !== "machinery"))).toBe(true);
  });

  it("groups rows by date with a correct day total", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "newest");
    const july2 = view.groupedRows.find((g) => g.date === "2026-07-02");
    expect(july2?.dayTotal).toBe(1300);
    expect(july2?.rows).toHaveLength(2);
  });

  it("orders day groups newest-first for sort=newest", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "newest");
    expect(view.groupedRows.map((g) => g.date)).toEqual(["2026-07-03", "2026-07-02", "2026-07-01"]);
  });

  it("orders day groups oldest-first for sort=oldest", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "oldest");
    expect(view.groupedRows.map((g) => g.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("orders day groups by highest day-total spend for sort=highest_spend", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "highest_spend");
    // day totals: 07-01=40, 07-02=1300, 07-03=750
    expect(view.groupedRows.map((g) => g.date)).toEqual(["2026-07-02", "2026-07-03", "2026-07-01"]);
  });

  it("orders day groups by lowest day-total spend for sort=lowest_spend", () => {
    const view = deriveOperationsView(rows, new Set(["labour", "material", "machinery", "expense"]), "lowest_spend");
    expect(view.groupedRows.map((g) => g.date)).toEqual(["2026-07-01", "2026-07-03", "2026-07-02"]);
  });

  it("returns no groups and a zero grand total when every type is disabled to empty visibility", () => {
    const view = deriveOperationsView([], new Set(["labour", "material", "machinery", "expense"]), "newest");
    expect(view.groupedRows).toEqual([]);
    expect(view.grandTotal).toBe(0);
    expect(view.visibleLogCount).toBe(0);
  });
});

describe("canApplyFilters", () => {
  it("allows applying when at least one type is enabled", () => {
    expect(canApplyFilters(new Set(["labour"]))).toBe(true);
    expect(canApplyFilters(new Set(["labour", "material"]))).toBe(true);
  });

  it("blocks applying when no type is enabled (must select at least one)", () => {
    expect(canApplyFilters(new Set())).toBe(false);
  });
});

describe("parseTypesParam", () => {
  it("returns only valid spend types from a CSV param", () => {
    expect(parseTypesParam("labour,expense")).toEqual(["labour", "expense"]);
  });

  it("ignores unknown/invalid values", () => {
    expect(parseTypesParam("labour,incident,bogus")).toEqual(["labour"]);
  });

  it("returns an empty array for an empty/absent param", () => {
    expect(parseTypesParam("")).toEqual([]);
    expect(parseTypesParam(undefined)).toEqual([]);
  });
});

describe("buildApplyFiltersUrl", () => {
  const siteId = "site-1";

  it("builds a bare URL with no params when filters are empty and all types enabled", () => {
    expect(
      buildApplyFiltersUrl(siteId, { from: "", to: "", sort: "" }, new Set(["labour", "material", "machinery", "expense"])),
    ).toBe(`/app/sites/${siteId}/operations/all`);
  });

  it("includes from/to/sort when set", () => {
    const url = buildApplyFiltersUrl(
      siteId,
      { from: "2026-07-01", to: "2026-07-10", sort: "oldest" },
      new Set(["labour", "material", "machinery", "expense"]),
    );
    expect(url).toBe(`/app/sites/${siteId}/operations/all?from=2026-07-01&to=2026-07-10&sort=oldest`);
  });

  it("omits the types param when all 4 spend types are enabled", () => {
    const url = buildApplyFiltersUrl(siteId, { from: "", to: "", sort: "" }, new Set(["labour", "material", "machinery", "expense"]));
    expect(url).not.toContain("types=");
  });

  it("includes the types param only for a strict subset", () => {
    const url = buildApplyFiltersUrl(siteId, { from: "", to: "", sort: "" }, new Set(["labour", "expense"]));
    expect(url).toBe(`/app/sites/${siteId}/operations/all?types=labour%2Cexpense`);
  });
});

describe("sumSpendTypeSummary", () => {
  const summary = {
    labour: { todayCount: 1, todaySpend: 100, totalCount: 10, totalSpend: 5000 },
    material: { todayCount: 0, todaySpend: null, totalCount: 4, totalSpend: 800 },
    machinery: { todayCount: 2, todaySpend: 300, totalCount: 3, totalSpend: 900 },
    expense: { todayCount: 1, todaySpend: 40, totalCount: 6, totalSpend: 240 },
    incident: { todayCount: 5, todaySpend: null, totalCount: 20, totalSpend: null },
  };

  it("sums totalCount and totalSpend across only the 4 spend types", () => {
    expect(sumSpendTypeSummary(summary)).toEqual({ totalCount: 23, totalSpend: 6940 });
  });

  it("excludes the incident totalCount from the sum", () => {
    const { totalCount } = sumSpendTypeSummary(summary);
    expect(totalCount).not.toBe(43); // would be 43 if incident's 20 were included
  });

  it("treats a null totalSpend on a spend type as zero", () => {
    const withNull = { ...summary, material: { ...summary.material, totalSpend: null } };
    expect(sumSpendTypeSummary(withNull).totalSpend).toBe(6140);
  });
});

// ---------------------------------------------------------------------------
// F15 / Phase 5 Task 4 — "Load more" past the 200-per-type cap.
describe("load-more helpers", () => {
  const paged: CombinedRow[] = [
    { type: "labour", id: "l1", date: "2026-07-03", spend: 10, entry: { id: 9 } },
    { type: "labour", id: "l2", date: "2026-07-02", spend: 20, entry: { id: 7 } },
    { type: "material", id: "m1", date: "2026-07-02", spend: 30, entry: { id: 4 } },
  ];

  describe("canLoadMore", () => {
    it("is true when a capped type exists and the sort is a date sort", () => {
      expect(canLoadMore("newest", ["labour"])).toBe(true);
      expect(canLoadMore("oldest", ["labour"])).toBe(true);
    });

    it("is false for the spend sorts", () => {
      // Spend order is applied in JS after the per-page limit, so a keyset
      // boundary would be meaningless — the cap banner stays instead.
      expect(canLoadMore("highest_spend", ["labour"])).toBe(false);
      expect(canLoadMore("lowest_spend", ["labour"])).toBe(false);
    });

    it("is false when nothing is capped", () => {
      expect(canLoadMore("newest", [])).toBe(false);
    });
  });

  describe("boundaryIdsFor", () => {
    it("returns the last loaded row's id per capped type", () => {
      // Rows arrive in server order per type, so the last one is the boundary.
      expect(boundaryIdsFor(paged, ["labour"])).toEqual({ labour: 7 });
    });

    it("covers several capped types at once", () => {
      expect(boundaryIdsFor(paged, ["labour", "material"])).toEqual({ labour: 7, material: 4 });
    });

    it("omits a capped type with no loaded rows rather than sending a bad cursor", () => {
      expect(boundaryIdsFor(paged, ["expense"])).toEqual({});
    });

    it("omits a type whose last row carries no numeric id", () => {
      const noId: CombinedRow[] = [{ type: "expense", id: "e1", date: "2026-07-01", spend: 5, entry: {} }];
      expect(boundaryIdsFor(noId, ["expense"])).toEqual({});
    });
  });

  describe("mergeLoadedRows", () => {
    it("appends the new page after the rows already loaded", () => {
      const next: CombinedRow[] = [
        { type: "labour", id: "l3", date: "2026-07-01", spend: 40, entry: { id: 5 } },
      ];
      expect(mergeLoadedRows(paged, next).map((r) => r.id)).toEqual(["l1", "l2", "m1", "l3"]);
    });

    it("drops a row already present, so a double click cannot duplicate spend", () => {
      // Totals are a sum over rows; a duplicated row would silently inflate the
      // grand total rather than just looking odd.
      const overlap: CombinedRow[] = [
        { type: "labour", id: "l2", date: "2026-07-02", spend: 20, entry: { id: 7 } },
        { type: "labour", id: "l3", date: "2026-07-01", spend: 40, entry: { id: 5 } },
      ];
      expect(mergeLoadedRows(paged, overlap).map((r) => r.id)).toEqual(["l1", "l2", "m1", "l3"]);
    });

    it("keeps ids from different types distinct", () => {
      const sameIdOtherType: CombinedRow[] = [
        { type: "material", id: "l2", date: "2026-07-02", spend: 20, entry: { id: 7 } },
      ];
      expect(mergeLoadedRows(paged, sameIdOtherType)).toHaveLength(4);
    });
  });
});
