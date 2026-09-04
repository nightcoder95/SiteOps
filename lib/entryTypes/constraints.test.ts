import { describe, expect, it } from "vitest";

import { ENTRY_FIELD_CONSTRAINTS, type FieldConstraint } from "./constraints";
import { resolveEntryFields } from "@/components/logs/entryFieldRegistry";
import type { EntryType } from "@/lib/types/entry";

const ALL: EntryType[] = ["labour", "material", "machinery", "expense", "incident"];

// The constants object is intentionally a literal (so callers get exact keys);
// the registry walk looks fields up by name, hence this widened view.
const BY_NAME: Record<string, FieldConstraint | undefined> = ENTRY_FIELD_CONSTRAINTS;

describe("shared entry field constraints", () => {
  it("every numeric registry field has a constraints entry", () => {
    for (const type of ALL) {
      for (const field of resolveEntryFields(type)) {
        if (field.kind !== "number") continue;
        expect(BY_NAME[field.name], `${type}.${field.name}`).toBeDefined();
      }
    }
  });

  it("the registry's min/max/step come from the shared constraints", () => {
    for (const type of ALL) {
      for (const field of resolveEntryFields(type)) {
        if (field.kind !== "number") continue;
        const c = BY_NAME[field.name]!;
        expect(field.min, `${type}.${field.name}.min`).toBe(c.min);
        expect(field.max, `${type}.${field.name}.max`).toBe(c.max);
        expect(field.step, `${type}.${field.name}.step`).toBe(c.step);
      }
    }
  });

  it("every constraint carries a server-enforced max", () => {
    // A UI max with no schema counterpart is how the two sides drifted before;
    // every bound here is also the bound the zod schema enforces.
    for (const [name, c] of Object.entries(ENTRY_FIELD_CONSTRAINTS)) {
      expect(c.max, `${name}.max`).toBeGreaterThan(0);
      expect(c.min, `${name}.min`).toBeGreaterThan(0);
    }
  });
});
