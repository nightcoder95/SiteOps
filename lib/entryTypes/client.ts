import { REGISTRY_BY_TYPE, type EntryField } from "@/components/logs/entryFieldRegistry";
import { labourSpend } from "@/lib/services/labourSpend";
import type { EntryType } from "@/lib/types/entry";

// One descriptor per entry type, client half. No DB imports, no server-only
// modules — this is what UI code reads instead of re-deriving "what is a
// material entry" in seven separate if-chains.
//
// renderEntrySummary deliberately stays in entryFormat.tsx: it is ~95 lines of
// genuinely different per-type JSX, and moving it buys locality we do not need
// while risking visual regressions on five screens.
export type EntryTypeClientDescriptor = {
  type: EntryType;
  label: string;
  idField: string;
  dateField: "date" | "createdAt";
  categoryField: string;
  categoryFallback: string;
  endpoint: string;
  formFields: EntryField[];
  spendOf: (entry: Record<string, unknown>) => number;
};

const DESCRIPTORS = {
  labour: {
    type: "labour", label: "Labour", idField: "labourEntryId", dateField: "date",
    categoryField: "workType", categoryFallback: "Labour",
    endpoint: "/api/entries/labour",
    formFields: REGISTRY_BY_TYPE.labour,
    spendOf: (entry) => labourSpend(entry),
  },
  material: {
    type: "material", label: "Material", idField: "materialEntryId", dateField: "date",
    categoryField: "materialType", categoryFallback: "Material",
    endpoint: "/api/entries/materials",
    formFields: REGISTRY_BY_TYPE.material,
    spendOf: (entry) => Number(entry.cost ?? 0),
  },
  machinery: {
    type: "machinery", label: "Machinery", idField: "machineryEntryId", dateField: "date",
    categoryField: "equipmentType", categoryFallback: "Machinery",
    endpoint: "/api/entries/machinery",
    formFields: REGISTRY_BY_TYPE.machinery,
    spendOf: (entry) => Number(entry.totalCost ?? 0),
  },
  expense: {
    type: "expense", label: "Expense", idField: "expenseEntryId", dateField: "date",
    categoryField: "category", categoryFallback: "Misc",
    endpoint: "/api/entries/expenses",
    formFields: REGISTRY_BY_TYPE.expense,
    spendOf: (entry) => Number(entry.amount ?? 0),
  },
  incident: {
    type: "incident", label: "Incident", idField: "incidentReportId",
    // Incidents have no `date` column; the app reads created_at.
    dateField: "createdAt",
    categoryField: "incidentType", categoryFallback: "Incident",
    endpoint: "/api/entries/incidents",
    formFields: REGISTRY_BY_TYPE.incident,
    spendOf: () => 0,
  },
} satisfies Record<EntryType, EntryTypeClientDescriptor>;

export function clientDescriptorFor(type: EntryType): EntryTypeClientDescriptor {
  return DESCRIPTORS[type];
}
