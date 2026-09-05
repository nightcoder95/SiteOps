// The route history the up-chevron reasons about.
//
// The chevron's destination is always logicalParent() — deterministic, so the
// arrow means the same thing on every screen. But *how* it gets there matters:
// router.back() restores the parent's scroll position, router.push() drops the
// user at the top. When the entry behind the current one really is the parent
// (the ordinary drill-down), back() is both correct and nicer; otherwise only
// push() lands on the parent at all.
//
// The browser will not tell us what the previous entry's URL is, so we keep our
// own ordered list of visited pathnames in sessionStorage — per-tab, cleared
// when the tab closes, which is exactly the lifetime of a history stack.
//
// Pathnames only: a filter change rewrites the query string but not the
// pathname, and it must not count as a level of depth.

export const NAV_STACK_KEY = "siteops:navStack";

// Deep enough that no real drill-down reaches the cap; shallow enough that a
// long session cannot grow sessionStorage without bound.
export const NAV_STACK_LIMIT = 50;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * Fold a newly-visited pathname into the stack.
 *
 * Three cases, distinguished by where the new pathname already sits:
 *   - it IS the current entry  → a query-only change; depth is unchanged
 *   - it is the entry BEHIND   → the user went back; pop rather than duplicate
 *   - anything else            → a forward navigation; push
 */
export function recordVisit(stack: readonly string[], pathname: string): string[] {
  if (stack[stack.length - 1] === pathname) return [...stack];
  if (stack.length >= 2 && stack[stack.length - 2] === pathname) return stack.slice(0, -1);
  return [...stack, pathname].slice(-NAV_STACK_LIMIT);
}

/**
 * Fold a replacing navigation into the stack.
 *
 * router.replace() swaps the current history entry rather than adding one, so
 * the stack must swap its top entry too. Without this the replaced-away page
 * (a submitted form, an archived site) would still be recorded as the entry
 * behind the user, and the chevron could call back() onto a page the browser
 * has already discarded.
 *
 * Callers apply this BEFORE navigating, so the visit effect that follows sees
 * its own pathname already on top and does nothing. That ordering is what makes
 * it race-free: there is no "a replace is in flight" flag to leak when the
 * pathname turns out not to change at all, which is the case for every
 * query-only filter replace.
 */
export function recordReplace(stack: readonly string[], pathname: string): string[] {
  if (stack.length === 0) return [pathname];
  if (stack[stack.length - 1] === pathname) return [...stack];
  return [...stack.slice(0, -1), pathname];
}

/** The pathname half of an href — the stack deliberately ignores query and hash. */
export function pathnameOf(href: string): string {
  return href.split("#")[0].split("?")[0];
}

/** Is the entry behind the current one the parent we are about to navigate to? */
export function parentIsBehind(stack: readonly string[], parent: string): boolean {
  return stack.length >= 2 && stack[stack.length - 2] === parent;
}

/**
 * Read the stack, tolerating every way storage can let us down: absent, corrupt,
 * holding something that is not an array of strings, or throwing outright
 * (Safari private mode, disabled site data). A lost stack is harmless — the
 * chevron just pushes instead of going back.
 */
export function readStack(storage: StorageLike): string[] {
  try {
    const raw = storage.getItem(NAV_STACK_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (!parsed.every((entry) => typeof entry === "string")) return [];
    return parsed as string[];
  } catch {
    return [];
  }
}

export function writeStack(storage: StorageLike, stack: readonly string[]): void {
  try {
    storage.setItem(NAV_STACK_KEY, JSON.stringify(stack));
  } catch {
    // Storage unavailable or over quota — the chevron degrades to push().
  }
}
