import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Back navigation used to be wired to the browser's history stack, which made
// the header chevron's destination depend on how the user arrived rather than
// on where they are. Three separate leaks made that worse:
//
//   1. The chevron called router.back(), so it retraced every detour — and,
//      when history.length > 1 because the tab had visited another site first,
//      it walked straight out of the app.
//   2. Applying or clearing a filter pushed a history entry, so leaving a list
//      the user had filtered four times took five back presses.
//   3. Navigating away after a successful save/delete pushed, leaving the
//      already-submitted form (or an archived site) sitting in history.
//
// These fences keep each leak from creeping back in. Comment lines are ignored
// so the explanatory headers in those files can still name the old API.
const repoRoot = path.resolve(__dirname, "..", "..");

function codeLines(relPath: string): string[] {
  return readFileSync(path.join(repoRoot, relPath), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
}

function offendingLines(relPath: string, pattern: RegExp): string[] {
  return codeLines(relPath).filter((line) => pattern.test(line));
}

// Pages whose only router navigation is a filter apply/clear: re-filtering
// replaces the current entry rather than stacking a new one.
const FILTERED_LIST_PAGES = [
  "app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx",
  "app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx",
  "app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx",
];

// Screens that navigate away only after a mutation has succeeded. Going back
// must not return the user to the form they already submitted.
const POST_MUTATION_SCREENS = [
  "components/logs/EntryForm.tsx",
  "components/logs/DynamicEntryForm.tsx",
  "components/transfers/TransferForm.tsx",
  "app/app/sites/new/SitesNewPageClient.tsx",
  "app/app/sites/[id]/SiteDetailPageClient.tsx",
];

describe("back navigation", () => {
  // The chevron's destination is logicalParent() unconditionally. back() is an
  // optimisation on top of that — it is only allowed once parentIsBehind() has
  // confirmed the entry behind us IS that parent, so it can never take the user
  // somewhere else (least of all out of the app). parentIsBehind is unit-tested
  // in lib/nav/navStack.test.ts; this fence is about the wiring.
  test("the header chevron resolves its destination from the route, not history", () => {
    const source = codeLines("components/app-shell/AppHeader.tsx").join("\n");
    expect(source).toMatch(/logicalParent\(pathname\)/);
    expect(source).toMatch(/parentIsBehind\(/);
  });

  test("the header chevron never guesses from history.length", () => {
    // The old heuristic: any tab that had visited another site first reported
    // history.length > 1, so back() on a deep-linked arrival left the app.
    expect(offendingLines("components/app-shell/AppHeader.tsx", /history\.length/)).toEqual([]);
  });

  test("the header chevron only calls back() under the parentIsBehind guard", () => {
    const source = codeLines("components/app-shell/AppHeader.tsx").join("\n");
    const calls = [...source.matchAll(/router\.back\s*\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // The condition of the nearest enclosing `if` must be the guard.
      const before = source.slice(0, call.index);
      const guard = before.slice(before.lastIndexOf("if ("));
      expect(guard).toContain("parentIsBehind(");
    }
  });

  test("filter changes replace the current history entry instead of stacking", () => {
    for (const page of FILTERED_LIST_PAGES) {
      expect(offendingLines(page, /router\.push\s*\(/), page).toEqual([]);
    }
  });

  test("post-save navigation replaces the form instead of stacking it", () => {
    for (const screen of POST_MUTATION_SCREENS) {
      expect(offendingLines(screen, /router\.push\s*\(/), screen).toEqual([]);
    }
  });
});

// Overlays that cover the screen must answer the phone's back gesture, which is
// the only dismiss affordance a touch user has (Escape is keyboard-only). The
// search overlay has always done this by pushing a history sentinel; these are
// the surfaces that had no answer to back at all and now share that plumbing.
const DISMISSIBLE_OVERLAYS = [
  "components/ui/motion.tsx",
  "components/tools/ToolDrawer.tsx",
  "components/tools/ToolLedgerDrawer.tsx",
  "components/search/GlobalSearchOverlay.tsx",
];

describe("overlay dismissal", () => {
  test("every full-screen overlay closes on the back gesture", () => {
    const missing = DISMISSIBLE_OVERLAYS.filter(
      (file) => !codeLines(file).some((line) => /useBackDismiss\s*\(/.test(line)),
    );
    expect(missing).toEqual([]);
  });
});
