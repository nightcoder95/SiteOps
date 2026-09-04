import { describe, expect, it } from "vitest";

import { clientDescriptorFor } from "./client";
import { entryEndpointFor, resolveEntryFields } from "@/components/logs/entryFieldRegistry";
import { entryId, gridCategoryKey, typeLabel } from "@/components/operations/entryFormat";
import type { EntryType } from "@/lib/types/entry";

const ALL: EntryType[] = ["labour", "material", "machinery", "expense", "incident"];

const sample: Record<EntryType, Record<string, unknown>> = {
  labour: { labourEntryId: "L1", workType: "Masonry", date: "2026-08-06" },
  material: { materialEntryId: "M1", materialType: "Cement", date: "2026-08-06" },
  machinery: { machineryEntryId: "K1", equipmentType: "JCB", date: "2026-08-06" },
  expense: { expenseEntryId: "E1", category: "Fuel", date: "2026-08-06" },
  incident: { incidentReportId: "I1", incidentType: "Near miss", createdAt: "2026-08-06T09:00:00Z" },
};

describe("client entry-type descriptors", () => {
  it("labels match typeLabel exactly", () => {
    for (const t of ALL) expect(clientDescriptorFor(t).label, t).toBe(typeLabel[t]);
  });

  it("idField reads the same id entryId() returns", () => {
    for (const t of ALL) {
      const d = clientDescriptorFor(t);
      expect(sample[t][d.idField], t).toBe(entryId(sample[t], t));
    }
  });

  it("categoryField + fallback reproduce gridCategoryKey", () => {
    for (const t of ALL) {
      const d = clientDescriptorFor(t);
      expect(String(sample[t][d.categoryField] ?? d.categoryFallback), t)
        .toBe(gridCategoryKey(sample[t], t));
      // and the fallback path, with the field absent
      expect(d.categoryFallback, t).toBe(gridCategoryKey({}, t));
    }
  });

  it("endpoints match entryEndpointFor", () => {
    for (const t of ALL) expect(clientDescriptorFor(t).endpoint, t).toBe(entryEndpointFor(t));
  });

  it("formFields match the registry", () => {
    for (const t of ALL) {
      expect(clientDescriptorFor(t).formFields, t).toEqual(resolveEntryFields(t));
    }
  });

  it("incident reads its date from createdAt, the others from date", () => {
    expect(clientDescriptorFor("incident").dateField).toBe("createdAt");
    for (const t of ["labour", "material", "machinery", "expense"] as const) {
      expect(clientDescriptorFor(t).dateField, t).toBe("date");
    }
  });

  it("spendOf is 0 for incident and matches the per-type accessor otherwise", () => {
    expect(clientDescriptorFor("incident").spendOf({ anything: 1 })).toBe(0);
    expect(clientDescriptorFor("material").spendOf({ cost: "250.50" })).toBe(250.5);
    expect(clientDescriptorFor("machinery").spendOf({ totalCost: "1000" })).toBe(1000);
    expect(clientDescriptorFor("expense").spendOf({ amount: "42" })).toBe(42);
    expect(clientDescriptorFor("labour").spendOf({ peopleCount: 4, wagePerHead: "600" })).toBe(2400);
  });

  // Layering guard: the client half must stay importable from a client bundle,
  // so it must not reach into the Drizzle layer (audit F13).
  it("pulls nothing from lib/db", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/lib\/db/);
  });
});
