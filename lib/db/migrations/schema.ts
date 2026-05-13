import { pgTable, unique, uuid, timestamp, text, varchar, boolean, date, numeric, jsonb, integer, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const expenseCategory = pgEnum("expense_category", ['Labour', 'Materials', 'Equipment', 'Misc'])
export const fieldType = pgEnum("field_type", ['Number', 'Text', 'Dropdown'])
export const incidentType = pgEnum("incident_type", ['Safety', 'Block'])
export const notificationType = pgEnum("notification_type", ['approval', 'budget_alert', 'incident', 'system'])
export const requestStatus = pgEnum("request_status", ['Pending', 'Approved', 'Declined'])
export const resourceType = pgEnum("resource_type", ['Labour', 'Materials', 'Money', 'Machinery'])
export const severity = pgEnum("severity", ['Low', 'Medium', 'High', 'Critical'])
export const siteStatus = pgEnum("site_status", ['In Progress', 'Blocked', 'Completed'])
export const userRole = pgEnum("user_role", ['Admin', 'Supervisor'])


export const sessions = pgTable("sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	token: text().notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
}, (table) => [
	unique("sessions_token_unique").on(table.token),
]);

export const accounts = pgTable("accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	accountId: varchar("account_id", { length: 255 }).notNull(),
	providerId: varchar("provider_id", { length: 255 }).notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
});

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 255 }),
	role: userRole().default('Supervisor').notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const verifications = pgTable("verifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	icon: varchar({ length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("categories_name_unique").on(table.name),
]);

export const expenseEntries = pgTable("expense_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	date: date().notNull(),
	description: varchar({ length: 500 }).notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	category: expenseCategory().notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const fieldDefinitions = pgTable("field_definitions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	subcategoryId: uuid("subcategory_id").notNull(),
	label: varchar({ length: 100 }).notNull(),
	fieldType: fieldType("field_type").notNull(),
	unit: varchar({ length: 50 }),
	options: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const fieldRequests = pgTable("field_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	proposedName: varchar("proposed_name", { length: 100 }).notNull(),
	categoryId: uuid("category_id").notNull(),
	subcategoryId: uuid("subcategory_id"),
	fieldType: fieldType("field_type").notNull(),
	status: requestStatus().default('Pending').notNull(),
	requestedBy: uuid("requested_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const genericEntries = pgTable("generic_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	date: date().notNull(),
	fieldDefinitionId: uuid("field_definition_id").notNull(),
	value: jsonb().notNull(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const incidentReports = pgTable("incident_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	incidentType: incidentType("incident_type").notNull(),
	severity: severity().default('Low').notNull(),
	description: text().notNull(),
	durationEstimate: integer("duration_estimate"),
	reportedBy: uuid("reported_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const labourEntries = pgTable("labour_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	date: date().notNull(),
	workType: varchar("work_type", { length: 100 }).notNull(),
	peopleCount: integer("people_count").notNull(),
	remarks: text(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const machineryEntries = pgTable("machinery_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	date: date().notNull(),
	equipmentType: varchar("equipment_type", { length: 100 }).notNull(),
	count: integer().notNull(),
	hoursActive: numeric("hours_active", { precision: 8, scale:  2 }).notNull(),
	remarks: text(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const materialEntries = pgTable("material_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	date: date().notNull(),
	materialType: varchar("material_type", { length: 100 }).notNull(),
	quantity: numeric({ precision: 12, scale:  2 }).notNull(),
	unit: varchar({ length: 50 }).notNull(),
	remarks: text(),
	createdBy: uuid("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: notificationType().notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	readAt: timestamp("read_at", { mode: 'string' }),
	linkToView: varchar("link_to_view", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const resourceRequests = pgTable("resource_requests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	siteId: uuid("site_id").notNull(),
	requestType: resourceType("request_type").notNull(),
	details: text().notNull(),
	reason: text().notNull(),
	status: requestStatus().default('Pending').notNull(),
	requestedBy: uuid("requested_by").notNull(),
	approvedBy: uuid("approved_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const sites = pgTable("sites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	location: varchar({ length: 255 }).notNull(),
	status: siteStatus().default('In Progress').notNull(),
	budget: numeric({ precision: 15, scale:  2 }).notNull(),
	currentProgress: integer("current_progress").default(0),
	currentPhase: varchar("current_phase", { length: 100 }),
	supervisorId: uuid("supervisor_id").notNull(),
	archivedAt: timestamp("archived_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("sites_name_unique").on(table.name),
]);

export const subcategories = pgTable("subcategories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	categoryId: uuid("category_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	role: userRole().default('Supervisor').notNull(),
	phone: varchar({ length: 20 }),
	assignedRegion: varchar("assigned_region", { length: 100 }),
	designation: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_profiles_user_id_unique").on(table.userId),
]);
