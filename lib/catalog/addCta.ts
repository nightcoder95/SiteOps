// Contextual "Add X" copy for the catalog dropdowns/admin lists (design §5).
// The caller supplies the noun — the category -> noun mapping is owned by
// CATALOG_OPERATIONS in lib/catalog/overview.ts, which is where the lists are
// defined. (A second copy of that mapping lived here as
// catalogNounForCategory; it had no callers outside its own test and was
// removed in 2026-09. The two mappings were verified identical first.)
export function addCtaLabel(noun: string): string {
  return `Add ${noun}`;
}
