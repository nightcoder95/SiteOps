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

// The entry-type vocabulary. It lives here, not in lib/db/queries/entries.ts,
// so client modules can import it without rooting their type graph in the
// Drizzle layer (audit F13).
export type EntryType =
  | "labour"
  | "material"
  | "machinery"
  | "expense"
  | "incident";

// Now a managed catalog list (was a pg enum), so any active value is valid.
export type MaterialWorkStage = string;

// Lookup type that keeps getEntryById/updateEntryById narrowing per type.
// Without this, collapsing the per-type switches into a table map degrades
// every caller's row type to a union or to any.
export type RowByType = {
  labour: LabourEntryRow;
  material: MaterialEntryRow;
  machinery: MachineryEntryRow;
  expense: ExpenseEntryRow;
  incident: IncidentEntryRow;
};

// Owner of an entry, regardless of which column carries it. Single accessor so
// `createdBy ?? reportedBy ?? null` lives in exactly one place (audit A4).
export function entryOwnerId(entry: EntryRow): string | null {
  if ("createdBy" in entry && entry.createdBy) return entry.createdBy;
  if ("reportedBy" in entry && entry.reportedBy) return entry.reportedBy;
  return null;
}
