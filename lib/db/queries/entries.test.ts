import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/siteops_test";

const {
  calculateLabourTotal,
  calculateMaterialUnitRate,
  calculateMachineryTotal,
  calculateSiteTrackedSpend,
  consolidationKeyForEntry,
  computeEntriesLimit,
  ALL_TYPE_PREVIEW_LIMIT,
  DEFAULT_ENTRIES_LIMIT,
} = await import("./operationTotals");

const { serverDescriptorFor } = await import("@/lib/entryTypes/server");
type EntryType = import("@/lib/types/entry").EntryType;

describe("entry cost helpers", () => {
  it("calculates ordinary labour total from stored salary amount first", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00", salaryAmount: "12345.00" })).toBe(12345);
  });

  it("falls back to people count and wage for historical labour rows", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00" })).toBe(10000);
  });

  it("calculates split labour total from Mason and Helper salary amounts", () => {
    expect(calculateLabourTotal({
      masonSalaryAmount: "2600.00",
      helperSalaryAmount: "900.00",
    })).toBe(3500);
  });

  it("returns zero labour total when all salary fields are missing", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: null })).toBe(0);
  });

  it("calculates material unit rate from total cost and quantity", () => {
    expect(calculateMaterialUnitRate("22500.00", "50.00")).toBe(450);
  });

  it("returns null material unit rate when quantity is zero", () => {
    expect(calculateMaterialUnitRate("22500.00", "0")).toBeNull();
  });

  it("calculates machinery total from totalCost", () => {
    expect(calculateMachineryTotal({ totalCost: "10000.00" })).toBe(10000);
  });

  it("builds operation-specific consolidation keys", () => {
    expect(consolidationKeyForEntry("labour", { date: "2026-06-04", workType: "Plastering" })).toBe("2026-06-04|Plastering");
    expect(consolidationKeyForEntry("material", { date: "2026-06-04", materialType: "Cement", workStage: "Roof Level" })).toBe("2026-06-04|Cement|Roof Level");
    expect(consolidationKeyForEntry("machinery", { date: "2026-06-04", equipmentType: "JCB" })).toBe("2026-06-04|JCB");
    expect(consolidationKeyForEntry("expense", { date: "2026-06-04", category: "Labour" })).toBe("2026-06-04|Labour");
  });

  it("calculates tracked spend across cost-bearing operations", () => {
    expect(calculateSiteTrackedSpend({
      labour: [{ salaryAmount: "1000.00" }],
      material: [{ cost: "2000.00" }],
      machinery: [{ totalCost: "3000.00" }],
      expense: [{ amount: "4000.00" }],
    })).toBe(10000);
  });
});

describe("computeEntriesLimit", () => {
  it("caps a single-type request at the standard clampLimit ceiling (200)", () => {
    expect(computeEntriesLimit("labour", 500, undefined)).toBe(200);
  });

  it("defaults a single-type request with no limit to DEFAULT_ENTRIES_LIMIT", () => {
    expect(computeEntriesLimit("labour", undefined, undefined)).toBe(DEFAULT_ENTRIES_LIMIT);
  });

  it("caps type=all at ALL_TYPE_PREVIEW_LIMIT when fullAll is not set (preview default, regression guard)", () => {
    expect(computeEntriesLimit("all", 200, undefined)).toBe(ALL_TYPE_PREVIEW_LIMIT);
    expect(computeEntriesLimit("all", 200, false)).toBe(ALL_TYPE_PREVIEW_LIMIT);
  });

  it("lifts type=all to the full clampLimit ceiling when fullAll is true", () => {
    expect(computeEntriesLimit("all", 200, true)).toBe(200);
  });

  it("still applies the 200 ceiling to type=all + fullAll for an over-large requested limit", () => {
    expect(computeEntriesLimit("all", 9999, true)).toBe(200);
  });

  it("ignores fullAll for single types (no behavior change)", () => {
    expect(computeEntriesLimit("material", 10, true)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// F15 / Phase 5 Task 3 — list-view column projection.
//
// getEntriesBySite used SELECT *, pulling every column (including the full
// `remarks` text) for up to 1000 rows on the all-operations view. The list
// views read a fixed, known subset. These cases pin that subset so a projection
// can never silently drop a column a view reads — `Entry` is
// Record<string, any>, so a missing column is `undefined` at runtime with no
// type error.
//
// The inventory below is derived from entryFormat.tsx (renderEntrySummary +
// entryId/entryDate/entrySpend), categoryView.ts, EntryLogList.tsx and
// AdminExpensesPageClient.tsx. The edit form is deliberately NOT a constraint:
// it loads a single row via getEntryById, which keeps SELECT *.
describe("list-view projection (listColumns)", () => {
  const REQUIRED_BY_TYPE: Record<EntryType, readonly string[]> = {
    labour: [
      "id", "labourEntryId", "siteId", "date", "workType", "workStage",
      "peopleCount", "wagePerHead", "salaryAmount", "masonCount",
      "masonSalaryAmount", "helperCount", "helperSalaryAmount",
      "createdBy", "createdAt", "remarks",
    ],
    material: [
      "id", "materialEntryId", "siteId", "date", "materialType", "workStage",
      "quantity", "unit", "cost", "createdBy", "createdAt", "remarks",
    ],
    machinery: [
      "id", "machineryEntryId", "siteId", "date", "equipmentType", "workStage",
      "count", "hoursActive", "totalCost", "createdBy", "createdAt", "remarks",
    ],
    // expense_entries has no remarks column; description carries the content.
    expense: [
      "id", "expenseEntryId", "siteId", "date", "description", "amount",
      "category", "workStage", "createdBy", "createdAt",
    ],
    // incident_reports has no date column (created_at drives the list) and no
    // spend; `description` is the summary body, so it is not truncated.
    incident: [
      "id", "incidentReportId", "siteId", "incidentType", "severity",
      "description", "reportedBy", "createdAt",
    ],
  };

  for (const type of ["labour", "material", "machinery", "expense", "incident"] as const) {
    it(`projects every column the ${type} list views read`, () => {
      const projected = Object.keys(serverDescriptorFor(type).listColumns);
      for (const field of REQUIRED_BY_TYPE[type]) {
        expect(projected).toContain(field);
      }
    });

    it(`projects nothing beyond the ${type} inventory (a projection must not re-widen)`, () => {
      const projected = Object.keys(serverDescriptorFor(type).listColumns).sort();
      expect(projected).toEqual([...REQUIRED_BY_TYPE[type]].sort());
    });
  }

  it("keeps the identity id, the uuid key and the ownership column for every type", () => {
    // id backs React keys, the uuid backs the entry routes, and createdBy /
    // reportedBy backs the edit + delete permission check.
    for (const type of ["labour", "material", "machinery", "expense", "incident"] as const) {
      const projected = Object.keys(serverDescriptorFor(type).listColumns);
      const d = serverDescriptorFor(type);
      expect(projected).toContain("id");
      expect(projected).toContain(d.idField);
      expect(projected.some((f) => f === "createdBy" || f === "reportedBy")).toBe(true);
    }
  });
});

const { describeDb, seedSite, withRollback } = await import("@/lib/db/testing");
const { labourEntries } = await import("@/lib/db/schema");
const { eq } = await import("drizzle-orm");

// The truncation is the point of the projection, so assert what the SQL
// actually returns rather than introspecting the query builder. Everything
// happens inside a rolled-back transaction — no row survives the test.
describeDb("list-view projection — remarks truncation (DB)", () => {
  const projection = serverDescriptorFor("labour").listColumns;

  async function insertLabourWithRemarks(
    tx: Parameters<Parameters<typeof withRollback>[0]>[0],
    siteId: string,
    userId: string,
    remarks: string | null,
  ) {
    const [row] = await tx
      .insert(labourEntries)
      .values({
        siteId,
        date: "2026-01-01",
        peopleCount: 1,
        salaryAmount: "100.00",
        remarks,
        createdBy: userId,
      })
      .returning({ labourEntryId: labourEntries.labourEntryId });
    const [projected] = await tx
      .select(projection)
      .from(labourEntries)
      .where(eq(labourEntries.labourEntryId, row.labourEntryId));
    return projected as Record<string, unknown>;
  }

  it("caps remarks longer than 160 characters at 160", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const long = "x".repeat(500);
      const projected = await insertLabourWithRemarks(tx, siteId, userId, long);
      expect(String(projected.remarks)).toHaveLength(160);
    });
  });

  it("leaves remarks shorter than 160 characters intact", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const short = "Poured the slab before the rain.";
      const projected = await insertLabourWithRemarks(tx, siteId, userId, short);
      expect(projected.remarks).toBe(short);
    });
  });

  it("keeps null remarks null rather than turning them into an empty string", async () => {
    // The summary renders `entry.remarks ? <p>…</p> : null`, so "" and null
    // behave the same today — but a null that became "" would silently change
    // any future `!= null` check.
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const projected = await insertLabourWithRemarks(tx, siteId, userId, null);
      expect(projected.remarks).toBeNull();
    });
  });

  it("returns every projected key, so no list-view field is undefined at runtime", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      const projected = await insertLabourWithRemarks(tx, siteId, userId, "ok");
      expect(Object.keys(projected).sort()).toEqual(Object.keys(projection).sort());
    });
  });
});

// ---------------------------------------------------------------------------
// F15 / Phase 5 Task 4 — keyset pagination past the 200/type cap.
//
// The list is ordered by (date DESC, created_at DESC) and there is a composite
// index on exactly (site_id, date DESC, created_at DESC), so the cursor is
// (date, createdAt, id) compared as a row value — NOT an OFFSET, which
// re-scans everything it skips.
const { encodeEntriesCursor, decodeEntriesCursor, isPaginatedSort } = await import("./entries");

describe("entries cursor codec", () => {
  it("round-trips a cursor", () => {
    expect(decodeEntriesCursor(encodeEntriesCursor({ id: 42 }))).toEqual({ id: 42 });
  });

  it("treats a malformed cursor as no cursor rather than throwing", () => {
    // A cursor arrives from the query string, so it is attacker-controlled. It
    // must degrade to "first page", never to a 500.
    for (const bad of ["", "not-base64!!", "eyJub3QiOiJhIGN1cnNvciJ9", "null", "[]"]) {
      expect(decodeEntriesCursor(bad)).toBeNull();
    }
  });

  it("treats an absent cursor as no cursor", () => {
    expect(decodeEntriesCursor(undefined)).toBeNull();
  });

  it("rejects a cursor whose id is not a positive integer", () => {
    // id is interpolated into SQL as a bound parameter, but a non-integer here
    // means the cursor was hand-made — reject it rather than coerce it.
    for (const id of ["drop table", 1.5, 0, -3, null, Number.NaN]) {
      const forged = Buffer.from(JSON.stringify({ id })).toString("base64url");
      expect(decodeEntriesCursor(forged)).toBeNull();
    }
  });
});

const { entriesCursorPredicate, entriesOrderTargets } = await import("./entries");
const { serverDescriptorFor: descriptorFor } = await import("@/lib/entryTypes/server");
const { and: andSql } = await import("drizzle-orm");

// The keyset predicate is exercised against real SQL — tuple comparison
// semantics are the whole point and cannot be unit-tested in JS. Everything runs
// inside a transaction that is always rolled back, so the database is untouched.
describeDb("entries keyset pagination (DB)", () => {
  const d = descriptorFor("labour");

  type Row = { id: number; date: string; createdAt: Date; siteId: string };

  // Mirrors the production query in getEntriesBySite: same projection, same
  // order targets, same cursor predicate. Sharing the helpers is what stops the
  // test and the real fetcher from drifting apart.
  async function page(
    tx: Parameters<Parameters<typeof withRollback>[0]>[0],
    siteId: string,
    opts: { limit: number; cursor?: string; sort?: "newest" | "oldest" | "highest_spend" },
  ) {
    const sort = opts.sort ?? "newest";
    return (await tx
      .select(d.listColumns)
      .from(labourEntries)
      .where(andSql(
        eq(labourEntries.siteId, siteId),
        entriesCursorPredicate(d, opts.cursor, sort, siteId),
      ))
      .orderBy(...entriesOrderTargets(d, sort))
      .limit(opts.limit)) as unknown as Row[];
  }

  async function seedFiveEntries(
    tx: Parameters<Parameters<typeof withRollback>[0]>[0],
  ) {
    const { userId, siteId } = await seedSite(tx);
    // Three distinct dates; the two 2026-02-01 rows share a created_at as well,
    // so the id tiebreaker has to carry the boundary.
    const tied = new Date("2026-02-01T10:00:00.000Z");
    await tx.insert(labourEntries).values([
      { siteId, date: "2026-03-01", peopleCount: 1, salaryAmount: "100.00", createdBy: userId },
      { siteId, date: "2026-02-01", peopleCount: 1, salaryAmount: "200.00", createdBy: userId, createdAt: tied },
      { siteId, date: "2026-02-01", peopleCount: 1, salaryAmount: "300.00", createdBy: userId, createdAt: tied },
      { siteId, date: "2026-01-15", peopleCount: 1, salaryAmount: "400.00", createdBy: userId },
      { siteId, date: "2026-01-01", peopleCount: 1, salaryAmount: "500.00", createdBy: userId },
    ]);
    return { userId, siteId };
  }

  // The cursor carries only the boundary row's id; the predicate reads the
  // exact (date, created_at) back from the row itself, because a timestamp that
  // has been through JSON has lost its sub-millisecond precision.
  const cursorOf = (row: Row) => encodeEntriesCursor({ id: row.id });
  const ids = (rows: Row[]) => rows.map((r) => r.id);

  it("returns the newest rows first when given no cursor", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const rows = await page(tx, siteId, { limit: 2 });
      expect(rows).toHaveLength(2);
      expect(rows[0].date).toBe("2026-03-01");
    });
  });

  it("continues from the cursor with no overlap and no gap", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const all = await page(tx, siteId, { limit: 10 });
      expect(all).toHaveLength(5);

      const first = await page(tx, siteId, { limit: 2 });
      const second = await page(tx, siteId, { limit: 10, cursor: cursorOf(first[1]) });

      expect([...ids(first), ...ids(second)]).toEqual(ids(all));
    });
  });

  it("disambiguates rows sharing a date and created_at by id", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const all = await page(tx, siteId, { limit: 10 });
      // Page boundary lands between the two rows with identical timestamps.
      const rest = await page(tx, siteId, { limit: 10, cursor: cursorOf(all[1]) });

      expect(ids(rest)).toEqual(ids(all).slice(2));
      expect(new Set(ids(rest)).size).toBe(rest.length);
    });
  });

  it("returns an empty page for a cursor past the end", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const all = await page(tx, siteId, { limit: 10 });
      const past = await page(tx, siteId, { limit: 10, cursor: cursorOf(all[all.length - 1]) });
      expect(past).toEqual([]);
    });
  });

  it("treats a malformed cursor as the first page rather than erroring", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const rows = await page(tx, siteId, { limit: 10, cursor: "not-a-cursor" });
      expect(rows).toHaveLength(5);
    });
  });

  it("reverses the comparison for sort=oldest", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const all = await page(tx, siteId, { limit: 10, sort: "oldest" });
      expect(all[0].date).toBe("2026-01-01");

      const first = await page(tx, siteId, { limit: 2, sort: "oldest" });
      const second = await page(tx, siteId, {
        limit: 10,
        cursor: cursorOf(first[1]),
        sort: "oldest",
      });
      expect([...ids(first), ...ids(second)]).toEqual(ids(all));
    });
  });

  it("ignores the cursor for spend sorts, which are ordered in JS after the limit", async () => {
    // Documented limitation: sortSpendRows runs on the already-limited page, so
    // spend order is per-page only. Pagination is therefore not offered for it
    // and the 200 cap keeps its advisory banner.
    expect(isPaginatedSort("highest_spend")).toBe(false);
    expect(isPaginatedSort("lowest_spend")).toBe(false);
    expect(isPaginatedSort("newest")).toBe(true);
    expect(isPaginatedSort("oldest")).toBe(true);
    expect(isPaginatedSort(undefined)).toBe(true);

    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      const all = await page(tx, siteId, { limit: 10 });
      const spendPage = await page(tx, siteId, {
        limit: 10,
        cursor: cursorOf(all[1]),
        sort: "highest_spend",
      });
      expect(spendPage).toHaveLength(5);
    });
  });

  it("keeps a cursor forged from another site from widening the result set", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedFiveEntries(tx);
      // id 1 belongs to some other site's row (or no row at all).
      const foreign = encodeEntriesCursor({ id: 1 });
      const rows = await page(tx, siteId, { limit: 10, cursor: foreign });
      for (const row of rows) expect(row.siteId).toBe(siteId);
    });
  });
});
