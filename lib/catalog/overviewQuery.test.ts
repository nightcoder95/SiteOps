import { expect, it } from "vitest";

import { fetchUsageCounts } from "@/lib/catalog/overviewQuery";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { labourEntries, materialEntries } from "@/lib/db/schema";

describeDb("fetchUsageCounts", () => {
  it("counts free-text usages grouped by value, keyed by category name", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      // The catalog overview counts usage across ALL sites, and this rolled-back
      // tx still sees committed production rows — so use unique sentinel values
      // that cannot pre-exist, making the expected counts exact.
      const wt = `WT_${userId.slice(0, 8)}`;
      const mt = `MT_${userId.slice(0, 8)}`;
      const ws = `WS_${userId.slice(0, 8)}`;
      await tx.insert(labourEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", workType: wt, peopleCount: 1 },
        { siteId, createdBy: userId, date: "2026-06-22", workType: wt, peopleCount: 2 },
      ]);
      await tx.insert(materialEntries).values([
        { siteId, createdBy: userId, date: "2026-06-22", materialType: mt, workStage: ws, quantity: "5", cost: "10.00" },
      ]);

      const counts = await fetchUsageCounts(tx);

      expect(counts.get("Labour")?.get(wt)).toBe(2);
      expect(counts.get("Materials")?.get(mt)).toBe(1);
      expect(counts.get("Material Work Stage")?.get(ws)).toBe(1);
      // Every source key is present even when it has no matching rows.
      expect(counts.has("Incident Severity")).toBe(true);
    });
  });
});
