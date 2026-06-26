/**
 * Parse a query-string integer and clamp it to [min, max].
 * Returns `def` when the value is null or unparseable.
 */
export function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (raw == null) return def;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
