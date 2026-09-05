import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { toolAssignments, toolCategories, tools } from "@/lib/db/schema";

import { dashboardAggregates } from "./query";

// These aggregates are GLOBAL (no site/tenant filter), and a rolled-back tx still
// sees committed rows. So the seeded category and site — both brand new — are
// asserted exactly, while the four grand totals are asserted as deltas against a
// baseline captured before seeding. Same tactic as lib/catalog/overviewQuery.test.ts.
describeDb("dashboardAggregates", () => {
  it("counts tools, deployment and per-category/per-site breakdowns, ignoring soft-deleted tools", async () => {
    await withRollback(async (tx) => {
      const before = await dashboardAggregates(tx);

      const { userId, siteId } = await seedSite(tx);
      const tag = userId.slice(0, 8);

      const [category] = await tx
        .insert(toolCategories)
        .values({ name: `Cat ${tag}`, codePrefix: `T${tag.slice(0, 5)}` })
        .returning({ categoryId: toolCategories.categoryId });

      const audit = { createdByUserId: userId, updatedByUserId: userId };
      const liveA = randomUUID();
      const liveB = randomUUID();
      await tx.insert(tools).values([
        { toolId: liveA, name: `Drill ${tag}`, code: `D-${tag}`, categoryId: category.categoryId, totalQuantity: 10, ...audit },
        { toolId: liveB, name: `Saw ${tag}`, code: `S-${tag}`, categoryId: category.categoryId, totalQuantity: 4, ...audit },
        // Soft-deleted: must not reach any bucket — not the totals, not the
        // category breakdown, and its assignment must not count as deployed.
        { toolId: randomUUID(), name: `Gone ${tag}`, code: `G-${tag}`, categoryId: category.categoryId, totalQuantity: 100, isDeleted: true, ...audit },
      ]);

      await tx.insert(toolAssignments).values([
        { toolId: liveA, siteId, quantity: 3 },
        { toolId: liveB, siteId, quantity: 2 },
      ]);

      const after = await dashboardAggregates(tx);

      // Deltas: 2 live tools, 10 + 4 quantity, 3 + 2 deployed, rest free.
      expect(after.totalTools - before.totalTools).toBe(2);
      expect(after.totalQuantity - before.totalQuantity).toBe(14);
      expect(after.deployed - before.deployed).toBe(5);
      expect(after.free - before.free).toBe(9);
      // free is derived, never queried — it must stay consistent with the pair.
      expect(after.free).toBe(after.totalQuantity - after.deployed);

      // Exact: the category is new, so nothing else contributes to its row.
      const seededCategory = after.perCategory.find((c) => c.categoryId === category.categoryId);
      expect(seededCategory).toMatchObject({
        name: `Cat ${tag}`,
        codePrefix: `T${tag.slice(0, 5)}`,
        toolCount: 2,
        totalQuantity: 14,
      });

      // Exact: the site is new, so its assignments are only the two seeded above.
      const seededSite = after.perSite.find((s) => s.siteId === siteId);
      expect(seededSite).toMatchObject({ toolTypes: 2, totalQuantity: 5 });
    });
  });

  it("reports a category with no tools as an empty row rather than omitting it", async () => {
    await withRollback(async (tx) => {
      const tag = randomUUID().slice(0, 8);
      const [category] = await tx
        .insert(toolCategories)
        .values({ name: `Empty ${tag}`, codePrefix: `E${tag.slice(0, 5)}` })
        .returning({ categoryId: toolCategories.categoryId });

      const result = await dashboardAggregates(tx);

      // The left join is what keeps this row present; an inner join would drop it.
      const row = result.perCategory.find((c) => c.categoryId === category.categoryId);
      expect(row).toMatchObject({ toolCount: 0, totalQuantity: 0 });
    });
  });
});
