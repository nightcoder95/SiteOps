import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { ENTRY_TYPES, serverDescriptorFor } from "./server";
import { decimalFieldsFor } from "@/lib/services/entries";
import type { EntryType } from "@/lib/types/entry";
import {
  expenseEntrySchema,
  incidentEntrySchema,
  labourEntrySchema,
  machineryEntrySchema,
  materialEntrySchema,
  updateExpenseEntrySchema,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

const SPEND_TYPES = ["labour", "material", "machinery", "expense"] as const;

describe("server entry-type descriptors", () => {
  it("covers exactly the five entry types", () => {
    expect([...ENTRY_TYPES].sort()).toEqual(
      ["expense", "incident", "labour", "machinery", "material"],
    );
  });

  it("maps each type to the right table", () => {
    expect(getTableName(serverDescriptorFor("labour").table)).toBe("labour_entries");
    expect(getTableName(serverDescriptorFor("material").table)).toBe("material_entries");
    expect(getTableName(serverDescriptorFor("machinery").table)).toBe("machinery_entries");
    expect(getTableName(serverDescriptorFor("expense").table)).toBe("expense_entries");
    expect(getTableName(serverDescriptorFor("incident").table)).toBe("incident_reports");
  });

  it("maps each type to its primary-key field name", () => {
    expect(serverDescriptorFor("labour").idField).toBe("labourEntryId");
    expect(serverDescriptorFor("material").idField).toBe("materialEntryId");
    expect(serverDescriptorFor("machinery").idField).toBe("machineryEntryId");
    expect(serverDescriptorFor("expense").idField).toBe("expenseEntryId");
    expect(serverDescriptorFor("incident").idField).toBe("incidentReportId");
  });

  it("points idColumn at the same column idField names", () => {
    expect(serverDescriptorFor("labour").idColumn.name).toBe("labour_entry_id");
    expect(serverDescriptorFor("material").idColumn.name).toBe("material_entry_id");
    expect(serverDescriptorFor("machinery").idColumn.name).toBe("machinery_entry_id");
    expect(serverDescriptorFor("expense").idColumn.name).toBe("expense_entry_id");
    expect(serverDescriptorFor("incident").idColumn.name).toBe("incident_report_id");
  });

  it("gives incident a null dateColumn — it has no date column", () => {
    expect(serverDescriptorFor("incident").dateColumn).toBeNull();
    for (const type of SPEND_TYPES) {
      expect(serverDescriptorFor(type).dateColumn?.name, type).toBe("date");
    }
  });

  it("marks incident as spendless and the other four as spend-bearing", () => {
    expect(serverDescriptorFor("incident").hasSpend).toBe(false);
    for (const type of SPEND_TYPES) {
      expect(serverDescriptorFor(type).hasSpend, type).toBe(true);
    }
  });

  it("maps each type to its category column", () => {
    expect(serverDescriptorFor("labour").categoryColumn?.name).toBe("work_type");
    expect(serverDescriptorFor("material").categoryColumn?.name).toBe("material_type");
    expect(serverDescriptorFor("machinery").categoryColumn?.name).toBe("equipment_type");
    expect(serverDescriptorFor("expense").categoryColumn?.name).toBe("category");
    expect(serverDescriptorFor("incident").categoryColumn?.name).toBe("incident_type");
  });

  it("gives incident a null workStageColumn", () => {
    expect(serverDescriptorFor("incident").workStageColumn).toBeNull();
    for (const type of SPEND_TYPES) {
      expect(serverDescriptorFor(type).workStageColumn?.name, type).toBe("work_stage");
    }
  });

  it("maps siteId and createdAt columns for every type", () => {
    for (const type of ENTRY_TYPES) {
      expect(serverDescriptorFor(type).siteIdColumn.name, type).toBe("site_id");
      expect(serverDescriptorFor(type).createdAtColumn.name, type).toBe("created_at");
    }
  });

  it("computes spend per type and leaves incident spendless", () => {
    expect(serverDescriptorFor("incident").spendOf).toBeNull();
    expect(serverDescriptorFor("labour").spendOf?.({ peopleCount: 4, wagePerHead: "600" })).toBe(2400);
    expect(serverDescriptorFor("labour").spendOf?.({ salaryAmount: "12345" })).toBe(12345);
    expect(serverDescriptorFor("labour").spendOf?.({
      masonCount: 2, masonSalaryAmount: "1300", helperCount: 2, helperSalaryAmount: "1100",
    })).toBe(4800);
    expect(serverDescriptorFor("material").spendOf?.({ cost: "250.50" })).toBe(250.5);
    expect(serverDescriptorFor("machinery").spendOf?.({ totalCost: "1000" })).toBe(1000);
    expect(serverDescriptorFor("expense").spendOf?.({ amount: "42" })).toBe(42);
  });

  describe("categoryFilter", () => {
    const compile = (type: EntryType, value: string) => {
      const filter = serverDescriptorFor(type).categoryFilter(value);
      expect(filter, type).toBeDefined();
      return new PgDialect().sqlToQuery(filter!);
    };

    it("matches the category column for the four spend types", () => {
      for (const type of SPEND_TYPES) {
        const q = compile(type, "Cement");
        expect(q.sql, type).toContain(serverDescriptorFor(type).categoryColumn!.name);
        expect(q.params, type).toEqual(["Cement"]);
      }
    });

    // Incident's filter is deliberately wider than the others: the operations
    // UI lets one chip match either the incident type or its severity.
    it("matches incident type OR severity", () => {
      const q = compile("incident", "Safety");
      expect(q.sql).toContain("incident_type");
      expect(q.sql).toContain("severity");
      expect(q.sql.toLowerCase()).toContain(" or ");
      expect(q.params).toEqual(["Safety", "Safety"]);
    });
  });

  it("maps each type to its update schema", () => {
    expect(serverDescriptorFor("labour").zodUpdate).toBe(updateLabourEntrySchema);
    expect(serverDescriptorFor("material").zodUpdate).toBe(updateMaterialEntrySchema);
    expect(serverDescriptorFor("machinery").zodUpdate).toBe(updateMachineryEntrySchema);
    expect(serverDescriptorFor("expense").zodUpdate).toBe(updateExpenseEntrySchema);
    expect(serverDescriptorFor("incident").zodUpdate).toBe(updateIncidentEntrySchema);
  });

  it("maps each type to its create schema", () => {
    expect(serverDescriptorFor("labour").zodCreate).toBe(labourEntrySchema);
    expect(serverDescriptorFor("material").zodCreate).toBe(materialEntrySchema);
    expect(serverDescriptorFor("machinery").zodCreate).toBe(machineryEntrySchema);
    expect(serverDescriptorFor("expense").zodCreate).toBe(expenseEntrySchema);
    expect(serverDescriptorFor("incident").zodCreate).toBe(incidentEntrySchema);
  });

  // Order is load-bearing: expense checks Work Stage before Expense Category,
  // so a request with both invalid still reports the Work Stage error.
  it("lists the catalog-validated fields per type, in check order", () => {
    expect(serverDescriptorFor("labour").catalogFields).toEqual([["Work Stage", "workStage"]]);
    expect(serverDescriptorFor("material").catalogFields).toEqual([["Work Stage", "workStage"]]);
    expect(serverDescriptorFor("machinery").catalogFields).toEqual([["Work Stage", "workStage"]]);
    expect(serverDescriptorFor("expense").catalogFields).toEqual([
      ["Work Stage", "workStage"],
      ["Expense Category", "category"],
    ]);
    expect(serverDescriptorFor("incident").catalogFields).toEqual([
      ["Incident Type", "incidentType"],
      ["Incident Severity", "severity"],
    ]);
  });

  // Parity guard: the descriptor must agree with the encoding it replaces,
  // until that encoding is deleted in a later task.
  it("agrees with decimalFieldsFor for every type", () => {
    for (const type of ENTRY_TYPES) {
      expect([...serverDescriptorFor(type).decimalFields].sort(), type)
        .toEqual([...decimalFieldsFor(type)].sort());
    }
  });
});
