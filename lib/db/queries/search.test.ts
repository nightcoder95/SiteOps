import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { searchRemarks } from "@/lib/db/queries/search";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import {
  expenseEntries,
  labourEntries,
  machineryEntries,
  materialEntries,
  sites,
} from "@/lib/db/schema";

describeDb("searchRemarks archived-site scoping", () => {
  it("omits hits from archived sites for admin and supervisor scopes", async () => {
    await withRollback(async (tx) => {
      // A term unique to this run, so the query cannot match pre-existing rows.
      const term = `zqx${randomUUID().slice(0, 8)}`;

      const live = await seedSite(tx);
      const archived = await seedSite(tx);
      await tx
        .update(sites)
        .set({ archivedAt: new Date() })
        .where(eq(sites.siteId, archived.siteId));

      await tx.insert(labourEntries).values([
        {
          siteId: live.siteId,
          createdBy: live.userId,
          date: "2026-06-25",
          workType: "A",
          peopleCount: 1,
          wagePerHead: "500.00",
          remarks: `live labour ${term}`,
        },
        {
          siteId: archived.siteId,
          createdBy: archived.userId,
          date: "2026-06-25",
          workType: "A",
          peopleCount: 1,
          wagePerHead: "500.00",
          remarks: `archived labour ${term}`,
        },
      ]);
      await tx.insert(expenseEntries).values({
        siteId: archived.siteId,
        createdBy: archived.userId,
        date: "2026-06-25",
        category: "Misc",
        description: `archived expense ${term}`,
        amount: "40.00",
      });

      const asAdmin = await searchRemarks({
        q: term,
        limit: 20,
        offset: 0,
        scope: { isAdmin: true, siteIds: [] },
        tx,
      });
      expect(asAdmin.hits.map((h) => h.siteId)).toEqual([live.siteId]);

      // Explicitly scoping to the archived site must not resurrect it either.
      const asSupervisor = await searchRemarks({
        q: term,
        limit: 20,
        offset: 0,
        scope: { isAdmin: false, siteIds: [live.siteId, archived.siteId] },
        tx,
      });
      expect(asSupervisor.hits.map((h) => h.siteId)).toEqual([live.siteId]);
    });
  });

  it("computes amount per source, and leaves it null for material rows with no cost", async () => {
    await withRollback(async (tx) => {
      const term = `zqy${randomUUID().slice(0, 8)}`;
      const { userId, siteId } = await seedSite(tx);

      await tx.insert(labourEntries).values({
        siteId,
        createdBy: userId,
        date: "2026-06-25",
        workType: "A",
        peopleCount: 3,
        wagePerHead: "500.00",
        remarks: `labour ${term}`,
      });
      await tx.insert(machineryEntries).values({
        siteId,
        createdBy: userId,
        date: "2026-06-25",
        equipmentType: "E",
        count: 1,
        totalCost: "750.00",
        remarks: `machinery ${term}`,
      });
      await tx.insert(materialEntries).values({
        siteId,
        createdBy: userId,
        date: "2026-06-25",
        materialType: "M",
        quantity: "1",
        cost: null,
        remarks: `material ${term}`,
      });
      await tx.insert(expenseEntries).values({
        siteId,
        createdBy: userId,
        date: "2026-06-25",
        category: "Misc",
        description: `expense ${term}`,
        amount: "40.00",
      });

      const { hits } = await searchRemarks({
        q: term,
        limit: 20,
        offset: 0,
        scope: { isAdmin: true, siteIds: [] },
        tx,
      });

      const bySource = Object.fromEntries(hits.map((h) => [h.source, h.amount]));
      expect(bySource).toEqual({
        labour: 1500,
        machinery: 750,
        material: null,
        expense: 40,
      });
    });
  });
});
