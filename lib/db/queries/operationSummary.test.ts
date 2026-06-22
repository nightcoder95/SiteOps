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

      const labour = [
        { siteId, createdBy: userId, date: DAY, workType: "A", peopleCount: 2, wagePerHead: "500.00" },
        { siteId, createdBy: userId, date: DAY, workType: "A", peopleCount: 1, salaryAmount: "1200.00" },
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
        { siteId, reportedBy: userId, incidentType: "Slip", severity: "Low", description: "x" },
      ]);

      const summary = await siteOperationSummary(tx, siteId, DAY);

      // Counts
      expect(summary.labour.todayCount).toBe(2);
      expect(summary.material.todayCount).toBe(1);
      expect(summary.machinery.todayCount).toBe(1);
      expect(summary.expense.todayCount).toBe(1);
      expect(summary.incident.todayCount).toBe(1);
      expect(summary.incident.todaySpend).toBeNull();

      // Spend equals the old per-row reduction
      expect(summary.labour.todaySpend).toBeCloseTo(
        labour.reduce((s, r) => s + calculateLabourTotal(r), 0),
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
