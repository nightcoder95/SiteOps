import { expect, it } from "vitest";

import { calculateLabourTotal, calculateMachineryTotal } from "@/lib/db/queries/operationTotals";
import { siteOperationSummary } from "@/lib/db/queries/entries";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

const DAY = "2026-06-22";

describeDb("siteOperationSummary", () => {
  it("SQL counts and spend match the row-based reduction", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);

      const PRIOR_DAY = "2026-06-21";
      const labour = [
        { siteId, createdBy: userId, date: DAY, workType: "A", peopleCount: 2, wagePerHead: "500.00" },
        { siteId, createdBy: userId, date: DAY, workType: "A", peopleCount: 1, salaryAmount: "1200.00" },
        // Prior-day entry: excluded from "today", included in all-time cumulative.
        { siteId, createdBy: userId, date: PRIOR_DAY, workType: "A", peopleCount: 1, salaryAmount: "800.00" },
      ];
      const machinery = [
        { siteId, createdBy: userId, date: DAY, equipmentType: "E", count: 1, totalCost: "750.00" },
      ];
      await tx.insert(labourEntries).values(labour);
      await tx.insert(materialEntries).values([
        { siteId, createdBy: userId, date: DAY, materialType: "M", quantity: "1", cost: "300.50" },
      ]);
      await tx.insert(machineryEntries).values(machinery);
      await tx.insert(expenseEntries).values([
        { siteId, createdBy: userId, date: DAY, category: "Misc", description: "x", amount: "40.00" },
      ]);
      await tx.insert(incidentReports).values([
        // Pin createdAt to DAY: incident is summarised by created_at::date, so a
        // default now() would make the assertion fail on any day but DAY.
        { siteId, reportedBy: userId, incidentType: "Slip", severity: "Low", description: "x", createdAt: new Date(`${DAY}T10:00:00Z`) },
      ]);

      const summary = await siteOperationSummary(tx, siteId, DAY);

      // Counts
      expect(summary.labour.todayCount).toBe(2);
      expect(summary.material.todayCount).toBe(1);
      expect(summary.machinery.todayCount).toBe(1);
      expect(summary.expense.todayCount).toBe(1);
      expect(summary.incident.todayCount).toBe(1);
      expect(summary.incident.todaySpend).toBeNull();

      // All-time cumulative: labour has an extra prior-day entry beyond today.
      expect(summary.labour.totalCount).toBe(3);
      expect(summary.labour.totalSpend).toBeCloseTo(1000 + 1200 + 800, 2);
      expect(summary.material.totalCount).toBe(1);
      expect(summary.material.totalSpend).toBeCloseTo(300.5, 2);
      expect(summary.incident.totalCount).toBe(1);
      expect(summary.incident.totalSpend).toBeNull();

      // Spend equals the old per-row reduction (today's rows only)
      expect(summary.labour.todaySpend).toBeCloseTo(
        labour.filter((r) => r.date === DAY).reduce((s, r) => s + calculateLabourTotal(r), 0),
        2,
      );
      expect(summary.labour.todaySpend).toBeCloseTo(1000 + 1200, 2);
      expect(summary.machinery.todaySpend).toBeCloseTo(
        machinery.reduce((s, r) => s + calculateMachineryTotal(r), 0),
        2,
      );
      expect(summary.material.todaySpend).toBeCloseTo(300.5, 2);
      expect(summary.expense.todaySpend).toBeCloseTo(40, 2);
    });
  });
});
