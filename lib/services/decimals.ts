// Drizzle `decimal`/`numeric` columns map to JS strings, but zod-parsed form
// bodies carry numbers. Coerce the listed keys to strings in ONE place instead
// of repeating `typeof x === "number" ? String(x)` per field per route — this
// closes the 12×-duplicated coercion block flagged in the audit (A1).
//
// Mutates and returns `obj` for ergonomic chaining at the call site.
export function coerceDecimals<T extends Record<string, unknown>>(
  obj: T,
  keys: readonly string[],
): T {
  for (const key of keys) {
    if (typeof obj[key] === "number") {
      (obj as Record<string, unknown>)[key] = String(obj[key]);
    }
  }
  return obj;
}
