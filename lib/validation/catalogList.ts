// The default loader is lazy-imported so unit tests (which inject their own
// loader) never pull in the DB client.
async function defaultLoader(listKey: string): Promise<string[]> {
  const { loadActiveCatalogNames } = await import("@/lib/db/queries/catalogLists");
  return loadActiveCatalogNames(listKey);
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Pure membership test against a list's active item names (case/whitespace
// tolerant). Empty/unknown rejected — same contract the old z.enum gave.
export function isCatalogMember(activeNames: string[], value: string): boolean {
  if (!value || !value.trim()) return false;
  const target = norm(value);
  return activeNames.some((name) => norm(name) === target);
}

export type CatalogAssertResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export type CatalogNamesLoader = (listKey: string) => Promise<string[]>;

// Runtime replacement for z.enum on the former-enum lists. Loads the named
// list's ACTIVE items from the catalog and checks membership, returning the
// canonical stored value (catalog casing) so writes stay consistent.
export async function assertInCatalogList(
  listKey: string,
  value: string | null | undefined,
  loader: CatalogNamesLoader = defaultLoader,
): Promise<CatalogAssertResult> {
  if (!value || !value.trim()) {
    return { ok: false, message: `${listKey} is required` };
  }
  const names = await loader(listKey);
  const target = norm(value);
  const canonical = names.find((name) => norm(name) === target);
  if (!canonical) {
    return { ok: false, message: `Invalid ${listKey}: "${value}"` };
  }
  return { ok: true, value: canonical };
}
