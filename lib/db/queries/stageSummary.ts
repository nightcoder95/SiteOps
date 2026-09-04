import { sql } from "drizzle-orm";

import { labourSpendSumExpr } from "@/lib/db/queries/labourSpendSql";

// Accepts the shared db or a transaction handle (for rollback-scoped tests).
export type StageExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export type StageEntryType = "labour" | "material" | "machinery" | "expense";

export type StageAggregateRow = {
  stage: string | null;
  entryType: StageEntryType;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
  spend: number;
};

type RawRow = {
  stage: string | null;
  entry_type: StageEntryType;
  entry_count: number | string;
  first_date: string | Date | null;
  last_date: string | Date | null;
  spend: number | string | null;
};

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function rowsOf<T>(result: unknown): T[] {
  // postgres-js returns the rows array directly; other drivers wrap in { rows }.
  if (Array.isArray(result)) return result as T[];
  const wrapped = (result as { rows?: unknown })?.rows;
  return Array.isArray(wrapped) ? (wrapped as T[]) : [];
}

// One roundtrip, four GROUP BYs unioned. Each arm is served by the existing
// (site_id, work_stage) index. Deliberately NOT a per-stage fan-out: that would
// be an N+1 against the connection-pool guard.
//
// work_stage is left NULL rather than coalesced to a sentinel — the caller
// distinguishes "before the field existed" from "skipped", and a magic string
// here would collide with a real catalog value named the same thing.
export async function getStageAggregates(
  executor: StageExecutor,
  siteId: string,
): Promise<StageAggregateRow[]> {
  const result = await executor.execute(sql`
    select work_stage as stage, 'labour' as entry_type, count(*)::int as entry_count,
           min(date)::text as first_date, max(date)::text as last_date,
           coalesce(${labourSpendSumExpr}, 0)::float8 as spend
      from labour_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'material', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(cost,0)),0)::float8
      from material_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'machinery', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(total_cost,0)),0)::float8
      from machinery_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'expense', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(amount,0)),0)::float8
      from expense_entries where site_id = ${siteId}::uuid group by work_stage
  `);

  return rowsOf<RawRow>(result).map((r) => ({
    stage: r.stage,
    entryType: r.entry_type,
    entryCount: Number(r.entry_count),
    firstDate: isoDate(r.first_date),
    lastDate: isoDate(r.last_date),
    spend: Number(r.spend ?? 0),
  }));
}
