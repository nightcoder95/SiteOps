import { expect, it } from "vitest";

import { labourEntries } from "@/lib/db/schema";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

import { readFullSnapshot, readTable } from "./snapshot";

// Both readers MUST be called with the withRollback tx — otherwise the read runs on
// the global pool and cannot see the test's uncommitted seed rows.
describeDb("snapshot readers (DB)", () => {
  it("readFullSnapshot returns every registry key, with seeded rows + exact decimals", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        { siteId, date: "2026-06-22", peopleCount: 4, wagePerHead: "500.50", createdBy: userId },
        {
          siteId,
          date: "2026-06-23",
          peopleCount: 2,
          wagePerHead: "500.50",
          salaryAmount: "-500.50", // negative money must survive as a string too
          createdBy: userId,
        },
      ]);

      const snapshot = await readFullSnapshot(tx);

      // Every registry key present (all 23 tables).
      expect(Object.keys(snapshot).sort()).toEqual([...TABLE_KEYS].sort());

      const seeded = (snapshot.labour_entries as Record<string, unknown>[]).filter(
        (r) => r.siteId === siteId,
      );
      expect(seeded).toHaveLength(2);

      // Decimal comes back as the exact string — NOT a number, NOT re-formatted.
      expect(seeded.every((r) => r.wagePerHead === "500.50")).toBe(true);
      expect(typeof seeded[0].wagePerHead).toBe("string");
      const negative = seeded.find((r) => r.salaryAmount != null);
      expect(negative?.salaryAmount).toBe("-500.50");
    });
  });

  it("readTable returns rows + a stable camelCase column list", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx
        .insert(labourEntries)
        .values({ siteId, date: "2026-06-22", peopleCount: 1, wagePerHead: "12.34", createdBy: userId });

      const { rows, columns } = await readTable("labour_entries", tx);
      expect(rows.some((r) => (r as Record<string, unknown>).siteId === siteId)).toBe(true);
      expect(columns).toContain("wagePerHead"); // camelCase, not wage_per_head
      expect(columns).toContain("siteId");
    });
  });

  it("readTable rejects an unknown key before it reaches SQL", async () => {
    await withRollback(async (tx) => {
      await expect(readTable("__nope__", tx)).rejects.toThrow(/unknown table/);
    });
  });
});
