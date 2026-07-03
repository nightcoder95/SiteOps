// Shared domain types for the Tools Inventory module.

export const MOVEMENT_KINDS = [
  "opening",
  "procure",
  "retire",
  "assign",
  "return",
  "transfer", // reserved; never emitted in v1 (site→site = return + assign)
  "adjust",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

// Polymorphic ledger location keywords. A location is one of these OR a site
// uuid. Intentionally not FK-constrained so history survives site deletion.
export const WAREHOUSE = "WAREHOUSE";
export const EXTERNAL = "EXTERNAL";

// Reasons the distribution validator (pure) can reject a payload.
export type DistributionErrorCode =
  | "sum_exceeds_total"
  | "duplicate_site"
  | "non_positive_qty"
  | "non_integer"
  | "negative_total";

// Full set of reasons a per-tool batch apply can report as `invalid`. Superset
// of DistributionErrorCode: the DB-state-dependent reasons are decided in
// applyBatch against committed state, not by the pure validator.
export type InvalidReason =
  | DistributionErrorCode
  | "total_below_assigned"
  | "retire_exceeds_free"
  | "site_unavailable"
  | "not_found";

export type ToolResultStatus = "ok" | "conflict" | "invalid";

export type AssignmentInput = { siteId: string; qty: number };
