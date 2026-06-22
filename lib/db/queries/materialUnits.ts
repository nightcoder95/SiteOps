// Pure, client-safe unit helpers. The DB-backed rule lookup lives in
// ./materialUnitRule (server-only) so this module can be imported by client
// components (e.g. UnitSelect) without pulling in the database client.

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
