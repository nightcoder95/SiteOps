// Pure helpers for the units management panel. Units live in unit_master (a
// separate SSOT from subcategory-backed catalog lists).

export type UnitRow = {
  unitId: string;
  label: string;
  category: string;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
};

export type UnitGroup = { category: string; units: UnitRow[] };

// Derive a stable unique code from a human label: uppercase, alphanumerics only,
// single underscores between tokens, capped at the unit_master.code length (40).
export function unitCodeFromLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Group units by quantity-type category (alphabetical), each group's units
// ordered by their admin sortOrder.
export function groupUnitsByCategory(units: UnitRow[]): UnitGroup[] {
  const byCategory = new Map<string, UnitRow[]>();
  for (const unit of units) {
    const list = byCategory.get(unit.category) ?? [];
    list.push(unit);
    byCategory.set(unit.category, list);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      units: [...list].sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
