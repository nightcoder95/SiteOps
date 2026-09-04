import { eq, sql, type SQL } from "drizzle-orm";
import type { ZodType } from "zod";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";

import {
  calculateLabourTotal,
  calculateMachineryTotal,
} from "@/lib/db/queries/operationTotals";
import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";
import type { EntryType } from "@/lib/types/entry";
import {
  expenseEntrySchema,
  incidentEntrySchema,
  labourEntrySchema,
  machineryEntrySchema,
  materialEntrySchema,
  updateExpenseEntrySchema,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

// One descriptor per entry type, server half. Everything here is safe to import
// from a route handler or a query module; the client half (labels, icons, JSX
// summaries, form fields) lives in ./client so server code never pulls React in.
//
// Incident is a genuine fifth type but is spendless and has no `date` column —
// it filters on created_at::date. Those two asymmetries are modelled
// explicitly (`hasSpend`, `dateColumn: null` + `dateExpr`) rather than
// special-cased at each call site, which is what the switches used to do.
export type EntryTypeServerDescriptor = {
  type: EntryType;
  table: AnyPgTable;
  idColumn: PgColumn;
  idField: string;
  siteIdColumn: PgColumn;
  // The integer identity column. It is the final keyset-pagination tiebreaker:
  // (date, created_at) is not unique, so without it a page boundary landing
  // inside a group of rows sharing a timestamp would skip or repeat rows.
  identityColumn: PgColumn;
  createdAtColumn: PgColumn;
  dateColumn: PgColumn | null;
  dateExpr: SQL;
  categoryColumn: PgColumn | null;
  workStageColumn: PgColumn | null;
  // Predicate for a category chip. Not just `eq(categoryColumn, v)`: incident
  // matches either its type or its severity, which is why this is a function
  // and not a column reference at the call site.
  categoryFilter: (value: string) => SQL | undefined;
  decimalFields: readonly string[];
  hasSpend: boolean;
  // Row -> money. null exactly when hasSpend is false (incident).
  spendOf: ((row: Record<string, unknown>) => number) | null;
  // Typed to the shape route handlers actually consume: a plain object of
  // validated fields they spread into the update payload.
  zodCreate: ZodType<Record<string, unknown>>;
  zodUpdate: ZodType<Record<string, unknown>>;
  // Catalog-backed fields validated against a managed list on write, as
  // [listKey, fieldName] pairs. ORDER MATTERS: the PATCH route reports the
  // first failure, so expense must check Work Stage before Expense Category.
  catalogFields: ReadonlyArray<readonly [string, string]>;
  // Columns the list views actually read (F15). getEntriesBySite used SELECT *,
  // pulling every column — including the full `remarks` text — for up to 1000
  // rows on the all-operations view. `remarks` is truncated rather than omitted
  // because the card summary renders it; dropping it would blank that line for
  // labour/material/machinery. getEntryById deliberately keeps SELECT *: it
  // feeds the edit form, which needs every column.
  listColumns: Record<string, PgColumn | SQL>;
};

const DESCRIPTORS = {
  labour: {
    type: "labour",
    table: labourEntries,
    idColumn: labourEntries.labourEntryId,
    idField: "labourEntryId",
    siteIdColumn: labourEntries.siteId,
    identityColumn: labourEntries.id,
    createdAtColumn: labourEntries.createdAt,
    dateColumn: labourEntries.date,
    dateExpr: sql`${labourEntries.date}`,
    categoryColumn: labourEntries.workType,
    workStageColumn: labourEntries.workStage,
    decimalFields: ["wagePerHead", "salaryAmount", "masonSalaryAmount", "helperSalaryAmount"],
    categoryFilter: (value: string) => eq(labourEntries.workType, value),
    hasSpend: true,
    spendOf: (row) => calculateLabourTotal(row as Parameters<typeof calculateLabourTotal>[0]),
    zodCreate: labourEntrySchema,
    zodUpdate: updateLabourEntrySchema,
    listColumns: {
      id: labourEntries.id,
      labourEntryId: labourEntries.labourEntryId,
      siteId: labourEntries.siteId,
      date: labourEntries.date,
      workType: labourEntries.workType,
      workStage: labourEntries.workStage,
      peopleCount: labourEntries.peopleCount,
      wagePerHead: labourEntries.wagePerHead,
      salaryAmount: labourEntries.salaryAmount,
      masonCount: labourEntries.masonCount,
      masonSalaryAmount: labourEntries.masonSalaryAmount,
      helperCount: labourEntries.helperCount,
      helperSalaryAmount: labourEntries.helperSalaryAmount,
      createdBy: labourEntries.createdBy,
      createdAt: labourEntries.createdAt,
      remarks: sql<string | null>`left(${labourEntries.remarks}, 160)`,
    },
    catalogFields: [["Work Stage", "workStage"]] as const,
  },
  material: {
    type: "material",
    table: materialEntries,
    idColumn: materialEntries.materialEntryId,
    idField: "materialEntryId",
    siteIdColumn: materialEntries.siteId,
    identityColumn: materialEntries.id,
    createdAtColumn: materialEntries.createdAt,
    dateColumn: materialEntries.date,
    dateExpr: sql`${materialEntries.date}`,
    categoryColumn: materialEntries.materialType,
    workStageColumn: materialEntries.workStage,
    decimalFields: ["quantity", "cost"],
    categoryFilter: (value: string) => eq(materialEntries.materialType, value),
    hasSpend: true,
    spendOf: (row) => Number(row.cost ?? 0),
    zodCreate: materialEntrySchema,
    zodUpdate: updateMaterialEntrySchema,
    listColumns: {
      id: materialEntries.id,
      materialEntryId: materialEntries.materialEntryId,
      siteId: materialEntries.siteId,
      date: materialEntries.date,
      materialType: materialEntries.materialType,
      workStage: materialEntries.workStage,
      quantity: materialEntries.quantity,
      unit: materialEntries.unit,
      cost: materialEntries.cost,
      createdBy: materialEntries.createdBy,
      createdAt: materialEntries.createdAt,
      remarks: sql<string | null>`left(${materialEntries.remarks}, 160)`,
    },
    catalogFields: [["Work Stage", "workStage"]] as const,
  },
  machinery: {
    type: "machinery",
    table: machineryEntries,
    idColumn: machineryEntries.machineryEntryId,
    idField: "machineryEntryId",
    siteIdColumn: machineryEntries.siteId,
    identityColumn: machineryEntries.id,
    createdAtColumn: machineryEntries.createdAt,
    dateColumn: machineryEntries.date,
    dateExpr: sql`${machineryEntries.date}`,
    categoryColumn: machineryEntries.equipmentType,
    workStageColumn: machineryEntries.workStage,
    decimalFields: ["hoursActive", "totalCost"],
    categoryFilter: (value: string) => eq(machineryEntries.equipmentType, value),
    hasSpend: true,
    spendOf: (row) => calculateMachineryTotal(row as Parameters<typeof calculateMachineryTotal>[0]),
    zodCreate: machineryEntrySchema,
    zodUpdate: updateMachineryEntrySchema,
    listColumns: {
      id: machineryEntries.id,
      machineryEntryId: machineryEntries.machineryEntryId,
      siteId: machineryEntries.siteId,
      date: machineryEntries.date,
      equipmentType: machineryEntries.equipmentType,
      workStage: machineryEntries.workStage,
      count: machineryEntries.count,
      hoursActive: machineryEntries.hoursActive,
      totalCost: machineryEntries.totalCost,
      createdBy: machineryEntries.createdBy,
      createdAt: machineryEntries.createdAt,
      remarks: sql<string | null>`left(${machineryEntries.remarks}, 160)`,
    },
    catalogFields: [["Work Stage", "workStage"]] as const,
  },
  expense: {
    type: "expense",
    table: expenseEntries,
    idColumn: expenseEntries.expenseEntryId,
    idField: "expenseEntryId",
    siteIdColumn: expenseEntries.siteId,
    identityColumn: expenseEntries.id,
    createdAtColumn: expenseEntries.createdAt,
    dateColumn: expenseEntries.date,
    dateExpr: sql`${expenseEntries.date}`,
    categoryColumn: expenseEntries.category,
    workStageColumn: expenseEntries.workStage,
    decimalFields: ["amount"],
    categoryFilter: (value: string) => eq(expenseEntries.category, value),
    hasSpend: true,
    spendOf: (row) => Number(row.amount ?? 0),
    zodCreate: expenseEntrySchema,
    zodUpdate: updateExpenseEntrySchema,
    // expense_entries has no remarks column; `description` carries the body.
    listColumns: {
      id: expenseEntries.id,
      expenseEntryId: expenseEntries.expenseEntryId,
      siteId: expenseEntries.siteId,
      date: expenseEntries.date,
      description: expenseEntries.description,
      amount: expenseEntries.amount,
      category: expenseEntries.category,
      workStage: expenseEntries.workStage,
      createdBy: expenseEntries.createdBy,
      createdAt: expenseEntries.createdAt,
    },
    catalogFields: [["Work Stage", "workStage"], ["Expense Category", "category"]] as const,
  },
  incident: {
    type: "incident",
    table: incidentReports,
    idColumn: incidentReports.incidentReportId,
    idField: "incidentReportId",
    siteIdColumn: incidentReports.siteId,
    identityColumn: incidentReports.id,
    createdAtColumn: incidentReports.createdAt,
    // No `date` column — the whole app filters incidents on created_at cast to
    // a date, so a YYYY-MM-DD upper bound still includes same-day entries.
    dateColumn: null,
    dateExpr: sql`${incidentReports.createdAt}::date`,
    categoryColumn: incidentReports.incidentType,
    workStageColumn: null,
    decimalFields: [],
    // One chip matches either the incident type or its severity — wider than
    // the plain equality the other four use.
    categoryFilter: (value: string) =>
      sql`(${incidentReports.incidentType} = ${value} OR ${incidentReports.severity} = ${value})`,
    hasSpend: false,
    spendOf: null,
    zodCreate: incidentEntrySchema,
    zodUpdate: updateIncidentEntrySchema,
    // No date column, no spend, and `description` is the summary body itself —
    // so it is projected whole rather than truncated.
    listColumns: {
      id: incidentReports.id,
      incidentReportId: incidentReports.incidentReportId,
      siteId: incidentReports.siteId,
      incidentType: incidentReports.incidentType,
      severity: incidentReports.severity,
      description: incidentReports.description,
      reportedBy: incidentReports.reportedBy,
      createdAt: incidentReports.createdAt,
    },
    catalogFields: [["Incident Type", "incidentType"], ["Incident Severity", "severity"]] as const,
  },
} satisfies Record<EntryType, EntryTypeServerDescriptor>;

export const ENTRY_TYPES = Object.keys(DESCRIPTORS) as readonly EntryType[];

export function serverDescriptorFor(type: EntryType): EntryTypeServerDescriptor {
  return DESCRIPTORS[type];
}
