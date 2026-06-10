// Canonical row types for the five entry kinds, derived from Drizzle's
// `$inferSelect` so they can never drift from the table definitions. This
// replaces the `as any` cluster that escaped the type system on entry rows
// (audit A3/A4) — import these instead of casting.

import type {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

export type LabourEntryRow = typeof labourEntries.$inferSelect;
export type MaterialEntryRow = typeof materialEntries.$inferSelect;
export type MachineryEntryRow = typeof machineryEntries.$inferSelect;
export type ExpenseEntryRow = typeof expenseEntries.$inferSelect;
export type IncidentEntryRow = typeof incidentReports.$inferSelect;

// Union of every entry row shape. Labour/material/machinery/expense own a
// `createdBy`; incident reports own `reportedBy` — `entryOwnerId` normalizes
// the two so callers never reach for the wrong column.
export type EntryRow =
  | LabourEntryRow
  | MaterialEntryRow
  | MachineryEntryRow
  | ExpenseEntryRow
  | IncidentEntryRow;

// Owner of an entry, regardless of which column carries it. Single accessor so
// `createdBy ?? reportedBy ?? null` lives in exactly one place (audit A4).
export function entryOwnerId(entry: EntryRow): string | null {
  if ("createdBy" in entry && entry.createdBy) return entry.createdBy;
  if ("reportedBy" in entry && entry.reportedBy) return entry.reportedBy;
  return null;
}
