// Single source of truth for numeric bounds on entry fields, consumed by BOTH
// the zod schemas (server enforcement) and the form field registry (client
// affordances: min/max/step attributes and the derived inputMode).
//
// Deliberately plain constants rather than derived-from-zod: reading bounds out
// of zod's internals is brittle across versions (this repo is on zod 4), and a
// UI that silently loses its `max` after a dependency bump is worse than a
// little duplication of intent. Two consumers, one source.
//
// Drift found and resolved when this module was introduced (stricter bound
// wins; the schema is authoritative because it is enforced server-side):
//   - quantity, amount: the registry advertised `min: 0` while the schema
//     requires a positive number — entering 0 passed the browser check and then
//     400'd. Both are now 0.01, matching the 2-decimal step.
//   - wagePerHead, cost, count, totalCost, durationEstimate: the registry
//     carried no `max` at all while the schema capped each one. The cap is now
//     visible in the UI too.
export type FieldConstraint = { min: number; max: number; step: number };

export const ENTRY_FIELD_CONSTRAINTS = {
  // labour
  peopleCount: { min: 1, max: 10000, step: 1 },
  wagePerHead: { min: 0.01, max: 1000000, step: 0.01 },
  // material
  quantity: { min: 0.01, max: 1000000, step: 0.01 },
  cost: { min: 0.01, max: 100000000, step: 0.01 },
  // machinery
  count: { min: 1, max: 10000, step: 1 },
  hoursActive: { min: 0.1, max: 24, step: 0.1 },
  totalCost: { min: 0.01, max: 100000000, step: 0.01 },
  // expense
  amount: { min: 0.01, max: 1000000, step: 0.01 },
  // incident
  durationEstimate: { min: 1, max: 10080, step: 1 },
} satisfies Record<string, FieldConstraint>;

export type EntryFieldConstraintName = keyof typeof ENTRY_FIELD_CONSTRAINTS;
