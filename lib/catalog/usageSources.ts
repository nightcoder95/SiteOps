import { type AnyPgTable, type PgColumn } from "drizzle-orm/pg-core";

import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

// Each managed-list category maps to the free-text entry column(s) its items
// are counted against (entries store the option NAME, not an FK). Shared by
// the admin overview (usage counts), the delete-guard and the merge action.
// A category name may map to MULTIPLE sources (e.g. "Work Stage" spans four
// entry tables) — callers must aggregate across usageSourcesForCategory(),
// never assume a single match.
export type UsageSource = { categoryName: string; table: AnyPgTable; column: PgColumn };

export const USAGE_SOURCES: UsageSource[] = [
  { categoryName: "Labour", table: labourEntries, column: labourEntries.workType },
  { categoryName: "Materials", table: materialEntries, column: materialEntries.materialType },
  { categoryName: "Work Stage", table: materialEntries, column: materialEntries.workStage },
  { categoryName: "Work Stage", table: labourEntries, column: labourEntries.workStage },
  { categoryName: "Work Stage", table: machineryEntries, column: machineryEntries.workStage },
  { categoryName: "Work Stage", table: expenseEntries, column: expenseEntries.workStage },
  { categoryName: "Machinery/Equipment", table: machineryEntries, column: machineryEntries.equipmentType },
  { categoryName: "Expense Category", table: expenseEntries, column: expenseEntries.category },
  { categoryName: "Incident Type", table: incidentReports, column: incidentReports.incidentType },
  { categoryName: "Incident Severity", table: incidentReports, column: incidentReports.severity },
];

export function usageSourcesForCategory(categoryName: string): UsageSource[] {
  return USAGE_SOURCES.filter((s) => s.categoryName === categoryName);
}
