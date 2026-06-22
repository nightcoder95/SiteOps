import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { calculateSiteTrackedSpend } from "@/lib/db/queries/operationTotals";
import { getSiteTrackedSpend, siteTrackedSpend } from "@/lib/db/queries/sites";
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
