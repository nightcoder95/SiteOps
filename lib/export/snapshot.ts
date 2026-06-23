// lib/export/snapshot.ts
// Reads table data for export. The full snapshot runs in ONE repeatable-read
// transaction so concurrent writes can't produce a torn / FK-inconsistent backup.
// The statement_timeout is raised locally because scanning every table is a
// legitimately longer operation than a normal request read.
//
// Both readers accept an optional `exec` (a drizzle handle or transaction). This
// is what makes them testable: integration tests pass the withRollback tx so
// seeded-but-uncommitted rows are visible (the seed and the read share ONE
// connection/tx). When `exec` is omitted, production uses the global pool.
import { getTableColumns, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withStatementTimeout } from "@/lib/db/guard";
import { TABLE_REGISTRY, getTableEntry } from "@/lib/export/tableRegistry";

type Row = Record<string, unknown>;
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const EXPORT_TIMEOUT_MS = 60_000;

async function readAll(tx: Executor): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const { key, table } of TABLE_REGISTRY) {
    out[key] = (await tx.select().from(table)) as Row[];
  }
  return out;
}

export async function readFullSnapshot(exec?: Executor): Promise<Record<string, Row[]>> {
  // Test path: a tx was passed — run directly on it. Don't open a nested tx, which
  // would be a SAVEPOINT, and you cannot SET TRANSACTION ISOLATION LEVEL on a
  // savepoint. Isolation is irrelevant inside the test's rolled-back tx anyway.
  if (exec) return readAll(exec);
  // Production path: own repeatable-read tx for a consistent, FK-coherent snapshot.
  return db.transaction(
    async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${EXPORT_TIMEOUT_MS}`));
      return readAll(tx);
    },
    { isolationLevel: "repeatable read" },
  );
}

export async function readTable(
  key: string,
  exec?: Executor,
): Promise<{ rows: Row[]; columns: string[] }> {
  const entry = getTableEntry(key);
  if (!entry) throw new Error(`unknown table: ${key}`); // never reaches SQL (allowlist)
  const run = (tx: Executor) => tx.select().from(entry.table) as Promise<Row[]>;
  // Single-table read needs no isolation level, so production reuses the existing
  // withStatementTimeout guard. A passed tx (test) runs directly for visibility.
  const rows = exec ? await run(exec) : await withStatementTimeout(run, EXPORT_TIMEOUT_MS);
  // Stable column list even when empty, so CSV always has a header row.
  const columns = Object.keys(getTableColumns(entry.table));
  return { rows, columns };
}
