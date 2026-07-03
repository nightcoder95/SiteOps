// lib/backup/restoreSnapshot.ts
// Wipe-and-reload restore. Reverses lib/export/snapshot.ts: takes a parsed backup
// and writes it back. Runs on the passed executor (a tx) so it is testable under
// withRollback and atomic in production (all-or-nothing).
//
// Every registry table has an `integer id generatedAlwaysAsIdentity` PK, so each
// insert uses OVERRIDING SYSTEM VALUE to preserve original ids, then the identity
// sequence is resynced so the next live insert won't collide.
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { TABLE_REGISTRY } from "@/lib/export/tableRegistry";

import type { Backup, BackupRow } from "./backupFile";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const CHUNK = 2000; // rows per INSERT, to stay under bind-parameter / packet limits

type ColMeta = { js: string; name: string; isJson: boolean };

function columnsOf(table: PgTable): ColMeta[] {
  const cols = getTableColumns(table) as Record<string, PgColumn>;
  return Object.entries(cols).map(([js, col]) => ({
    js,
    name: col.name,
    isJson: col.dataType === "json",
  }));
}

function insertChunk(tableName: string, cols: ColMeta[], rows: BackupRow[]) {
  const colList = sql.join(
    cols.map((c) => sql.identifier(c.name)),
    sql`, `,
  );
  const tuples = rows.map(
    (row) =>
      sql`(${sql.join(
        cols.map((c) => {
          const v = row[c.js];
          if (v === null || v === undefined) return sql`NULL`;
          // jsonb must be cast; everything else binds as a param and Postgres
          // coerces (ISO string -> timestamp, decimal string -> numeric, etc.)
          return c.isJson ? sql`${JSON.stringify(v)}::jsonb` : sql`${v}`;
        }),
        sql`, `,
      )})`,
  );
  return sql`INSERT INTO ${sql.identifier(tableName)} (${colList}) OVERRIDING SYSTEM VALUE VALUES ${sql.join(
    tuples,
    sql`, `,
  )}`;
}

export async function restoreSnapshot(backup: Backup, exec: Executor): Promise<void> {
  const tableNames = TABLE_REGISTRY.map((e) => getTableName(e.table));

  // 1) Wipe everything. CASCADE clears FK children; RESTART IDENTITY resets seqs.
  const truncTargets = sql.join(
    tableNames.map((n) => sql.identifier(n)),
    sql`, `,
  );
  await exec.execute(sql`TRUNCATE ${truncTargets} RESTART IDENTITY CASCADE`);

  // 2) Insert parents-first (registry order), chunked, with OVERRIDING SYSTEM VALUE.
  for (const entry of TABLE_REGISTRY) {
    const name = getTableName(entry.table);
    const rows = backup.tables[entry.key] ?? [];
    if (rows.length === 0) continue;
    const cols = columnsOf(entry.table);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await exec.execute(insertChunk(name, cols, rows.slice(i, i + CHUNK)));
    }
  }

  // 3) Resync identity sequences so the next live insert won't collide on id.
  for (const name of tableNames) {
    await exec.execute(
      sql`SELECT setval(pg_get_serial_sequence(${name}, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${sql.identifier(name)}), 1))`,
    );
  }
}
