import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import { TABLE_KEYS, TABLE_REGISTRY, getTableEntry } from "./tableRegistry";

// Every pgTable exported from the schema, by physical table name. This is what the
// completeness test compares the registry against — if the schema grows a table and
// nobody adds it to the registry, this set diverges and the test fails (the whole
// point: backups must stay whole).
const schemaValues: unknown[] = Object.values(schema);
const schemaTables = schemaValues.filter((v): v is PgTable => is(v, PgTable));
const schemaTableNames = schemaTables.map((t) => getTableName(t)).sort();

describe("TABLE_REGISTRY", () => {
  it("includes every pgTable in the schema (completeness guardrail)", () => {
    const registryNames = [...TABLE_KEYS].sort();
    expect(registryNames).toEqual(schemaTableNames);
  });

  it("has no duplicate keys", () => {
    expect(new Set(TABLE_KEYS).size).toBe(TABLE_KEYS.length);
  });

  it("each key equals the physical table name of its drizzle table", () => {
    for (const entry of TABLE_REGISTRY) {
      expect(getTableName(entry.table)).toBe(entry.key);
    }
  });

  it("orders parents before children (FK targets at a lower index)", () => {
    const indexOf = new Map(TABLE_REGISTRY.map((e, i) => [e.key, i]));
    for (let i = 0; i < TABLE_REGISTRY.length; i++) {
      const entry = TABLE_REGISTRY[i];
      const refs = getTableConfig(entry.table).foreignKeys.map((fk) =>
        getTableName(fk.reference().foreignTable),
      );
      for (const ref of refs) {
        if (ref === entry.key) continue; // self-reference — no ordering constraint
        expect(indexOf.has(ref), `referenced table "${ref}" missing from registry`).toBe(true);
        expect(
          indexOf.get(ref)!,
          `"${ref}" must appear before "${entry.key}" so imports don't violate FKs`,
        ).toBeLessThan(i);
      }
    }
  });

  it("getTableEntry resolves a known key and rejects an unknown one", () => {
    expect(getTableEntry("sites")?.key).toBe("sites");
    expect(getTableEntry("__nope__")).toBeUndefined();
  });
});
