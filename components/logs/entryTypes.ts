export type EntryType =
  | "labour"
  | "material"
  | "machinery"
  | "expense"
  | "incident";

export function isEntryType(value: unknown): value is EntryType {
  return (
    value === "labour" ||
    value === "material" ||
    value === "machinery" ||
    value === "expense" ||
    value === "incident"
  );
}
