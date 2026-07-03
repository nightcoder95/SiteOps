// Tool code generation (§4): `<PREFIX>-<zero-padded sequence>`, e.g. HND-001.
// Prefix is frozen into the tool's `code` at creation — renaming a category or
// its prefix never rewrites existing codes. Gap-tolerant.

// Extract the trailing sequence integer from a `PREFIX-NNN` code for a given
// prefix. Returns null if the code does not belong to that prefix.
export function parseSequence(prefix: string, code: string): number | null {
  const m = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`).exec(code);
  return m ? Number(m[1]) : null;
}

// Next code for a prefix given the existing sequence numbers. Uses max+1 so
// deleting a middle code never renumbers (gap-tolerant). Zero-padded to 3,
// grows beyond 999 naturally.
export function nextToolCode(prefix: string, existingSequences: number[]): string {
  const max = existingSequences.reduce((m, n) => Math.max(m, n), 0);
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
