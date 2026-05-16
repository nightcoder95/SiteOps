// Convert Date values inside a DB row (or array of rows) into ISO strings so
// the result is safe to pass from a Server Component to a Client Component.
// Avoids the `JSON.parse(JSON.stringify(...))` round-trip allocation.

type Primitive = string | number | boolean | null | undefined;

export type Serialized<T> = T extends Date
  ? string
  : T extends Primitive
    ? T
    : T extends Array<infer U>
      ? Array<Serialized<U>>
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function serializeRow<T>(value: T): Serialized<T> {
  if (value instanceof Date) {
    return value.toISOString() as Serialized<T>;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeRow(v)) as Serialized<T>;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeRow(v);
    }
    return out as Serialized<T>;
  }
  return value as Serialized<T>;
}
