import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

export function calculateLabourTotal(
  peopleCount: number | null | undefined,
  wagePerHead: string | number | null | undefined,
) {
  const people = Number(peopleCount ?? 0);
  const wage = Number(wagePerHead ?? 0);
  if (!Number.isFinite(people) || !Number.isFinite(wage)) return 0;
  return people * wage;
}

export function calculateMaterialUnitRate(
  cost: string | number | null | undefined,
  quantity: string | number | null | undefined,
) {
  const total = Number(cost ?? 0);
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(qty) || qty <= 0) return null;
  return total / qty;
}

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
  materialTypeEnum?: "Cement" | "M sand" | "P sand" | "Metal" | null;
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

export type EntryType =
  | "labour"
  | "material"
  | "machinery"
  | "expense"
  | "incident";

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
};

// Default page size when caller does not specify. Keeps initial site-detail
// payload small enough to avoid 1MB+ RSC responses while still showing a
// useful first screen of activity.
export const DEFAULT_ENTRIES_LIMIT = 50;

// The grouped "all" view only renders a few rows per type, so fetching the
// full page for each of the 5 tables is wasted work and payload.
export const ALL_TYPE_PREVIEW_LIMIT = 5;

function clampLimit(value: number | undefined) {
  if (!value || Number.isNaN(value)) return DEFAULT_ENTRIES_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), 200);
}

export async function getEntriesBySite(
  siteId: string,
  type: EntryType | "all",
  filters?: EntriesFilters,
) {
  const from = filters?.from;
  const to = filters?.to;
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

  const fetchLabour = async () =>
    db
      .select()
      .from(labourEntries)
      .where(and(eq(labourEntries.siteId, siteId), dateWhere(labourEntries.date)))
      .orderBy(desc(labourEntries.date), desc(labourEntries.createdAt))
      .limit(limit);

  const fetchMaterial = async () =>
    db
      .select()
      .from(materialEntries)
      .where(
        and(eq(materialEntries.siteId, siteId), dateWhere(materialEntries.date)),
      )
      .orderBy(desc(materialEntries.date), desc(materialEntries.createdAt))
      .limit(limit);

  const fetchMachinery = async () =>
    db
      .select()
      .from(machineryEntries)
      .where(
        and(eq(machineryEntries.siteId, siteId), dateWhere(machineryEntries.date)),
      )
      .orderBy(desc(machineryEntries.date), desc(machineryEntries.createdAt))
      .limit(limit);

  const fetchExpense = async () =>
    db
      .select()
      .from(expenseEntries)
      .where(
        and(eq(expenseEntries.siteId, siteId), dateWhere(expenseEntries.date)),
      )
      .orderBy(desc(expenseEntries.date), desc(expenseEntries.createdAt))
      .limit(limit);

  const fetchIncident = async () =>
    db
      .select()
      .from(incidentReports)
      .where(
        and(eq(incidentReports.siteId, siteId), incidentDateWhere()),
      )
      .orderBy(desc(incidentReports.createdAt))
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
