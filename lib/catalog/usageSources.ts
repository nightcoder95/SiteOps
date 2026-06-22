import { type AnyPgTable, type PgColumn } from "drizzle-orm/pg-core";

import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";

// Each managed-list category maps to the free-text entry column its items are
// counted against (entries store the option NAME, not an FK). Shared by the
// admin overview (usage counts), the delete-guard and the merge action.
export type UsageSource = { categoryName: string; table: AnyPgTable; column: PgColumn };

export const USAGE_SOURCES: UsageSource[] = [
  { categoryName: "Labour", table: labourEntries, column: labourEntries.workType },
  { categoryName: "Materials", table: materialEntries, column: materialEntries.materialType },
  { categoryName: "Material Work Stage", table: materialEntries, column: materialEntries.workStage },
  { categoryName: "Machinery/Equipment", table: machineryEntries, column: machineryEntries.equipmentType },
  { categoryName: "Expense Category", table: expenseEntries, column: expenseEntries.category },
  { categoryName: "Incident Type", table: incidentReports, column: incidentReports.incidentType },
  { categoryName: "Incident Severity", table: incidentReports, column: incidentReports.severity },
];

export function usageSourceForCategory(categoryName: string): UsageSource | undefined {
  return USAGE_SOURCES.find((s) => s.categoryName === categoryName);
}
