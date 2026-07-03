// lib/export/tableRegistry.ts
// Single source of truth for what the backup/export covers and in what order.
// ORDER MATTERS: parents (FK targets) before children, so the JSON backup can be
// re-imported top-to-bottom without violating foreign keys. When you add a table
// to schema.ts, add it here too — tableRegistry.test.ts fails until you do.
import type { PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";

export type TableEntry = { key: string; table: PgTable };

export const TABLE_REGISTRY: readonly TableEntry[] = [
  // level 0 — no FK deps
  { key: "user_profiles", table: schema.userProfiles },
  { key: "unit_master", table: schema.unitMaster },
  { key: "categories", table: schema.categories },
  { key: "tool_categories", table: schema.toolCategories },
  // level 1 — depend on user_profiles / categories / tool_categories
  { key: "audit_logs", table: schema.auditLogs },
  { key: "sites", table: schema.sites },
  { key: "custom_labour_types", table: schema.customLabourTypes },
  { key: "custom_material_types", table: schema.customMaterialTypes },
  { key: "custom_machinery_types", table: schema.customMachineryTypes },
  { key: "subcategories", table: schema.subcategories },
  { key: "tools", table: schema.tools },
  // level 2 — depend on sites / subcategories / custom types / unit_master / tools
  { key: "custom_units", table: schema.customUnits },
  { key: "tool_assignments", table: schema.toolAssignments },
  { key: "tool_movements", table: schema.toolMovements },
  { key: "material_type_units", table: schema.materialTypeUnits },
  { key: "field_definitions", table: schema.fieldDefinitions },
  { key: "labour_entries", table: schema.labourEntries },
  { key: "material_entries", table: schema.materialEntries },
  { key: "machinery_entries", table: schema.machineryEntries },
  { key: "expense_entries", table: schema.expenseEntries },
  { key: "resource_requests", table: schema.resourceRequests },
  { key: "field_requests", table: schema.fieldRequests },
  { key: "incident_reports", table: schema.incidentReports },
  { key: "notifications", table: schema.notifications },
  { key: "resource_transfers", table: schema.resourceTransfers },
  { key: "push_subscriptions", table: schema.pushSubscriptions },
  // level 3 — depend on field_definitions
  { key: "generic_entries", table: schema.genericEntries },
];

export const TABLE_KEYS = TABLE_REGISTRY.map((t) => t.key);

export function getTableEntry(key: string): TableEntry | undefined {
  return TABLE_REGISTRY.find((t) => t.key === key);
}
