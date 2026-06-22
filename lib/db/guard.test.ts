import { sql } from "drizzle-orm";
import { expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { withStatementTimeout } from "@/lib/db/guard";
import { describeDb } from "@/lib/db/testing";

describeDb("withStatementTimeout", () => {
  it("runs a drizzle block and returns its value", async () => {
    const out = await withStatementTimeout(async (tx) => {
      const r = await tx.execute<{ n: number }>(sql`select 2 as n`);
      return Number(r[0].n);
    });
    expect(out).toBe(2);
  });

  it("aborts a query that overruns the timeout (reaps the orphan)", async () => {
    const started = Date.now();
    let err: (Error & { cause?: { code?: string } }) | undefined;
    try {
      await withStatementTimeout(async (tx) => tx.execute(sql`select pg_sleep(10)`), 1000);
    } catch (e) {
      err = e as Error & { cause?: { code?: string } };
    }
    expect(Date.now() - started).toBeLessThan(5000); // aborted, not the full 10s
    // drizzle wraps the pg error; the 57014 timeout lives on `.cause`.
    expect(err?.cause?.code).toBe("57014"); // canceling statement due to statement timeout
  });

  it("does not leak the timeout to subsequent queries on the shared handle", async () => {
    await withStatementTimeout(async (tx) => tx.execute(sql`select 1`), 1000).catch(() => {});
    const r = await db.execute<{ n: number }>(sql`select 3 as n`);
    expect(Number(r[0].n)).toBe(3);
  });
});
