// Shared, locale-independent date formatting. DD/MM/YYYY everywhere so display
// does not vary with the runtime's locale/timezone heuristics.

export type DateInput = string | number | Date | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Returns a valid Date, or null when the input is empty/unparseable.
function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Date-only strings: build a local-time date from the parts so a negative
  // timezone offset can't roll the calendar day backwards.
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return value == null ? "" : String(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return value == null ? "" : String(value);
  return `${formatDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
