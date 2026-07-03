import type { AssignmentInput, DistributionErrorCode } from "./types";

export type DistributionResult =
  | { ok: true }
  | { ok: false; reason: DistributionErrorCode };

// Pure invariant check on a desired end-state (§2). Structural checks
// (integer/positivity/duplicates) run before the aggregate `Σ ≤ total` so the
// returned reason is the most specific. DB-state-dependent reasons
// (total_below_assigned, retire_exceeds_free, site_unavailable) are NOT decided
// here — they live in applyBatch against committed state.
export function validateDistribution(input: {
  totalQuantity: number;
  assignments: AssignmentInput[];
}): DistributionResult {
  const { totalQuantity, assignments } = input;

  if (!Number.isInteger(totalQuantity)) return { ok: false, reason: "non_integer" };
  if (totalQuantity < 0) return { ok: false, reason: "negative_total" };

  const seen = new Set<string>();
  let sum = 0;
  for (const a of assignments) {
    if (!Number.isInteger(a.qty)) return { ok: false, reason: "non_integer" };
    if (a.qty < 1) return { ok: false, reason: "non_positive_qty" };
    if (seen.has(a.siteId)) return { ok: false, reason: "duplicate_site" };
    seen.add(a.siteId);
    sum += a.qty;
  }

  if (sum > totalQuantity) return { ok: false, reason: "sum_exceeds_total" };
  return { ok: true };
}
