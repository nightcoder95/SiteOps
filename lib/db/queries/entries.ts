import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";
import {
  calculateLabourTotal,
  calculateMachineryTotal,
  calculateMaterialUnitRate,
  computeEntriesLimit,
  ALL_TYPE_PREVIEW_LIMIT,
  DEFAULT_ENTRIES_LIMIT,
} from "@/lib/db/queries/operationTotals";
import { serverDescriptorFor, type EntryTypeServerDescriptor } from "@/lib/entryTypes/server";
import { stripImmutableEntryFields } from "@/lib/services/entries";
import type { EntryType, MaterialWorkStage, RowByType } from "@/lib/types/entry";

export {
  calculateLabourTotal,
  calculateMachineryTotal,
  calculateMaterialUnitRate,
  ALL_TYPE_PREVIEW_LIMIT,
  DEFAULT_ENTRIES_LIMIT,
};

export async function insertLabourEntry(data: {
  siteId: string;
  date: string;
  workType: string;
  workTypeMode?: "default_enum" | "custom";
  workTypeEnum?:
    | "Steel work"
    | "Shuttering"
    | "Brick work"
    | "Concrete work"
    | "Plastering"
    | "Electric work"
    | "Plumbing"
    | "Tile work"
    | "Wood work"
    | "Paint work"
    | null;
  workTypeCustomId?: string | null;
  peopleCount: number;
  wagePerHead: string;
  salaryAmount?: string | null;
  masonCount?: number | null;
  masonSalaryAmount?: string | null;
  helperCount?: number | null;
  helperSalaryAmount?: string | null;
  remarks: string | null;
  workStage?: string | null;
  createdBy: string;
}) {
  const result = await db.insert(labourEntries).values(data).returning();
  return result[0];
}

export async function insertMaterialEntry(data: {
  siteId: string;
  date: string;
  materialType: string;
  materialTypeMode?: "default_enum" | "custom";
  materialTypeEnum?:
    | "Cement"
    | "M sand"
    | "P sand"
    | "Metal"
    | "Steel"
    | "Red Brick"
    | "Cement Block 6in"
    | "Cement Block 4in"
    | null;
  materialTypeCustomId?: string | null;
  quantity: string;
  unitMode?: "master" | "custom";
  unitMasterId?: string | null;
  unitCustomId?: string | null;
  unit: string | null;
  // Managed catalog list (was a pg enum); validated at the route via assertInCatalogList.
  workStage: string | null;
  cost: string | null;
  remarks: string | null;
  createdBy: string;
}) {
  const result = await db.insert(materialEntries).values(data).returning();
  return result[0];
}

export async function insertMachineryEntry(data: {
  siteId: string;
  date: string;
  equipmentType: string;
  equipmentTypeMode?: "default_enum" | "custom";
  equipmentTypeCustomId?: string | null;
  count: number;
  hoursActive: string | null;
  totalCost: string;
  remarks: string | null;
  workStage?: string | null;
  createdBy: string;
}) {
  const result = await db.insert(machineryEntries).values(data).returning();
  return result[0];
}

export async function insertExpenseEntry(data: {
  siteId: string;
  date: string;
  description: string;
  amount: string;
  category: string;
  workStage?: string | null;
  createdBy: string;
}) {
  const result = await db.insert(expenseEntries).values(data).returning();
  return result[0];
}

export async function insertIncidentReport(data: {
  siteId: string;
  incidentType: string;
  severity: string;
  description: string;
  durationEstimate: number | null;
  reportedBy: string;
}) {
  const result = await db.insert(incidentReports).values(data).returning();
  return result[0];
}

export async function findMatchingLabourEntry(siteId: string, date: string, workType: string) {
  const rows = await db
    .select()
    .from(labourEntries)
    .where(and(
      eq(labourEntries.siteId, siteId),
      eq(labourEntries.date, date),
      eq(labourEntries.workType, workType),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingMaterialEntry(
  siteId: string,
  date: string,
  materialType: string,
  workStage: MaterialWorkStage,
) {
  const rows = await db
    .select()
    .from(materialEntries)
    .where(and(
      eq(materialEntries.siteId, siteId),
      eq(materialEntries.date, date),
      eq(materialEntries.materialType, materialType),
      eq(materialEntries.workStage, workStage),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingMachineryEntry(siteId: string, date: string, equipmentType: string) {
  const rows = await db
    .select()
    .from(machineryEntries)
    .where(and(
      eq(machineryEntries.siteId, siteId),
      eq(machineryEntries.date, date),
      eq(machineryEntries.equipmentType, equipmentType),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingExpenseEntry(
  siteId: string,
  date: string,
  category: string,
) {
  const rows = await db
    .select()
    .from(expenseEntries)
    .where(and(
      eq(expenseEntries.siteId, siteId),
      eq(expenseEntries.date, date),
      eq(expenseEntries.category, category),
    ))
    .limit(1);
  return rows[0] ?? null;
}

function addDecimal(left: string | number | null | undefined, right: string | number | null | undefined) {
  return String(Number(left ?? 0) + Number(right ?? 0));
}

// Merging a split-labour role. The counts add, but the salary is a PER-PERSON
// wage — adding two wages would double what each worker earns (2 masons at
// ₹1,300 merged with 3 at ₹1,300 would become 5 masons at ₹2,600). What must be
// preserved is the money, so the merged wage is the count-weighted average.
// The column is decimal(12,2), so an average that does not divide evenly drifts
// by less than a rupee per head against the two rows it replaces.
export function mergeRoleWage(
  leftCount: number,
  leftWage: string | number | null | undefined,
  rightCount: number,
  rightWage: string | number | null | undefined,
) {
  const count = leftCount + rightCount;
  if (count <= 0) {
    // No heads on either side: nothing to average over. Keep whichever wage was
    // recorded so an edit that adds the count back finds it intact.
    return String(Number(leftWage ?? 0) || Number(rightWage ?? 0) || 0);
  }
  const money = leftCount * Number(leftWage ?? 0) + rightCount * Number(rightWage ?? 0);
  return (money / count).toFixed(2);
}

export async function mergeLabourEntry(existingId: string, data: {
  peopleCount?: number;
  salaryAmount?: string | null;
  masonCount?: number | null;
  masonSalaryAmount?: string | null;
  helperCount?: number | null;
  helperSalaryAmount?: string | null;
  remarks?: string | null;
}) {
  const existing = await getEntryById(existingId, "labour") as typeof labourEntries.$inferSelect | null;
  if (!existing) return null;

  const masonCount = Number(existing.masonCount ?? 0) + Number(data.masonCount ?? 0);
  const helperCount = Number(existing.helperCount ?? 0) + Number(data.helperCount ?? 0);

  const result = await db
    .update(labourEntries)
    .set({
      peopleCount: Number(existing.peopleCount ?? 0) + Number(data.peopleCount ?? 0),
      salaryAmount: addDecimal(existing.salaryAmount, data.salaryAmount),
      masonCount,
      masonSalaryAmount: mergeRoleWage(
        Number(existing.masonCount ?? 0), existing.masonSalaryAmount,
        Number(data.masonCount ?? 0), data.masonSalaryAmount,
      ),
      helperCount,
      helperSalaryAmount: mergeRoleWage(
        Number(existing.helperCount ?? 0), existing.helperSalaryAmount,
        Number(data.helperCount ?? 0), data.helperSalaryAmount,
      ),
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(labourEntries.labourEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeMaterialEntry(existingId: string, data: {
  quantity: string;
  cost: string;
  unitMode?: "master" | "custom";
  unitMasterId?: string | null;
  unitCustomId?: string | null;
  unit?: string | null;
  remarks?: string | null;
}) {
  const existing = await getEntryById(existingId, "material") as typeof materialEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(materialEntries)
    .set({
      quantity: addDecimal(existing.quantity, data.quantity),
      cost: addDecimal(existing.cost, data.cost),
      unitMode: data.unitMode ?? existing.unitMode,
      unitMasterId: data.unitMasterId === undefined ? existing.unitMasterId : data.unitMasterId,
      unitCustomId: data.unitCustomId === undefined ? existing.unitCustomId : data.unitCustomId,
      unit: data.unit === undefined ? existing.unit : data.unit,
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(materialEntries.materialEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeMachineryEntry(existingId: string, data: {
  count: number;
  hoursActive: string | null;
  totalCost: string;
  remarks?: string | null;
}) {
  const existing = await getEntryById(existingId, "machinery") as typeof machineryEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(machineryEntries)
    .set({
      count: Number(existing.count ?? 0) + Number(data.count ?? 0),
      hoursActive: data.hoursActive == null
        ? existing.hoursActive
        : addDecimal(existing.hoursActive, data.hoursActive),
      totalCost: addDecimal(existing.totalCost, data.totalCost),
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(machineryEntries.machineryEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeExpenseEntry(existingId: string, data: {
  amount: string;
  description: string;
}) {
  const existing = await getEntryById(existingId, "expense") as typeof expenseEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(expenseEntries)
    .set({
      amount: addDecimal(existing.amount, data.amount),
      description: existing.description || data.description,
      updatedAt: new Date(),
    })
    .where(eq(expenseEntries.expenseEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

// Vocabulary moved to lib/types/entry.ts so client modules can import it
// without rooting their type graph in the Drizzle layer (audit F13).
// Re-exported here for one release; remove once all imports are updated.
export type { EntryType, MaterialWorkStage } from "@/lib/types/entry";

export type SiteOperationSummary = Record<EntryType, {
  todayCount: number;
  todaySpend: number | null;
  totalCount: number;
  totalSpend: number | null;
}>;

// The next three functions used to be five-case switches each. They are now
// descriptor lookups: the table/id-column knowledge lives in
// lib/entryTypes/server.ts, and the generic <T extends EntryType> signature
// keeps each caller's row type narrowed exactly as the switches did.
export async function getEntryById<T extends EntryType>(
  entryId: string,
  type: T,
): Promise<RowByType[T] | null> {
  const d = serverDescriptorFor(type);
  // Defence in depth: `type` reaches this function from a URL query string in
  // app/api/entries/[id]/route.ts. That route validates it first, but an
  // unvalidated caller must still get the old switch's `default: return null`.
  if (!d) return null;
  const r = await db.select().from(d.table).where(eq(d.idColumn, entryId));
  // The descriptor map guarantees table↔type correspondence; this cast is the
  // one place that knowledge crosses from data into the type system.
  return (r[0] as RowByType[T] | undefined) ?? null;
}

export async function updateEntryById<T extends EntryType>(
  entryId: string,
  type: T,
  data: Record<string, unknown>,
): Promise<RowByType[T] | null> {
  // SECURITY: see stripImmutableEntryFields — mass-assignment control, pinned
  // by lib/services/entries.test.ts. Do not inline it back into a per-type list.
  const safeData = stripImmutableEntryFields(data);

  const d = serverDescriptorFor(type);
  if (!d) return null;
  const r = await db
    .update(d.table)
    .set({ ...safeData, updatedAt: new Date() })
    .where(eq(d.idColumn, entryId))
    .returning();
  return (r[0] as RowByType[T] | undefined) ?? null;
}

export async function deleteEntryById<T extends EntryType>(
  entryId: string,
  type: T,
): Promise<RowByType[T] | null> {
  const d = serverDescriptorFor(type);
  if (!d) return null;
  const r = await db.delete(d.table).where(eq(d.idColumn, entryId)).returning();
  return (r[0] as RowByType[T] | undefined) ?? null;
}

export type EntriesFilters = {
  from?: string;
  to?: string;
  limit?: number;
  category?: string;
  workStage?: MaterialWorkStage;
  sort?: "newest" | "oldest" | "highest_spend" | "lowest_spend";
  /**
   * For type="all" only. When false/omitted, each per-type list is capped to
   * ALL_TYPE_PREVIEW_LIMIT (dashboard/preview use). When true, the full
   * clampLimit() cap (<=200 per type) applies. Ignored for single types.
   */
  fullAll?: boolean;
  /**
   * Opaque keyset cursor from a previous page's last row. Ignored for the spend
   * sorts (see isPaginatedSort) and silently ignored when malformed.
   */
  cursor?: string;
};

// --- Keyset pagination (F15) -----------------------------------------------
//
// The list is ordered by (date DESC, created_at DESC) behind a composite index
// on (site_id, date DESC, created_at DESC), so paging uses a row-value
// comparison against the last row of the previous page rather than OFFSET,
// which re-scans every row it skips. `id` is the final tiebreaker: (date,
// created_at) is not unique, and a page boundary inside a tie would otherwise
// skip or repeat rows.
//
// Incident has no `date` column, so its cursor carries date: null and compares
// on (created_at, id) alone.
export type EntriesCursor = {
  /** The identity id of the last row on the previous page. */
  id: number;
};

export function encodeEntriesCursor(cursor: EntriesCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

// Cursors arrive from the query string, so they are attacker-controlled. A
// cursor that is malformed, truncated or hand-forged degrades to "no cursor"
// (i.e. the first page) — never an exception, never a 500. It carries no
// authorization either: see entriesCursorPredicate.
export function decodeEntriesCursor(raw: string | undefined | null): EntriesCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const { id } = parsed as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
    return { id };
  } catch {
    return null;
  }
}

// Spend sorting happens in JS (sortSpendRows) AFTER the limit, so it only
// orders within a page — keyset pagination and post-hoc sorting are
// incompatible. Pagination is therefore offered only for the two date sorts;
// the spend sorts keep the 200 cap and its advisory banner.
export function isPaginatedSort(sort: EntriesFilters["sort"]): boolean {
  return sort === undefined || sort === "newest" || sort === "oldest";
}

// Order targets for a list query. `id` is appended as the final tiebreaker so
// the order is total — which is what makes the keyset predicate below sound.
// For the four dated types this is (date, created_at, id); incident has no date
// column, so it is (created_at, id).
export function entriesOrderTargets(
  d: EntryTypeServerDescriptor,
  sort: EntriesFilters["sort"],
) {
  const columns = d.dateColumn
    ? [d.dateColumn, d.createdAtColumn, d.identityColumn]
    : [d.createdAtColumn, d.identityColumn];
  return columns.map((column) => (sort === "oldest" ? asc(column) : desc(column)));
}

// Row-value comparison against the last row of the previous page. Postgres
// compares tuples left to right, which is exactly the composite order above, so
// this uses the (site_id, date DESC, created_at DESC) index instead of scanning
// and discarding the rows an OFFSET would skip.
//
// The boundary values are read back from the row itself rather than carried in
// the cursor. created_at is a microsecond-precision timestamp, but any cursor
// that travelled through JSON has been through a JS Date and lost everything
// below the millisecond — comparing against that truncated value re-emits the
// boundary row (or skips its neighbours). Looking the row up by id keeps the
// comparison exact.
//
// The lookup is scoped to the same siteId as the outer query, so a cursor
// forged from another site's row simply finds nothing and yields the first page
// — it can neither widen the result set nor confirm that a foreign id exists.
//
// Returns undefined — no predicate, first page — when there is no cursor, when
// the cursor is malformed, or when the sort is one of the spend sorts.
export function entriesCursorPredicate(
  d: EntryTypeServerDescriptor,
  rawCursor: string | undefined,
  sort: EntriesFilters["sort"],
  siteId: string,
): SQL | undefined {
  if (!isPaginatedSort(sort)) return undefined;
  const cursor = decodeEntriesCursor(rawCursor);
  if (!cursor) return undefined;

  const comparison = sort === "oldest" ? sql`>` : sql`<`;
  const boundaryScope = sql`${d.identityColumn} = ${cursor.id} and ${d.siteIdColumn} = ${siteId}::uuid`;
  const rowValue = d.dateColumn
    ? sql`(${d.dateColumn}, ${d.createdAtColumn}, ${d.identityColumn})`
    : sql`(${d.createdAtColumn}, ${d.identityColumn})`;
  const boundary = d.dateColumn
    ? sql`(select ${d.dateColumn}, ${d.createdAtColumn}, ${d.identityColumn} from ${d.table} where ${boundaryScope})`
    : sql`(select ${d.createdAtColumn}, ${d.identityColumn} from ${d.table} where ${boundaryScope})`;

  // An unknown id means "first page", not "empty page": without the guard the
  // subquery is NULL and the comparison filters everything out.
  return sql`(not exists (select 1 from ${d.table} where ${boundaryScope}) or ${rowValue} ${comparison} ${boundary})`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function sortSpendRows<T>(
  rows: T[],
  sort: EntriesFilters["sort"],
  amount: (row: T) => number,
) {
  if (sort === "highest_spend") {
    return [...rows].sort((a, b) => amount(b) - amount(a));
  }
  if (sort === "lowest_spend") {
    return [...rows].sort((a, b) => amount(a) - amount(b));
  }
  return rows;
}

// Accepts the shared db or a transaction handle (for tests / guarded callers).
type SummaryExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

// Per-site daily counts and spend computed entirely in SQL. Previously this pulled
// every one of the day's rows across five tables into JS just to count and sum
// them. The labour spend CASE mirrors calculateLabourTotal (mason+helper split,
// each role count × per-person wage → stored salary → people_count *
// wage_per_head); incident has no spend. Incidents
// filter on created_at::date (no `date` column).
export async function siteOperationSummary(
  executor: SummaryExecutor,
  siteId: string,
  date: string = todayIsoDate(),
): Promise<SiteOperationSummary> {
  // Single roundtrip: today (date-filtered) + all-time cumulative per operation.
  // Kept as one query to respect the connection-pool guard (no N+1 fan-out).
  // mason/helper amounts are per-person wages, so each role costs count × wage.
  // The multiplication must appear in the WHEN guard as well as the THEN, or a
  // wage with no head count would take this branch and report the bare wage.
  const labourSpendExpr = sql`sum(case
        when coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)>0
          then coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)
        when coalesce(salary_amount,0)>0 then salary_amount
        else coalesce(people_count,0)*coalesce(wage_per_head,0)
      end)`;
  const rows = (await executor.execute(sql`
    select
      (select count(*)::int from labour_entries where site_id=${siteId}::uuid and date=${date}) as labour_count,
      coalesce((select ${labourSpendExpr} from labour_entries where site_id=${siteId}::uuid and date=${date}),0) as labour_spend,
      (select count(*)::int from labour_entries where site_id=${siteId}::uuid) as labour_total_count,
      coalesce((select ${labourSpendExpr} from labour_entries where site_id=${siteId}::uuid),0) as labour_total_spend,
      (select count(*)::int from material_entries where site_id=${siteId}::uuid and date=${date}) as material_count,
      coalesce((select sum(coalesce(cost,0)) from material_entries where site_id=${siteId}::uuid and date=${date}),0) as material_spend,
      (select count(*)::int from material_entries where site_id=${siteId}::uuid) as material_total_count,
      coalesce((select sum(coalesce(cost,0)) from material_entries where site_id=${siteId}::uuid),0) as material_total_spend,
      (select count(*)::int from machinery_entries where site_id=${siteId}::uuid and date=${date}) as machinery_count,
      coalesce((select sum(coalesce(total_cost,0)) from machinery_entries where site_id=${siteId}::uuid and date=${date}),0) as machinery_spend,
      (select count(*)::int from machinery_entries where site_id=${siteId}::uuid) as machinery_total_count,
      coalesce((select sum(coalesce(total_cost,0)) from machinery_entries where site_id=${siteId}::uuid),0) as machinery_total_spend,
      (select count(*)::int from expense_entries where site_id=${siteId}::uuid and date=${date}) as expense_count,
      coalesce((select sum(coalesce(amount,0)) from expense_entries where site_id=${siteId}::uuid and date=${date}),0) as expense_spend,
      (select count(*)::int from expense_entries where site_id=${siteId}::uuid) as expense_total_count,
      coalesce((select sum(coalesce(amount,0)) from expense_entries where site_id=${siteId}::uuid),0) as expense_total_spend,
      (select count(*)::int from incident_reports where site_id=${siteId}::uuid and created_at::date=${date}) as incident_count,
      (select count(*)::int from incident_reports where site_id=${siteId}::uuid) as incident_total_count
  `)) as Array<Record<string, string | number>>;

  const r = rows[0] ?? {};
  const num = (v: string | number | undefined) => Number(v ?? 0);
  return {
    labour: { todayCount: num(r.labour_count), todaySpend: num(r.labour_spend), totalCount: num(r.labour_total_count), totalSpend: num(r.labour_total_spend) },
    material: { todayCount: num(r.material_count), todaySpend: num(r.material_spend), totalCount: num(r.material_total_count), totalSpend: num(r.material_total_spend) },
    machinery: { todayCount: num(r.machinery_count), todaySpend: num(r.machinery_spend), totalCount: num(r.machinery_total_count), totalSpend: num(r.machinery_total_spend) },
    expense: { todayCount: num(r.expense_count), todaySpend: num(r.expense_spend), totalCount: num(r.expense_total_count), totalSpend: num(r.expense_total_spend) },
    incident: { todayCount: num(r.incident_count), todaySpend: null, totalCount: num(r.incident_total_count), totalSpend: null },
  };
}

export async function getSiteOperationSummary(
  siteId: string,
  date = todayIsoDate(),
): Promise<SiteOperationSummary> {
  return siteOperationSummary(db, siteId, date);
}

export async function getEntriesBySite(
  siteId: string,
  type: EntryType | "all",
  filters?: EntriesFilters,
) {
  const from = filters?.from;
  const to = filters?.to;
  const category = filters?.category?.trim();
  const workStage = filters?.workStage;
  const sort = filters?.sort ?? "newest";
  const limit = computeEntriesLimit(type, filters?.limit, filters?.fullAll);

  // One fetcher parameterised by descriptor, replacing five near-identical
  // bodies. Every per-type asymmetry that used to be a separate closure is now
  // descriptor data:
  //   - incident has no `date` column, so the date predicate and the sort both
  //     fall back to created_at (cast to ::date for the predicate, so a
  //     YYYY-MM-DD upper bound still includes entries logged later that day);
  //   - incident's category chip matches type OR severity (categoryFilter);
  //   - incident has no work stage and no spend (workStageColumn/spendOf null).
  // Generic over T so each caller keeps the row type the five hand-written
  // fetchers used to give it; the descriptor map is what makes the cast sound.
  const fetchEntriesOfType = async <T extends EntryType>(
    entryType: T,
  ): Promise<RowByType[T][]> => {
    const d = serverDescriptorFor(entryType);
    // Always the SQL form: for the four dated types dateExpr is just the `date`
    // column reference, and for incident it is created_at::date. Using one
    // uniform SQL target keeps the comparison overloads unambiguous.
    const dateTarget = d.dateExpr;

    const datePredicate =
      from && to
        ? and(gte(dateTarget, from), lte(dateTarget, to))
        : from
          ? gte(dateTarget, from)
          : to
            ? lte(dateTarget, to)
            : undefined;


    const rows = await db
      // Projected, not SELECT * — see EntryTypeServerDescriptor.listColumns.
      .select(d.listColumns)
      .from(d.table)
      .where(and(
        eq(d.siteIdColumn, siteId),
        datePredicate,
        category ? d.categoryFilter(category) : undefined,
        workStage && d.workStageColumn ? eq(d.workStageColumn, workStage) : undefined,
        // Keyset continuation. siteId above is still the authoritative scope, so
        // a cursor from another site cannot widen the result set.
        entriesCursorPredicate(d, filters?.cursor, sort, siteId),
      ))
      .orderBy(...entriesOrderTargets(d, sort))
      .limit(limit);

    const spendOf = d.spendOf;
    const ordered = spendOf ? sortSpendRows(rows, sort, (row) => spendOf(row)) : rows;
    return ordered as RowByType[T][];
  };

  switch (type) {
    case "labour":
      return fetchEntriesOfType("labour");
    case "material":
      return fetchEntriesOfType("material");
    case "machinery":
      return fetchEntriesOfType("machinery");
    case "expense":
      return fetchEntriesOfType("expense");
    case "incident":
      return fetchEntriesOfType("incident");
    case "all": {
      const [labour, material, machinery, expense, incident] = await Promise.all([
        fetchEntriesOfType("labour"),
        fetchEntriesOfType("material"),
        fetchEntriesOfType("machinery"),
        fetchEntriesOfType("expense"),
        fetchEntriesOfType("incident"),
      ]);

      return {
        labour,
        material,
        machinery,
        expense,
        incident,
      };
    }
    default:
      return [];
  }
}
