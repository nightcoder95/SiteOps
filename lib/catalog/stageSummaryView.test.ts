import { describe, expect, it } from "vitest";

import type { StageAggregateRow } from "@/lib/db/queries/stageSummary";

import { buildStageSummary } from "./stageSummaryView";

const row = (p: Partial<StageAggregateRow>): StageAggregateRow => ({
  stage: null, legacy: false, entryType: "labour", entryCount: 1,
  firstDate: "2026-08-01", lastDate: "2026-08-01", spend: 100, ...p,
});

const CATALOG = ["Basement Level", "Brick Level", "Roof Level", "Other"];

describe("buildStageSummary", () => {
  it("orders stages by the catalog array, not alphabetically", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Roof Level" }),
        row({ stage: "Basement Level" }),
        row({ stage: "Brick Level" }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Basement Level", "Brick Level", "Roof Level"]);
  });

  it("omits catalog stages that have no entries", () => {
    const rows = buildStageSummary({
      aggregates: [row({ stage: "Roof Level" })],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Roof Level"]);
  });

  it("sums spend across entry types and keeps the per-type split", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", entryType: "labour", spend: 54475, entryCount: 15 }),
        row({ stage: "Basement Level", entryType: "material", spend: 530550, entryCount: 29 }),
        row({ stage: "Basement Level", entryType: "machinery", spend: 13610, entryCount: 2 }),
        row({ stage: "Basement Level", entryType: "expense", spend: 3910, entryCount: 5 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows[0].total).toBe(602545);
    expect(rows[0].entryCount).toBe(51);
    expect(rows[0].byType).toEqual({
      labour: 54475, material: 530550, machinery: 13610, expense: 3910,
    });
  });

  it("widens the date span across every entry type in the stage", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", entryType: "material",
              firstDate: "2026-06-20", lastDate: "2026-08-29" }),
        row({ stage: "Basement Level", entryType: "expense",
              firstDate: "2026-07-31", lastDate: "2026-08-31" }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows[0].firstDate).toBe("2026-06-20");
    expect(rows[0].lastDate).toBe("2026-08-31");
  });

  it("splits untagged into a legacy bucket and a skipped bucket, both placed last", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", spend: 500 }),
        row({ stage: null, legacy: true, spend: 245100, entryCount: 37 }),
        row({ stage: null, legacy: false, spend: 31920, entryCount: 18 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.kind)).toEqual(["stage", "legacy", "untagged"]);
    expect(rows[1]).toMatchObject({ label: "Before Work Stage existed", total: 245100 });
    expect(rows[2]).toMatchObject({ label: "Not tagged", total: 31920 });
  });

  it("keeps the legacy and skipped buckets separate rather than merging them", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: null, legacy: true, entryType: "labour", spend: 100, entryCount: 1 }),
        row({ stage: null, legacy: false, entryType: "labour", spend: 200, entryCount: 1 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.total)).toEqual([100, 200]);
  });

  it("omits an untagged bucket that has no entries", () => {
    const rows = buildStageSummary({
      aggregates: [row({ stage: null, legacy: false, spend: 50 })],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.kind)).toEqual(["untagged"]);
  });

  it("keeps an entry stage that is missing from the catalog, appended after ordered stages", () => {
    // A stage renamed or deactivated in the catalog while entries still carry the
    // old name. Its spend is real; dropping it would silently break the total.
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", spend: 100 }),
        row({ stage: "Retired Stage", spend: 900 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Basement Level", "Retired Stage"]);
    expect(rows[1].kind).toBe("stage");
  });

  it("treats an empty-string stage as untagged, not as its own stage", () => {
    const rows = buildStageSummary({
      aggregates: [row({ stage: "   ", spend: 50 })],
      catalogOrder: CATALOG,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("untagged");
  });

  it("returns an empty array for a site with no entries", () => {
    expect(buildStageSummary({ aggregates: [], catalogOrder: CATALOG })).toEqual([]);
  });

  it("keeps a zero-spend stage that still has entries", () => {
    // Entries with no cost recorded are still activity worth showing.
    const rows = buildStageSummary({
      aggregates: [row({ stage: "Roof Level", spend: 0, entryCount: 3 })],
      catalogOrder: CATALOG,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 0, entryCount: 3 });
  });
});
