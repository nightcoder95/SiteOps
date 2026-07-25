// Contextual "Add X" copy for the catalog dropdowns/admin lists (design §5).
// Each managed list is a category; this maps a category to the short noun the
// add-CTA and modal title use ("Add Work Type", "Create Work Type"), replacing
// the old generic "Add Subcategory".

const NOUN_BY_CATEGORY: Record<string, string> = {
  Labour: "Work Type",
  Materials: "Material Type",
  "Machinery/Equipment": "Equipment Type",
  "Work Stage": "Work Stage",
  "Expense Category": "Expense Category",
  "Incident Type": "Incident Type",
  "Incident Severity": "Severity",
};

export function catalogNounForCategory(categoryName: string): string {
  const trimmed = categoryName.trim();
  return NOUN_BY_CATEGORY[trimmed] ?? trimmed;
}

export function addCtaLabel(noun: string): string {
  return `Add ${noun}`;
}
