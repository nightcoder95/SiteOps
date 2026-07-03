import type { AssignmentInput } from "./types";

export type AssignmentDelta = { kind: "assign" | "return"; siteId: string; qty: number };
export type AssignmentDiff = {
  inserts: AssignmentInput[]; // new (tool,site) rows, qty ≥ 1
  updates: AssignmentInput[]; // existing rows with a new qty ≥ 1
  deletes: string[]; // siteIds whose row is removed
  movements: AssignmentDelta[]; // ledger deltas (assign for +, return for −)
};

// Pure diff of current vs desired per-site distribution. `desired` is the FULL
// authoritative distribution (a present array in §6 semantics): a site absent
// from `desired`, or present with qty 0, is a removal → return movement. The
// caller decides `desired`; passing the unchanged current array yields a no-op.
export function diffAssignments(
  current: AssignmentInput[],
  desired: AssignmentInput[],
): AssignmentDiff {
  const curMap = new Map(current.map((a) => [a.siteId, a.qty]));
  const desMap = new Map(desired.map((a) => [a.siteId, a.qty]));

  const inserts: AssignmentInput[] = [];
  const updates: AssignmentInput[] = [];
  const deletes: string[] = [];
  const movements: AssignmentDelta[] = [];

  for (const { siteId, qty } of desired) {
    const prev = curMap.get(siteId);
    if (qty === 0) {
      if (prev !== undefined) {
        deletes.push(siteId);
        movements.push({ kind: "return", siteId, qty: prev });
      }
      continue;
    }
    if (prev === undefined) {
      inserts.push({ siteId, qty });
      movements.push({ kind: "assign", siteId, qty });
    } else if (qty > prev) {
      updates.push({ siteId, qty });
      movements.push({ kind: "assign", siteId, qty: qty - prev });
    } else if (qty < prev) {
      updates.push({ siteId, qty });
      movements.push({ kind: "return", siteId, qty: prev - qty });
    }
  }

  for (const { siteId, qty } of current) {
    if (!desMap.has(siteId)) {
      deletes.push(siteId);
      movements.push({ kind: "return", siteId, qty });
    }
  }

  return { inserts, updates, deletes, movements };
}
