export type FieldKind =
  | "date"
  | "number"
  | "text"
  | "textarea"
  | "subcategory"
  | "select";

export type EntryField = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  subcategoryHint?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
};

export const fallbackFields: EntryField[] = [
  { name: "date", label: "Date", kind: "date", required: true },
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "quantity", label: "Quantity", kind: "number", required: true, min: 0 },
  { name: "remarks", label: "Remarks", kind: "textarea" },
];

const REGISTRY: Record<string, EntryField[]> = {
  labour: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "workType", label: "Work Type", kind: "subcategory", required: true, subcategoryHint: "labour" },
    { name: "peopleCount", label: "People Count", kind: "number", required: true, min: 1, max: 10000, step: 1 },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  material: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "materialType", label: "Material Type", kind: "subcategory", required: true, subcategoryHint: "material" },
    { name: "quantity", label: "Quantity", kind: "number", required: true, min: 0, step: 0.01 },
    { name: "unit", label: "Unit", kind: "subcategory", required: true, subcategoryHint: "unit" },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  machinery: [
    { name: "date", label: "Date", kind: "date", required: true },
    { name: "equipmentType", label: "Equipment Type", kind: "subcategory", required: true, subcategoryHint: "machinery" },
    { name: "count", label: "Count", kind: "number", required: true, min: 1, step: 1 },
    { name: "hoursActive", label: "Hours Active", kind: "number", required: true, min: 0.1, max: 24, step: 0.1 },
    { name: "remarks", label: "Remarks", kind: "textarea" },
  ],
  expense: [
    { name: "date", label: "Date", kind: "date", required: true },
    {
      name: "category",
      label: "Category",
      kind: "select",
      required: true,
      options: [
        { value: "Labour", label: "Labour" },
        { value: "Materials", label: "Materials" },
        { value: "Equipment", label: "Equipment" },
        { value: "Misc", label: "Misc" },
      ],
    },
    { name: "description", label: "Description", kind: "text", required: true },
    { name: "amount", label: "Amount", kind: "number", required: true, min: 0, step: 0.01 },
  ],
  incident: [
    {
      name: "incidentType",
      label: "Incident Type",
      kind: "select",
      required: true,
      options: [
        { value: "Safety", label: "Safety" },
        { value: "Block", label: "Block" },
      ],
    },
    {
      name: "severity",
      label: "Severity",
      kind: "select",
      options: [
        { value: "Low", label: "Low" },
        { value: "Medium", label: "Medium" },
        { value: "High", label: "High" },
        { value: "Critical", label: "Critical" },
      ],
    },
    { name: "description", label: "Description", kind: "textarea", required: true },
    { name: "durationEstimate", label: "Duration (minutes)", kind: "number", min: 1, step: 1 },
  ],
};

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
