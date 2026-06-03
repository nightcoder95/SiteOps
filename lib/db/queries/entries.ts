import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

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
} from "@/lib/db/queries/operationTotals";

export {
  calculateLabourTotal,
  calculateMachineryTotal,
  calculateMaterialUnitRate,
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
  workStage:
    | "Basement Level"
    | "Brick Level"
    | "Lintel Level"
    | "Roof Level"
    | "Compound Wall"
    | "Other";
  cost: string;
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
  category: "Labour" | "Materials" | "Equipment" | "Misc";
  createdBy: string;
}) {
  const result = await db.insert(expenseEntries).values(data).returning();
  return result[0];
}

export async function insertIncidentReport(data: {
  siteId: string;
  incidentType: "Safety" | "Block";
  severity: "Low" | "Medium" | "High" | "Critical";
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
  category: "Labour" | "Materials" | "Equipment" | "Misc",
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

  const result = await db
    .update(labourEntries)
    .set({
      peopleCount: Number(existing.peopleCount ?? 0) + Number(data.peopleCount ?? 0),
      salaryAmount: addDecimal(existing.salaryAmount, data.salaryAmount),
      masonCount: Number(existing.masonCount ?? 0) + Number(data.masonCount ?? 0),
      masonSalaryAmount: addDecimal(existing.masonSalaryAmount, data.masonSalaryAmount),
      helperCount: Number(existing.helperCount ?? 0) + Number(data.helperCount ?? 0),
      helperSalaryAmount: addDecimal(existing.helperSalaryAmount, data.helperSalaryAmount),
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
  remarks?: string | null;
}) {
  const existing = await getEntryById(existingId, "material") as typeof materialEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(materialEntries)
    .set({
      quantity: addDecimal(existing.quantity, data.quantity),
      cost: addDecimal(existing.cost, data.cost),
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

export type EntryType =
  | "labour"
  | "material"
  | "machinery"
  | "expense"
  | "incident";

export type MaterialWorkStage =
  | "Basement Level"
  | "Brick Level"
  | "Lintel Level"
  | "Roof Level"
  | "Compound Wall"
  | "Other";

export type SiteOperationSummary = Record<EntryType, {
  todayCount: number;
  todaySpend: number | null;
}>;

export async function getEntryById(entryId: string, type: EntryType) {
  switch (type) {
    case "labour": {
      const r = await db
        .select()
        .from(labourEntries)
        .where(eq(labourEntries.labourEntryId, entryId));
      return r[0] ?? null;
    }
    case "material": {
      const r = await db
        .select()
        .from(materialEntries)
        .where(eq(materialEntries.materialEntryId, entryId));
      return r[0] ?? null;
    }
    case "machinery": {
      const r = await db
        .select()
        .from(machineryEntries)
        .where(eq(machineryEntries.machineryEntryId, entryId));
      return r[0] ?? null;
    }
    case "expense": {
      const r = await db
        .select()
        .from(expenseEntries)
        .where(eq(expenseEntries.expenseEntryId, entryId));
      return r[0] ?? null;
    }
    case "incident": {
      const r = await db
        .select()
        .from(incidentReports)
        .where(eq(incidentReports.incidentReportId, entryId));
      return r[0] ?? null;
    }
    default:
      return null;
  }
}

export async function updateEntryById(
  entryId: string,
  type: EntryType,
  data: Record<string, unknown>
) {
  // Strip fields that must never be changed after creation to prevent
  // accidental or malicious overwrites of immutable/protected columns.
  const {
    siteId: _siteId,
    createdBy: _createdBy,
    reportedBy: _reportedBy,
    labourEntryId: _labourId,
    materialEntryId: _materialId,
    machineryEntryId: _machineryId,
    expenseEntryId: _expenseId,
    incidentReportId: _incidentId,
    id: _id,
    ...safeData
  } = data;

  switch (type) {
    case "labour": {
      const r = await db
        .update(labourEntries)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(labourEntries.labourEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "material": {
      const r = await db
        .update(materialEntries)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(materialEntries.materialEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "machinery": {
      const r = await db
        .update(machineryEntries)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(machineryEntries.machineryEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "expense": {
      const r = await db
        .update(expenseEntries)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(expenseEntries.expenseEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "incident": {
      const r = await db
        .update(incidentReports)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(incidentReports.incidentReportId, entryId))
        .returning();
      return r[0] ?? null;
    }
    default:
      return null;
  }
}

export async function deleteEntryById(entryId: string, type: EntryType) {
  switch (type) {
    case "labour": {
      const r = await db
        .delete(labourEntries)
        .where(eq(labourEntries.labourEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "material": {
      const r = await db
        .delete(materialEntries)
        .where(eq(materialEntries.materialEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "machinery": {
      const r = await db
        .delete(machineryEntries)
        .where(eq(machineryEntries.machineryEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "expense": {
      const r = await db
        .delete(expenseEntries)
        .where(eq(expenseEntries.expenseEntryId, entryId))
        .returning();
      return r[0] ?? null;
    }
    case "incident": {
      const r = await db
        .delete(incidentReports)
        .where(eq(incidentReports.incidentReportId, entryId))
        .returning();
      return r[0] ?? null;
    }
    default:
      return null;
  }
}

export type EntriesFilters = {
  from?: string;
  to?: string;
  limit?: number;
  category?: string;
  workStage?: MaterialWorkStage;
  sort?: "newest" | "oldest" | "highest_spend" | "lowest_spend";
};

// Default page size when caller does not specify. Keeps initial site-detail
// payload small enough to avoid 1MB+ RSC responses while still showing a
// useful first screen of activity.
export const DEFAULT_ENTRIES_LIMIT = 50;

// The grouped "all" view only renders a few rows per type, so fetching the
// full page for each of the 5 tables is wasted work and payload.
export const ALL_TYPE_PREVIEW_LIMIT = 5;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function clampLimit(value: number | undefined) {
  if (!value || Number.isNaN(value)) return DEFAULT_ENTRIES_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), 200);
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

export async function getSiteOperationSummary(
  siteId: string,
  date = todayIsoDate(),
): Promise<SiteOperationSummary> {
  const [labour, material, machinery, expense, incident] = await Promise.all([
    db
      .select()
      .from(labourEntries)
      .where(and(eq(labourEntries.siteId, siteId), eq(labourEntries.date, date))),
    db
      .select()
      .from(materialEntries)
      .where(and(eq(materialEntries.siteId, siteId), eq(materialEntries.date, date))),
    db
      .select()
      .from(machineryEntries)
      .where(and(eq(machineryEntries.siteId, siteId), eq(machineryEntries.date, date))),
    db
      .select()
      .from(expenseEntries)
      .where(and(eq(expenseEntries.siteId, siteId), eq(expenseEntries.date, date))),
    db
      .select()
      .from(incidentReports)
      .where(and(eq(incidentReports.siteId, siteId), eq(sql`${incidentReports.createdAt}::date`, date))),
  ]);

  return {
    labour: {
      todayCount: labour.length,
      todaySpend: labour.reduce(
        (sum, row) => sum + calculateLabourTotal(row),
        0,
      ),
    },
    material: {
      todayCount: material.length,
      todaySpend: material.reduce((sum, row) => sum + Number(row.cost ?? 0), 0),
    },
    machinery: {
      todayCount: machinery.length,
      todaySpend: machinery.reduce((sum, row) => sum + calculateMachineryTotal(row), 0),
    },
    expense: {
      todayCount: expense.length,
      todaySpend: expense.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    },
    incident: {
      todayCount: incident.length,
      todaySpend: null,
    },
  };
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
  const limit =
    type === "all"
      ? Math.min(clampLimit(filters?.limit), ALL_TYPE_PREVIEW_LIMIT)
      : clampLimit(filters?.limit);

  const dateWhere = (tableDateCol: any) => {
    if (from && to) return and(gte(tableDateCol, from), lte(tableDateCol, to));
    if (from) return gte(tableDateCol, from);
    if (to) return lte(tableDateCol, to);
    return undefined;
  };

  // incident_reports has no `date` column — it filters on the `created_at`
  // timestamp. Cast to date so a YYYY-MM-DD upper bound still includes
  // entries logged later that same day.
  const incidentDateWhere = () => {
    const col = sql`${incidentReports.createdAt}::date`;
    if (from && to) return and(gte(col, from), lte(col, to));
    if (from) return gte(col, from);
    if (to) return lte(col, to);
    return undefined;
  };

  const fetchLabour = async () => {
    const rows = await db
      .select()
      .from(labourEntries)
      .where(and(
        eq(labourEntries.siteId, siteId),
        dateWhere(labourEntries.date),
        category ? eq(labourEntries.workType, category) : undefined,
      ))
      .orderBy(
        sort === "oldest" ? asc(labourEntries.date) : desc(labourEntries.date),
        sort === "oldest" ? asc(labourEntries.createdAt) : desc(labourEntries.createdAt),
      )
      .limit(limit);
    return sortSpendRows(rows, sort, (row) => calculateLabourTotal(row));
  };

  const fetchMaterial = async () => {
    const rows = await db
      .select()
      .from(materialEntries)
      .where(and(
        eq(materialEntries.siteId, siteId),
        dateWhere(materialEntries.date),
        category ? eq(materialEntries.materialType, category) : undefined,
        workStage ? eq(materialEntries.workStage, workStage) : undefined,
      ))
      .orderBy(
        sort === "oldest" ? asc(materialEntries.date) : desc(materialEntries.date),
        sort === "oldest" ? asc(materialEntries.createdAt) : desc(materialEntries.createdAt),
      )
      .limit(limit);
    return sortSpendRows(rows, sort, (row) => Number(row.cost ?? 0));
  };

  const fetchMachinery = async () => {
    const rows = await db
      .select()
      .from(machineryEntries)
      .where(and(
        eq(machineryEntries.siteId, siteId),
        dateWhere(machineryEntries.date),
        category ? eq(machineryEntries.equipmentType, category) : undefined,
      ))
      .orderBy(
        sort === "oldest" ? asc(machineryEntries.date) : desc(machineryEntries.date),
        sort === "oldest" ? asc(machineryEntries.createdAt) : desc(machineryEntries.createdAt),
      )
      .limit(limit);
    return sortSpendRows(rows, sort, (row) => calculateMachineryTotal(row));
  };

  const fetchExpense = async () => {
    const rows = await db
      .select()
      .from(expenseEntries)
      .where(and(
        eq(expenseEntries.siteId, siteId),
        dateWhere(expenseEntries.date),
        category ? eq(expenseEntries.category, category as "Labour" | "Materials" | "Equipment" | "Misc") : undefined,
      ))
      .orderBy(
        sort === "oldest" ? asc(expenseEntries.date) : desc(expenseEntries.date),
        sort === "oldest" ? asc(expenseEntries.createdAt) : desc(expenseEntries.createdAt),
      )
      .limit(limit);
    return sortSpendRows(rows, sort, (row) => Number(row.amount ?? 0));
  };

  const fetchIncident = async () =>
    db
      .select()
      .from(incidentReports)
      .where(and(
        eq(incidentReports.siteId, siteId),
        incidentDateWhere(),
        category
          ? sql`(${incidentReports.incidentType} = ${category} OR ${incidentReports.severity} = ${category})`
          : undefined,
      ))
      .orderBy(sort === "oldest" ? asc(incidentReports.createdAt) : desc(incidentReports.createdAt))
      .limit(limit);

  switch (type) {
    case "labour":
      return fetchLabour();
    case "material":
      return fetchMaterial();
    case "machinery":
      return fetchMachinery();
    case "expense":
      return fetchExpense();
    case "incident":
      return fetchIncident();
    case "all": {
      const [labour, material, machinery, expense, incident] = await Promise.all([
        fetchLabour(),
        fetchMaterial(),
        fetchMachinery(),
        fetchExpense(),
        fetchIncident(),
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
