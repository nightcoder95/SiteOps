// Statement-timeout guard for the heavy read endpoints (catalog, dashboard,
// operation-summary) — the cure for the connection-pool-exhaustion freeze.
//
// Background: an aborted HTTP request (browser reload / SWR timeout) orphans its
// in-flight query — postgres.js never tells Postgres to stop, so the backend stays
// pinned and its pool slot is lost. A handful of these cascade into a permanent
// "Loading…" freeze. The fix is a server-side statement_timeout that reaps the
// orphan and returns its slot to the pool.
//
// Why `SET LOCAL` inside a transaction (and not the obvious alternatives):
// Supabase's Supavisor transaction pooler STRIPS client startup params
// (`connection.statement_timeout`) AND IGNORES role-level defaults
// (`ALTER ROLE ... SET statement_timeout`) — both were proven ineffective: a
// pooled session keeps reporting the pooler default (`2min`). The pooler DOES
// honour a `SET LOCAL` issued as a statement within a transaction, and `LOCAL`
// scopes it to that transaction so the pooled connection returns clean.
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

// Default ceiling for a guarded read. Generous for legitimate queries, far below
// the pooler's 2min so an orphan is reaped long before it can starve the pool.
const DEFAULT_TIMEOUT_MS = 15_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Runs `fn` inside a transaction guarded by a statement_timeout backstop. Use for
// the heavy read endpoints. Any query that overruns is cancelled server-side
// (Postgres error 57014), freeing its pool slot.
export async function withStatementTimeout<T>(
  fn: (tx: Tx) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${Math.trunc(timeoutMs)}`));
    return fn(tx);
  });
}
