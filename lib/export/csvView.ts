// lib/export/csvView.ts
// Curates a RAW table read into a human-friendly CSV "view". Pure + unit-tested.
//
// This is intentionally separate from the JSON backup, which stays raw and
// re-importable. The CSV is for spreadsheet analysis by end users, so it:
//   1. drops technical/noise columns (icon, purpose, editable),
//   2. drops columns that are empty for every row in this export,
//   3. resolves user-id columns (createdBy, supervisorId, …) to "Name (Role)".
// updatedAt/createdAt and everything else pass through unchanged (light clean-up).

export type UserInfo = { role: string; label: string };
export type UserDirectory = ReadonlyMap<string, UserInfo>;

type Row = Record<string, unknown>;

// Technical columns end users don't need (the categories example from the review).
const NOISE_COLUMNS = new Set(["icon", "purpose", "editable"]);

// Columns that hold a userId and should be rendered as "Name (Role)".
const USER_REF_COLUMNS = new Set([
  "createdBy",
  "updatedBy",
  "createdByUserId",
  "updatedByUserId",
  "supervisorId",
  "actorUserId",
  "approvedBy",
  "approvedByUserId",
  "requestedBy",
  "requestedByUserId",
  "reportedBy",
]);

/** True when any column holds a userId that should be resolved to "Name (Role)". */
export function hasUserColumns(columns: string[]): boolean {
  return columns.some((c) => USER_REF_COLUMNS.has(c));
}

/** "Name (Role)" for a known user, else the original value untouched (unknown id / null). */
export function formatUser(value: unknown, dir: UserDirectory): unknown {
  if (typeof value !== "string") return value;
  const info = dir.get(value);
  return info ? `${info.label} (${info.role})` : value;
}

/**
 * Curate raw rows+columns into the CSV view. Column order is preserved.
 * `dir` resolves user-id columns; pass an empty map if you have no directory
 * (ids then pass through unchanged).
 */
export function applyCsvView(
  rows: Row[],
  columns: string[],
  dir: UserDirectory = new Map(),
): { rows: Row[]; columns: string[] } {
  // 1. Drop noise columns.
  let cols = columns.filter((c) => !NOISE_COLUMNS.has(c));

  // 2. Drop columns empty across every row (only when there are rows to judge by —
  //    an empty table keeps its full header so the CSV is still self-describing).
  if (rows.length > 0) {
    cols = cols.filter((c) => rows.some((r) => r[c] !== null && r[c] !== undefined && r[c] !== ""));
  }

  // 3. Resolve user-id columns to "Name (Role)".
  const outRows = rows.map((r) => {
    const out: Row = {};
    for (const c of cols) out[c] = USER_REF_COLUMNS.has(c) ? formatUser(r[c], dir) : r[c];
    return out;
  });

  return { rows: outRows, columns: cols };
}
