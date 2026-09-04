import { ENTRY_FIELD_CONSTRAINTS } from "@/lib/entryTypes/constraints";
import type { EntryType } from "@/lib/types/entry";

export type FieldKind =
  | "date"
  | "number"
  | "text"
  | "textarea"
  | "subcategory"
  | "select"
  | "unit";

export type EntryField = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  subcategoryHint?: string;
  // For catalog-backed selects whose managed list lives in a *different*
  // category than the form's operation (former pg-enum fields, design §3.3).
  catalogCategoryName?: string;
  // Contextual add-CTA / label noun ("Work Stage", "Severity", …).
  noun?: string;
  // Optional subcategory field that can be explicitly cleared on edit,
  // sending `null` to un-tag rather than omitting the key.
  clearable?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  // Mobile keyboard hint. Derived from `step` when omitted: whole-number fields
  // get the numeric pad, money/quantity fields get the decimal pad. Set
  // explicitly only when the derivation is wrong for a specific field.
  inputMode?: "numeric" | "decimal";
};

export function numericInputModeFor(field: EntryField): "numeric" | "decimal" | undefined {
  if (field.kind !== "number") return undefined;
  if (field.inputMode) return field.inputMode;
  return field.step === 1 ? "numeric" : "decimal";
}

export const fallbackFields: EntryField[] = [
  { name: "date", label: "Date", kind: "date", required: true },
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "quantity", label: "Quantity", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.quantity },
  { name: "remarks", label: "Remarks", kind: "textarea" },
];

// Exported, type-safe per-type map. The client entry-type descriptor
// (lib/entryTypes/client.ts) reads its formFields from here, so the form
// shape has one home.
export const REGISTRY_BY_TYPE = {
  labour: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "workType", label: "Work Type", kind: "subcategory", required: true, subcategoryHint: "labour" },
    { name: "peopleCount", label: "People Count", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.peopleCount },
    { name: "wagePerHead", label: "Per Head Salary", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.wagePerHead },
    {
      name: "workStage",
      label: "Work Stage",
      kind: "subcategory",
      required: false,
      clearable: true,
      catalogCategoryName: "Work Stage",
      noun: "Work Stage",
    },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  material: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "materialType", label: "Material Type", kind: "subcategory", required: true, subcategoryHint: "material" },
    { name: "quantity", label: "Quantity", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.quantity },
    { name: "unit", label: "Unit", kind: "unit", required: true },
    {
      name: "workStage",
      label: "Work Stage",
      kind: "subcategory",
      required: true,
      catalogCategoryName: "Work Stage",
      noun: "Work Stage",
    },
    { name: "cost", label: "Total Cost", kind: "number", required: false, ...ENTRY_FIELD_CONSTRAINTS.cost },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  machinery: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "equipmentType", label: "Equipment Type", kind: "subcategory", required: true, subcategoryHint: "machinery" },
    { name: "count", label: "Count", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.count },
    { name: "hoursActive", label: "Hours Active", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.hoursActive },
    { name: "totalCost", label: "Total Cost", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.totalCost },
    {
      name: "workStage",
      label: "Work Stage",
      kind: "subcategory",
      required: false,
      clearable: true,
      catalogCategoryName: "Work Stage",
      noun: "Work Stage",
    },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  expense: [
    { name: "date", label: "Date", kind: "date", required: true },
    {
      name: "category",
      label: "Category",
      kind: "subcategory",
      required: true,
      catalogCategoryName: "Expense Category",
      noun: "Expense Category",
    },
    { name: "description", label: "Description", kind: "text", required: true },
    {
      name: "workStage",
      label: "Work Stage",
      kind: "subcategory",
      required: false,
      clearable: true,
      catalogCategoryName: "Work Stage",
      noun: "Work Stage",
    },
    { name: "amount", label: "Amount", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.amount },
  ],
  incident: [
    {
      name: "incidentType",
      label: "Incident Type",
      kind: "subcategory",
      required: true,
      catalogCategoryName: "Incident Type",
      noun: "Incident Type",
    },
    {
      name: "severity",
      label: "Severity",
      kind: "subcategory",
      catalogCategoryName: "Incident Severity",
      noun: "Severity",
    },
    { name: "description", label: "Description", kind: "textarea", required: true },
    { name: "durationEstimate", label: "Duration (minutes)", kind: "number", ...ENTRY_FIELD_CONSTRAINTS.durationEstimate },
  ],
} satisfies Record<EntryType, EntryField[]>;

// Kept for the alias/dynamic path: a category name that is not one of the five
// known types resolves to fallbackFields.
const REGISTRY: Record<string, EntryField[]> = REGISTRY_BY_TYPE;

const CATEGORY_ALIASES: Record<string, string> = {
  materials: "material",
  "machinery/equipment": "machinery",
  equipment: "machinery",
  expenses: "expense",
  incidents: "incident",
};

function normalizeCategoryKey(categoryName: string): string {
  const key = categoryName.trim().toLowerCase();
  return CATEGORY_ALIASES[key] ?? key;
}

export function resolveEntryFields(categoryName: string): EntryField[] {
  const key = normalizeCategoryKey(categoryName);
  return REGISTRY[key] ?? fallbackFields;
}

export type EntryKind = "labour" | "material" | "machinery" | "expense" | "incident";

export function resolveEntryKind(categoryName: string): EntryKind | "dynamic" {
  const key = normalizeCategoryKey(categoryName);
  if (key in REGISTRY) return key as EntryKind;
  return "dynamic";
}

export function entryEndpointFor(kind: EntryKind | "dynamic"): string {
  switch (kind) {
    case "labour": return "/api/entries/labour";
    case "material": return "/api/entries/materials";
    case "machinery": return "/api/entries/machinery";
    case "expense": return "/api/entries/expenses";
    case "incident": return "/api/entries/incidents";
    case "dynamic": return "/api/entries/dynamic";
  }
}
