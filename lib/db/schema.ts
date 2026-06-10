import {
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { isNull, sql } from "drizzle-orm";

export const siteStatusEnum = pgEnum("site_status", ["In Progress", "Blocked", "Completed"]);
export const requestStatusEnum = pgEnum("request_status", ["Pending", "Approved", "Declined"]);
export const expenseCategoryEnum = pgEnum("expense_category", ["Labour", "Materials", "Equipment", "Misc"]);
export const resourceTypeEnum = pgEnum("resource_type", ["Labour", "Materials", "Money", "Machinery"]);
export const incidentTypeEnum = pgEnum("incident_type", ["Safety", "Block"]);
export const severityEnum = pgEnum("severity", ["Low", "Medium", "High", "Critical"]);
export const notificationTypeEnum = pgEnum("notification_type", ["approval", "budget_alert", "incident", "system"]);
export const fieldTypeEnum = pgEnum("field_type", ["Number", "Text", "Dropdown"]);
export const userRoleEnum = pgEnum("user_role", ["Admin", "Supervisor"]);

export const labourDefaultTypeEnum = pgEnum("labour_default_type", [
  "Steel work",
  "Shuttering",
  "Brick work",
  "Concrete work",
  "Plastering",
  "Electric work",
  "Plumbing",
  "Tile work",
  "Wood work",
  "Paint work",
]);

export const materialDefaultTypeEnum = pgEnum("material_default_type", [
  "Cement",
  "M sand",
  "P sand",
  "Metal",
  "Steel",
  "Red Brick",
  "Cement Block 6in",
  "Cement Block 4in",
]);
export const materialWorkStageEnum = pgEnum("material_work_stage", [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
]);
export const materialUnitModeEnum = pgEnum("material_unit_mode", ["master", "custom"]);
export const selectorModeEnum = pgEnum("selector_mode", ["default_enum", "custom"]);
export const transferStatusEnum = pgEnum("transfer_status", ["Pending", "Approved", "Declined"]);

const identityId = () => integer("id").primaryKey().generatedAlwaysAsIdentity();

export const userProfiles = pgTable("user_profiles", {
  id: identityId(),
  profileId: uuid("profile_id").notNull().unique().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("Supervisor"),
  // Source of truth for temp-password hygiene. Set true on admin provisioning;
  // mirrored into a JWT claim by custom_access_token_hook so middleware can
  // force a password change without a per-request DB lookup.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  phone: varchar("phone", { length: 20 }),
  assignedRegion: varchar("assigned_region", { length: 100 }),
  designation: varchar("designation", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-only audit trail for privileged actions and permission denials only —
// never successful reads/writes (write amplification). actorUserId uses
// onDelete:"set null" (valid because userProfiles.userId is unique) so audit
// rows survive user deletion.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => userProfiles.userId, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(), // permission.denied | role.changed | user.created
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: varchar("resource_id", { length: 100 }),
    allowed: boolean("allowed").notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_created_idx").on(t.actorUserId, t.createdAt.desc().nullsLast()),
    index("audit_logs_action_created_idx").on(t.action, t.createdAt.desc().nullsLast()),
  ]
);

export const sites = pgTable("sites", {
  id: identityId(),
  siteId: uuid("site_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  location: varchar("location", { length: 255 }).notNull(),
  status: siteStatusEnum("status").notNull().default("In Progress"),
  budget: decimal("budget", { precision: 15, scale: 2 }),
  currentProgress: integer("current_progress"),
  currentPhase: varchar("current_phase", { length: 100 }),
  supervisorId: uuid("supervisor_id").notNull().references(() => userProfiles.userId),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("sites_supervisor_id_idx").on(t.supervisorId),
  index("sites_archived_at_idx").on(t.archivedAt),
  // Partial indexes for the dominant "active sites only" filter.
  index("sites_supervisor_active_idx").on(t.supervisorId).where(isNull(t.archivedAt)),
  index("sites_active_idx").on(t.siteId).where(isNull(t.archivedAt)),
]);

export const customLabourTypes = pgTable("custom_labour_types", {
  id: identityId(),
  labourTypeId: uuid("labour_type_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customMaterialTypes = pgTable("custom_material_types", {
  id: identityId(),
  materialTypeId: uuid("material_type_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customMachineryTypes = pgTable("custom_machinery_types", {
  id: identityId(),
  equipmentTypeId: uuid("equipment_type_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const unitMaster = pgTable("unit_master", {
  id: identityId(),
  unitId: uuid("unit_id").notNull().unique().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customUnits = pgTable("custom_units", {
  id: identityId(),
  unitId: uuid("unit_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").references(() => sites.siteId, { onDelete: "set null" }),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 30 }),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const labourEntries = pgTable("labour_entries", {
  id: identityId(),
  labourEntryId: uuid("labour_entry_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  date: date("date").notNull(),
  workTypeMode: selectorModeEnum("work_type_mode").notNull().default("default_enum"),
  workTypeEnum: labourDefaultTypeEnum("work_type_enum"),
  workTypeCustomId: uuid("work_type_custom_id").references(() => customLabourTypes.labourTypeId, { onDelete: "set null" }),
  workType: varchar("work_type", { length: 100 }),
  peopleCount: integer("people_count").notNull(),
  wagePerHead: decimal("wage_per_head", { precision: 12, scale: 2 }),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }),
  masonCount: integer("mason_count"),
  masonSalaryAmount: decimal("mason_salary_amount", { precision: 12, scale: 2 }),
  helperCount: integer("helper_count"),
  helperSalaryAmount: decimal("helper_salary_amount", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("labour_entries_site_id_date_idx").on(t.siteId, t.date),
  index("labour_entries_site_date_idx").on(t.siteId, t.date.desc()),
  index("labour_entries_site_date_created_idx").on(t.siteId, t.date.desc(), t.createdAt.desc()),
  index("labour_entries_created_at_idx").on(t.createdAt.desc()),
  index("labour_entries_created_by_idx").on(t.createdBy),
]);

export const materialEntries = pgTable("material_entries", {
  id: identityId(),
  materialEntryId: uuid("material_entry_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  date: date("date").notNull(),
  materialTypeMode: selectorModeEnum("material_type_mode").notNull().default("default_enum"),
  materialTypeEnum: materialDefaultTypeEnum("material_type_enum"),
  materialTypeCustomId: uuid("material_type_custom_id").references(() => customMaterialTypes.materialTypeId, { onDelete: "set null" }),
  materialType: varchar("material_type", { length: 100 }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unitMode: materialUnitModeEnum("unit_mode").notNull().default("master"),
  unitMasterId: uuid("unit_master_id").references(() => unitMaster.unitId, { onDelete: "set null" }),
  unitCustomId: uuid("unit_custom_id").references(() => customUnits.unitId, { onDelete: "set null" }),
  unit: varchar("unit", { length: 50 }),
  workStage: materialWorkStageEnum("work_stage"),
  cost: decimal("cost", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("material_entries_site_id_date_idx").on(t.siteId, t.date),
  index("material_entries_site_id_work_stage_idx").on(t.siteId, t.workStage),
  index("material_entries_site_date_idx").on(t.siteId, t.date.desc()),
  index("material_entries_site_date_created_idx").on(t.siteId, t.date.desc(), t.createdAt.desc()),
  index("material_entries_created_at_idx").on(t.createdAt.desc()),
  index("material_entries_created_by_idx").on(t.createdBy),
]);

export const machineryEntries = pgTable("machinery_entries", {
  id: identityId(),
  machineryEntryId: uuid("machinery_entry_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  date: date("date").notNull(),
  equipmentTypeMode: selectorModeEnum("equipment_type_mode").notNull().default("default_enum"),
  equipmentTypeCustomId: uuid("equipment_type_custom_id").references(() => customMachineryTypes.equipmentTypeId, { onDelete: "set null" }),
  equipmentType: varchar("equipment_type", { length: 100 }),
  count: integer("count").notNull(),
  hoursActive: decimal("hours_active", { precision: 8, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  remarks: text("remarks"),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("machinery_entries_site_id_date_idx").on(t.siteId, t.date),
  index("machinery_entries_site_date_idx").on(t.siteId, t.date.desc()),
  index("machinery_entries_site_date_created_idx").on(t.siteId, t.date.desc(), t.createdAt.desc()),
  index("machinery_entries_created_at_idx").on(t.createdAt.desc()),
  index("machinery_entries_created_by_idx").on(t.createdBy),
]);

export const expenseEntries = pgTable("expense_entries", {
  id: identityId(),
  expenseEntryId: uuid("expense_entry_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  category: expenseCategoryEnum("category").notNull(),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("expense_entries_site_id_date_idx").on(t.siteId, t.date),
  index("expense_entries_site_date_idx").on(t.siteId, t.date.desc()),
  index("expense_entries_site_date_created_idx").on(t.siteId, t.date.desc(), t.createdAt.desc()),
  index("expense_entries_created_at_idx").on(t.createdAt.desc()),
  index("expense_entries_created_by_idx").on(t.createdBy),
]);

export const resourceRequests = pgTable("resource_requests", {
  id: identityId(),
  requestId: uuid("request_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  requestType: resourceTypeEnum("request_type").notNull(),
  details: text("details").notNull(),
  reason: text("reason").notNull(),
  status: requestStatusEnum("status").notNull().default("Pending"),
  requestedBy: uuid("requested_by").notNull().references(() => userProfiles.userId),
  approvedBy: uuid("approved_by").references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("resource_requests_site_id_idx").on(t.siteId),
  index("resource_requests_status_idx").on(t.status),
  index("resource_requests_site_status_created_idx").on(t.siteId, t.status, t.createdAt.desc()),
  index("resource_requests_requested_by_status_created_idx").on(t.requestedBy, t.status, t.createdAt.desc()),
  index("resource_requests_status_updated_at_idx").on(t.status, t.updatedAt.desc()),
]);

export const fieldRequests = pgTable("field_requests", {
  id: identityId(),
  fieldRequestId: uuid("field_request_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  proposedName: varchar("proposed_name", { length: 100 }).notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.categoryId),
  subcategoryId: uuid("subcategory_id").references(() => subcategories.subcategoryId, { onDelete: "set null" }),
  fieldType: fieldTypeEnum("field_type").notNull(),
  status: requestStatusEnum("status").notNull().default("Pending"),
  requestedBy: uuid("requested_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("field_requests_site_status_created_idx").on(t.siteId, t.status, t.createdAt.desc()),
  index("field_requests_requested_by_status_created_idx").on(t.requestedBy, t.status, t.createdAt.desc()),
]);

export const incidentReports = pgTable("incident_reports", {
  id: identityId(),
  incidentReportId: uuid("incident_report_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  incidentType: incidentTypeEnum("incident_type").notNull(),
  severity: severityEnum("severity").notNull().default("Low"),
  description: text("description").notNull(),
  durationEstimate: integer("duration_estimate"),
  reportedBy: uuid("reported_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("incident_reports_site_id_idx").on(t.siteId),
  index("incident_reports_site_created_idx").on(t.siteId, t.createdAt.desc()),
  index("incident_reports_site_created_at_idx").on(t.siteId, t.createdAt.desc()),
  index("incident_reports_reported_by_idx").on(t.reportedBy),
]);

export const notifications = pgTable("notifications", {
  id: identityId(),
  notificationId: uuid("notification_id").notNull().unique().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => userProfiles.userId, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  readAt: timestamp("read_at"),
  linkToView: varchar("link_to_view", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt),
  index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
  index("notifications_user_read_idx").on(t.userId, t.readAt),
  // Partial index for the common unread-only query — avoids full scan when most notifications are read.
  index("notifications_user_id_unread_idx").on(t.userId, t.readAt).where(isNull(t.readAt)),
]);

export const categories = pgTable("categories", {
  id: identityId(),
  categoryId: uuid("category_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // Case-insensitive lookup to match normalizeLabel duplicate detection.
  index("categories_name_lower_idx").on(sql`lower(${t.name})`),
]);

export const subcategories = pgTable("subcategories", {
  id: identityId(),
  subcategoryId: uuid("subcategory_id").notNull().unique().defaultRandom(),
  categoryId: uuid("category_id").notNull().references(() => categories.categoryId, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("subcategories_category_idx").on(t.categoryId),
]);

export const fieldDefinitions = pgTable("field_definitions", {
  id: identityId(),
  fieldDefinitionId: uuid("field_definition_id").notNull().unique().defaultRandom(),
  subcategoryId: uuid("subcategory_id").notNull().references(() => subcategories.subcategoryId, { onDelete: "cascade" }),
  label: varchar("label", { length: 100 }).notNull(),
  fieldType: fieldTypeEnum("field_type").notNull(),
  unit: varchar("unit", { length: 50 }),
  options: jsonb("options"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("field_definitions_subcategory_idx").on(t.subcategoryId),
  uniqueIndex("field_definitions_subcategory_label_uidx").on(t.subcategoryId, t.label),
]);

export const genericEntries = pgTable("generic_entries", {
  id: identityId(),
  genericEntryId: uuid("generic_entry_id").notNull().unique().defaultRandom(),
  siteId: uuid("site_id").notNull().references(() => sites.siteId, { onDelete: "cascade" }),
  date: date("date").notNull(),
  fieldDefinitionId: uuid("field_definition_id").notNull().references(() => fieldDefinitions.fieldDefinitionId, { onDelete: "cascade" }),
  value: jsonb("value").notNull(),
  createdBy: uuid("created_by").notNull().references(() => userProfiles.userId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("generic_entries_site_date_idx").on(t.siteId, t.date.desc()),
  index("generic_entries_field_definition_idx").on(t.fieldDefinitionId),
]);

export const resourceTransfers = pgTable("resource_transfers", {
  id: identityId(),
  transferId: uuid("transfer_id").notNull().unique().defaultRandom(),
  fromSiteId: uuid("from_site_id").notNull().references(() => sites.siteId),
  toSiteId: uuid("to_site_id").notNull().references(() => sites.siteId),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => userProfiles.userId),
  approvedByUserId: uuid("approved_by_user_id").references(() => userProfiles.userId),
  resourceType: resourceTypeEnum("resource_type").notNull(),
  workTypeMode: selectorModeEnum("work_type_mode"),
  workTypeEnum: labourDefaultTypeEnum("work_type_enum"),
  workTypeCustomId: uuid("work_type_custom_id").references(() => customLabourTypes.labourTypeId, { onDelete: "set null" }),
  materialTypeMode: selectorModeEnum("material_type_mode"),
  materialTypeEnum: materialDefaultTypeEnum("material_type_enum"),
  materialTypeCustomId: uuid("material_type_custom_id").references(() => customMaterialTypes.materialTypeId, { onDelete: "set null" }),
  unitMode: materialUnitModeEnum("unit_mode"),
  unitMasterId: uuid("unit_master_id").references(() => unitMaster.unitId, { onDelete: "set null" }),
  unitCustomId: uuid("unit_custom_id").references(() => customUnits.unitId, { onDelete: "set null" }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  remarks: text("remarks"),
  status: transferStatusEnum("status").notNull().default("Pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("resource_transfers_status_idx").on(t.status),
  index("resource_transfers_from_site_id_idx").on(t.fromSiteId),
  index("resource_transfers_to_site_id_idx").on(t.toSiteId),
]);
