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

// Short relative time for "last updated" labels: "just now", "5m ago",
// "2h ago", "3d ago". Falls back to DD/MM/YYYY beyond ~4 weeks.
export function timeAgo(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 28) return `${days}d ago`;
  return formatDate(date);
}
