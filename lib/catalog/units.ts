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

// ---------------------------------------------------------------------------
// Material unit rules. Pure and client-safe; the DB-backed rule lookup lives in
// lib/db/queries/materialUnitRule.ts (server-only). These used to sit under
// lib/db/queries/, where the next DB import added to the file would have
// silently broken every client component importing them (audit F13).

const DISPLAY_OVERRIDES: Record<string, string> = {
  kilogram: "KG",
  kg: "KG",
  nos: "Numbers",
  numbers: "Numbers",
  cft: "CFT",
  tonne: "Tonne",
  litre: "Litre",
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function displayUnitName(value: string) {
  return DISPLAY_OVERRIDES[normalize(value)] ?? value;
}

export type MaterialUnitRule = { allowedNames: string[]; preferredName: string | null };

// Derive the allowed/preferred units for a material type from its explicit
// mapping. With no mapping, every active unit is allowed (design §3.3) — there
// is no hardcoded "Tonne/Litre" guess anymore.
export function computeMaterialUnitRule(input: {
  mappedUnits: Array<{ label: string; isDefault: boolean }>;
  activeUnitLabels: string[];
}): MaterialUnitRule {
  if (input.mappedUnits.length > 0) {
    const allowedNames = input.mappedUnits.map((u) => displayUnitName(u.label));
    const defaultUnit = input.mappedUnits.find((u) => u.isDefault) ?? input.mappedUnits[0];
    return { allowedNames, preferredName: displayUnitName(defaultUnit.label) };
  }
  const allowedNames = input.activeUnitLabels.map((label) => displayUnitName(label));
  return { allowedNames, preferredName: allowedNames[0] ?? null };
}

export function unitNameMatchesAllowed(unitName: string, allowedName: string) {
  return displayUnitName(unitName) === allowedName;
}

// Defensive guard: even after data cleanup, drop options that share a display
// name (case/whitespace-insensitive), keeping the first one seen.
export function dedupeUnitOptionsByName<T extends { name: string }>(options: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const option of options) {
    const key = normalize(option.name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result;
}
