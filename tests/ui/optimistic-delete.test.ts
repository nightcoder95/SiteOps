import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F15 / Phase 5 Task 2. AllOperationsPageClient owns both the optimistic delete
// and the `rows` state that every displayed figure derives from, so a
// router.refresh() after a successful delete re-ran the full five-table SSR
// fetch to reproduce data the client had already corrected.
//
// Its two siblings (OperationDetailPageClient, CategoryDetailPageClient) are
// deliberately NOT covered by this fence: their delete lives inside
// EntryLogList, which keeps a *local* working copy, so the parent's totals stay
// stale until it refreshes. Removing their refresh would leave the header spend
// wrong. See the phase doc for the trade-off.
const repoRoot = path.resolve(__dirname, "..", "..");

describe("optimistic delete on the all-operations view", () => {
  const source = readFileSync(
    path.join(repoRoot, "app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx"),
    "utf8",
  );

  test("does not refresh the route after a successful delete", () => {
    const offending = source
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => !line.startsWith("//") && /router\.refresh\s*\(/.test(line));

    expect(offending).toEqual([]);
  });

  test("still rolls the row back when the delete fails", () => {
    // The refresh removal must not take the rollback with it.
    expect(source).toContain("setRows(prevRows)");
  });
});
