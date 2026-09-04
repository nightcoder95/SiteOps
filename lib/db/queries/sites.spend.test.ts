import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { siteOperationSummary } from "@/lib/db/queries/entries";
import { calculateSiteTrackedSpend } from "@/lib/db/queries/operationTotals";
import { searchRemarks } from "@/lib/db/queries/search";
import { getSiteTrackedSpend, siteTrackedSpend } from "@/lib/db/queries/sites";
import { labourSpend } from "@/lib/services/labourSpend";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import {
  expenseEntries,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

describeDb("siteTrackedSpend", () => {
  it("SQL total matches the row-based calculateSiteTrackedSpend", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", workType: "A", peopleCount: 2, wagePerHead: "500.00" },
        { siteId, createdBy: userId, date: "2026-06-22", workType: "A", peopleCount: 1, salaryAmount: "1200.00" },
        { siteId, createdBy: userId, date: "2026-06-22", workType: "A", peopleCount: 0, masonSalaryAmount: "300.00", helperSalaryAmount: "200.00" },
      ]);
      await tx.insert(materialEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", materialType: "M", quantity: "1", cost: "300.50" },
      ]);
      await tx.insert(machineryEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", equipmentType: "E", count: 1, totalCost: "750.00" },
      ]);
      await tx.insert(expenseEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", category: "Misc", description: "x", amount: "40.00" },
      ]);

      const [labour, material, machinery, expense] = await Promise.all([
        tx.select().from(labourEntries).where(eq(labourEntries.siteId, siteId)),
        tx.select().from(materialEntries).where(eq(materialEntries.siteId, siteId)),
        tx.select().from(machineryEntries).where(eq(machineryEntries.siteId, siteId)),
        tx.select().from(expenseEntries).where(eq(expenseEntries.siteId, siteId)),
      ]);
      const expected = calculateSiteTrackedSpend({ labour, material, machinery, expense });

      const actual = Number(await siteTrackedSpend(tx, siteId));

      expect(actual).toBeCloseTo(expected, 2);
      // labour (2*500 + 1200 + (300+200)) + material 300.50 + machinery 750 + expense 40
      expect(actual).toBeCloseTo(3790.5, 2);
    });
  });

  it("returns '0' for an unknown site", async () => {
    const total = await getSiteTrackedSpend("00000000-0000-0000-0000-000000000000");
    expect(total).toBe("0");
  });
});

// SQL↔TS parity. Three SQL copies of the labour precedence exist
// (entries.ts labourSpendExpr, sites.ts siteTrackedSpend, search.ts). A change
// to one that is not mirrored in labourSpend() makes list totals silently
// disagree with summary totals. This inserts rows exercising every precedence
// branch and asserts each SQL sum equals the TS sum.
describeDb("labour spend SQL/TS parity", () => {
  const DATE = "2026-06-23";

  // A: split wins over both the stored salary and people × wage
  // B: no split -> stored salary wins over people × wage
  // C: nothing stored -> people × wage
  // D: split columns explicitly 0 -> must fall through to the stored salary,
  //    NOT report 0. This is exactly where a naive `> 0` SQL check and a naive
  //    TS truthiness check diverge.
  // E: nothing to compute from -> 0
  const rowsFor = (siteId: string, userId: string) => [
    { siteId, createdBy: userId, date: DATE, workType: "A", peopleCount: 10, wagePerHead: "1000.00", salaryAmount: "999.00", masonSalaryAmount: "5000.00", helperSalaryAmount: "3000.00" },
    { siteId, createdBy: userId, date: DATE, workType: "B", peopleCount: 10, wagePerHead: "1000.00", salaryAmount: "12345.00" },
    { siteId, createdBy: userId, date: DATE, workType: "C", peopleCount: 4, wagePerHead: "600.00" },
    { siteId, createdBy: userId, date: DATE, workType: "D", peopleCount: 0, masonSalaryAmount: "0.00", helperSalaryAmount: "0.00", salaryAmount: "7000.00" },
    { siteId, createdBy: userId, date: DATE, workType: "E", peopleCount: 0 },
  ];

  const EXPECTED = 8000 + 12345 + 2400 + 7000 + 0;

  it("siteOperationSummary's labour spend equals sum(labourSpend(row))", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values(rowsFor(siteId, userId));

      const rows = await tx.select().from(labourEntries).where(eq(labourEntries.siteId, siteId));
      const tsTotal = rows.reduce((sum, row) => sum + labourSpend(row), 0);
      expect(tsTotal).toBeCloseTo(EXPECTED, 2);

      const summary = await siteOperationSummary(tx, siteId, DATE);
      expect(Number(summary.labour.todaySpend)).toBeCloseTo(tsTotal, 2);
      expect(Number(summary.labour.totalSpend)).toBeCloseTo(tsTotal, 2);
    });
  });

  it("siteTrackedSpend's labour SQL equals sum(labourSpend(row))", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values(rowsFor(siteId, userId));

      const rows = await tx.select().from(labourEntries).where(eq(labourEntries.siteId, siteId));
      const tsTotal = rows.reduce((sum, row) => sum + labourSpend(row), 0);

      expect(Number(await siteTrackedSpend(tx, siteId))).toBeCloseTo(tsTotal, 2);
    });
  });

  it("search's labour amount column equals labourSpend(row) per row", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values(
        rowsFor(siteId, userId).map((row) => ({ ...row, remarks: `parity ${row.workType}` })),
      );

      const rows = await tx.select().from(labourEntries).where(eq(labourEntries.siteId, siteId));
      const { hits } = await searchRemarks({
        q: "parity",
        limit: 50,
        offset: 0,
        scope: { isAdmin: true, siteIds: [] },
        tx,
      });
      const byId = new Map(
        hits
          .filter((hit) => hit.source === "labour")
          .map((hit) => [hit.entryId, Number(hit.amount ?? 0)]),
      );

      expect(byId.size).toBe(rows.length);
      for (const row of rows) {
        expect(byId.get(row.labourEntryId), row.workType ?? "")
          .toBeCloseTo(labourSpend(row), 2);
      }
    });
  });
});
