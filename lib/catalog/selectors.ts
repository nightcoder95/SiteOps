// Pure helpers for reading the categories/subcategories catalog client-side.
// Kept framework-free so they are unit-testable; the SWR hook composes them.

export type CategoryRowLike = { categoryId: string; name: string };

export type SubcategoryLike = {
  subcategoryId?: string;
  name: string;
  isActive?: boolean;
};

export type CategoryDetailLike =
  | { subcategories?: SubcategoryLike[] }
  | null
  | undefined;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function pickCategoryIdByName(
  rows: CategoryRowLike[],
  name: string,
): string | null {
  const target = norm(name);
  if (!target) return null;
  const match = rows.find((row) => norm(row.name) === target);
  return match?.categoryId ?? null;
}

export function extractActiveSubcategoryNames(payload: CategoryDetailLike): string[] {
  const subs = payload?.subcategories ?? [];
  return subs
    .filter((sub) => sub.isActive !== false && sub.name.trim().length > 0)
    .map((sub) => sub.name);
}

// Transitional guard for surfaces still backed by a pg enum (e.g. transfers).
// Returns the canonical allowed values for catalog names that match (in catalog
// order, de-duplicated), so a submission can never carry a value the server's
// enum would reject. Remove once those columns become varchar (enum migration).
export function filterToAllowedCanonical(
  catalogNames: string[],
  allowed: readonly string[],
): string[] {
  const canonicalByNorm = new Map(allowed.map((value) => [norm(value), value]));
  const result: string[] = [];
  const used = new Set<string>();
  for (const name of catalogNames) {
    const canonical = canonicalByNorm.get(norm(name));
    if (!canonical || used.has(canonical)) continue;
    used.add(canonical);
    result.push(canonical);
  }
  return result;
}
