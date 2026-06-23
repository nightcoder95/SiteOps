// lib/export/serialize.ts
// Pure serializers for the data export. No DB, no IO — deterministic and unit-tested.
// Money/decimal columns arrive as strings from postgres.js and MUST stay strings
// (never parsed through float) to preserve exact values.

export const BACKUP_VERSION = 1;

type Row = Record<string, unknown>;

// Normalize a single cell for JSON: Date -> ISO UTC; everything else unchanged
// (decimal strings, jsonb objects, null, numbers, booleans pass through).
function jsonCell(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function normalizeRow(row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) out[k] = jsonCell(row[k]);
  return out;
}

export function toBackupJson(
  tablesByKey: Record<string, Row[]>,
  keysInOrder: readonly string[],
  exportedAt = new Date(),
): string {
  const tables: Record<string, Row[]> = {};
  for (const key of keysInOrder) {
    tables[key] = (tablesByKey[key] ?? []).map(normalizeRow);
  }
  return JSON.stringify({
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    tables,
  });
}

// ---- CSV ----

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v); // jsonb -> compact JSON
  else s = String(v);

  // Formula-injection guard: neutralize cells a spreadsheet might execute — but
  // NOT legitimate numbers. Money is a decimal string, so a negative amount like
  // "-500.50" starts with "-"; prefixing it with "'" would turn it into un-summable
  // text and corrupt the data. Only neutralize non-numeric cells.
  const isNumeric = /^-?\d+(\.\d+)?$/.test(s);
  if (!isNumeric && s.length > 0 && FORMULA_PREFIXES.includes(s[0])) s = `'${s}`;

  // RFC 4180 quoting.
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: Row[], columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")).join("\r\n");
  return rows.length ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}
