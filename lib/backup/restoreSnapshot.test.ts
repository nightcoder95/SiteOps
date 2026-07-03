// lib/backup/restoreSnapshot.test.ts
import { expect, it } from "vitest";

import { labourEntries } from "@/lib/db/schema";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { toBackupJson } from "@/lib/export/serialize";
import { readFullSnapshot } from "@/lib/export/snapshot";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

import { parseBackup } from "./backupFile";
import { restoreSnapshot } from "./restoreSnapshot";

type Row = Record<string, unknown>;

describeDb("restoreSnapshot round-trip (DB)", () => {
  it("export -> restore -> re-read reproduces every row/column exactly", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        { siteId, date: "2026-06-22", peopleCount: 4, wagePerHead: "500.50", createdBy: userId },
        { siteId, date: "2026-06-23", peopleCount: 2, salaryAmount: "-500.50", createdBy: userId },
      ]);

      // Capture the pre-restore snapshot (this is what the backup file holds).
      const before = await readFullSnapshot(tx);
      const json = toBackupJson(before, TABLE_KEYS);
      const parsed = parseBackup(Buffer.from(json));

      // Wipe + reload everything from the parsed backup, in the same tx.
      await restoreSnapshot(parsed, tx);

      const after = await readFullSnapshot(tx);

      // Compare table-by-table as sets keyed by id (insert order may differ).
      const byId = (rows: Row[]) => Object.fromEntries(rows.map((r) => [String(r.id), r]));
      for (const key of TABLE_KEYS) {
        expect(byId(after[key] as Row[])).toEqual(byId(before[key] as Row[]));
      }

      // Decimal stayed a byte-identical string (no float drift). Target OUR seeded
      // rows by siteId — the dev DB may hold other labour_entries too.
      const mine = (after.labour_entries as Row[]).filter((r) => r.siteId === siteId);
      expect(mine.some((r) => r.salaryAmount === "-500.50")).toBe(true);
    });
  }, 30_000);

  it("resyncs the identity sequence so a fresh insert does not collide", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values({
        siteId,
        date: "2026-06-22",
        peopleCount: 1,
        wagePerHead: "1.00",
        createdBy: userId,
      });
      const before = await readFullSnapshot(tx);
      const parsed = parseBackup(Buffer.from(toBackupJson(before, TABLE_KEYS)));
      await restoreSnapshot(parsed, tx);

      // A new insert must succeed (sequence was bumped past the restored MAX(id)).
      await expect(
        tx.insert(labourEntries).values({
          siteId,
          date: "2026-06-24",
          peopleCount: 1,
          wagePerHead: "2.00",
          createdBy: userId,
        }),
      ).resolves.toBeDefined();
    });
  }, 30_000);
});
