import { expect, it } from "vitest";

import { labourEntries, materialEntries } from "@/lib/db/schema";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";

import { getStageAggregates } from "./stageSummary";

describeDb("getStageAggregates", () => {
  it("groups spend and dates by stage, keeping untagged rows as a null stage", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);

      await tx.insert(labourEntries).values([
        { siteId, date: "2026-08-01", workType: "Mason", peopleCount: 2,
          wagePerHead: "700", workStage: "Basement Level", createdBy: userId },
        { siteId, date: "2026-08-05", workType: "Helper", peopleCount: 1,
          wagePerHead: "500", workStage: "Basement Level", createdBy: userId },
        { siteId, date: "2026-02-01", workType: "Piling", peopleCount: 1,
          wagePerHead: "40000", workStage: null, createdBy: userId },
      ]);
      await tx.insert(materialEntries).values([
        { siteId, date: "2026-08-03", materialType: "Cement", quantity: "50",
          unit: "Bag", workStage: "Basement Level", cost: "20000", createdBy: userId },
      ]);

      const rows = await getStageAggregates(tx, siteId);

      const labourBasement = rows.find(
        (r) => r.entryType === "labour" && r.stage === "Basement Level",
      );
      expect(labourBasement).toMatchObject({
        entryCount: 2,
        firstDate: "2026-08-01",
        lastDate: "2026-08-05",
        spend: 1900, // 2×700 + 1×500
      });

      const labourUntagged = rows.find(
        (r) => r.entryType === "labour" && r.stage === null,
      );
      expect(labourUntagged).toMatchObject({ entryCount: 1, spend: 40000 });

      const material = rows.find((r) => r.entryType === "material");
      expect(material).toMatchObject({ stage: "Basement Level", entryCount: 1, spend: 20000 });
    });
  });

  it("applies the mason/helper split precedence, not a naive sum", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        // 2 masons @1300 + 2 helpers @1100 = 4800. A naive column sum reads 2400.
        // salaryAmount is also set, to prove split wins the precedence.
        { siteId, date: "2026-08-01", workType: "Mason", peopleCount: 4,
          wagePerHead: "0", salaryAmount: "9999", masonCount: 2, masonSalaryAmount: "1300",
          helperCount: 2, helperSalaryAmount: "1100",
          workStage: "Basement Level", createdBy: userId },
      ]);

      const rows = await getStageAggregates(tx, siteId);
      expect(rows.find((r) => r.entryType === "labour")!.spend).toBe(4800);
    });
  });

  it("returns nothing for a site with no entries", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedSite(tx);
      expect(await getStageAggregates(tx, siteId)).toEqual([]);
    });
  });

  it("does not leak another site's entries", async () => {
    await withRollback(async (tx) => {
      const a = await seedSite(tx);
      const b = await seedSite(tx);
      await tx.insert(labourEntries).values({
        siteId: b.siteId, date: "2026-08-01", workType: "Mason", peopleCount: 9,
        wagePerHead: "1000", workStage: "Roof Level", createdBy: b.userId,
      });
      expect(await getStageAggregates(tx, a.siteId)).toEqual([]);
    });
  });

  it("rejects a siteId that is not a uuid", async () => {
    await withRollback(async (tx) => {
      await expect(getStageAggregates(tx, "not-a-uuid")).rejects.toThrow();
    });
  });
});
