CREATE TYPE "public"."selector_mode" AS ENUM('default_enum', 'custom');--> statement-breakpoint
CREATE TYPE "public"."labour_default_type" AS ENUM('Steel work','Shuttering','Brick work','Concrete work','Plastering','Electric work','Plumbing','Tile work','Wood work','Paint work');--> statement-breakpoint
CREATE TYPE "public"."material_default_type" AS ENUM('Cement','M sand','P sand','Metal');--> statement-breakpoint
CREATE TYPE "public"."material_unit_mode" AS ENUM('master', 'custom');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('Pending', 'Approved', 'Declined');--> statement-breakpoint

DROP TABLE IF EXISTS "resource_transfers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "generic_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "field_definitions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "subcategories" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "categories" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "field_requests" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "resource_requests" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "incident_reports" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "expense_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "machinery_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "material_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "labour_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sites" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "notifications" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "user_profiles" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_labour_types" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_material_types" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_machinery_types" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "unit_master" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "custom_units" CASCADE;--> statement-breakpoint

CREATE TABLE "sites" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "site_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL UNIQUE,
  "location" varchar(255) NOT NULL,
  "status" "site_status" NOT NULL DEFAULT 'In Progress',
  "budget" numeric(15,2),
  "current_progress" integer,
  "current_phase" varchar(100),
  "supervisor_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "custom_labour_types" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "labour_type_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "custom_material_types" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "material_type_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "custom_machinery_types" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "equipment_type_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "unit_master" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unit_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "code" varchar(40) NOT NULL UNIQUE,
  "label" varchar(100) NOT NULL,
  "category" varchar(50) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "custom_units" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "unit_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid,
  "name" varchar(100) NOT NULL,
  "symbol" varchar(30),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "labour_entries" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "labour_entry_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "date" date NOT NULL,
  "work_type_mode" "selector_mode" NOT NULL DEFAULT 'default_enum',
  "work_type_enum" "labour_default_type",
  "work_type_custom_id" uuid,
  "work_type" varchar(100),
  "people_count" integer NOT NULL,
  "remarks" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "material_entries" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "material_entry_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "date" date NOT NULL,
  "material_type_mode" "selector_mode" NOT NULL DEFAULT 'default_enum',
  "material_type_enum" "material_default_type",
  "material_type_custom_id" uuid,
  "material_type" varchar(100),
  "quantity" numeric(12,2) NOT NULL,
  "unit_mode" "material_unit_mode" NOT NULL DEFAULT 'master',
  "unit_master_id" uuid,
  "unit_custom_id" uuid,
  "unit" varchar(50),
  "remarks" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "machinery_entries" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "machinery_entry_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "date" date NOT NULL,
  "equipment_type_mode" "selector_mode" NOT NULL DEFAULT 'default_enum',
  "equipment_type_custom_id" uuid,
  "equipment_type" varchar(100),
  "count" integer NOT NULL,
  "hours_active" numeric(8,2),
  "remarks" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "expense_entries" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "expense_entry_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "date" date NOT NULL,
  "description" varchar(500) NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "category" "expense_category" NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "incident_reports" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "incident_report_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "incident_type" "incident_type" NOT NULL,
  "severity" "severity" NOT NULL DEFAULT 'Low',
  "description" text NOT NULL,
  "duration_estimate" integer,
  "reported_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "resource_requests" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "request_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "request_type" "resource_type" NOT NULL,
  "details" text NOT NULL,
  "reason" text NOT NULL,
  "status" "request_status" NOT NULL DEFAULT 'Pending',
  "requested_by" uuid NOT NULL,
  "approved_by" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "field_requests" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "field_request_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "proposed_name" varchar(100) NOT NULL,
  "category_id" uuid NOT NULL,
  "subcategory_id" uuid,
  "field_type" "field_type" NOT NULL,
  "status" "request_status" NOT NULL DEFAULT 'Pending',
  "requested_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "notifications" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "notification_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "read_at" timestamp,
  "link_to_view" varchar(255),
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "categories" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "category_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL UNIQUE,
  "icon" varchar(50),
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "subcategories" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "subcategory_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "category_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "field_definitions" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "field_definition_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "subcategory_id" uuid NOT NULL,
  "label" varchar(100) NOT NULL,
  "field_type" "field_type" NOT NULL,
  "unit" varchar(50),
  "options" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "generic_entries" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "generic_entry_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL,
  "date" date NOT NULL,
  "field_definition_id" uuid NOT NULL,
  "value" jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "user_profiles" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "profile_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE,
  "phone" varchar(20),
  "assigned_region" varchar(100),
  "designation" varchar(100),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE "resource_transfers" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "transfer_id" uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "from_site_id" uuid NOT NULL,
  "to_site_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "resource_type" "resource_type" NOT NULL,
  "work_type_mode" "selector_mode",
  "work_type_enum" "labour_default_type",
  "work_type_custom_id" uuid,
  "material_type_mode" "selector_mode",
  "material_type_enum" "material_default_type",
  "material_type_custom_id" uuid,
  "unit_mode" "material_unit_mode",
  "unit_master_id" uuid,
  "unit_custom_id" uuid,
  "quantity" numeric(12,2) NOT NULL,
  "remarks" text,
  "status" "transfer_status" NOT NULL DEFAULT 'Pending',
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "reviewed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

INSERT INTO "unit_master" ("code", "label", "category") VALUES
('nos','Nos','count'),
('pair','Pair','count'),
('set','Set','count'),
('bag_50kg','Bag (50 kg)','package'),
('packet','Packet','package'),
('kg','Kilogram','weight'),
('tonne','Tonne','weight'),
('litre','Litre','volume'),
('kilolitre','Kilolitre','volume'),
('cum','Cubic Meter','volume'),
('sqft','Square Foot','area'),
('sqm','Square Meter','area'),
('rft','Running Foot','length'),
('meter','Meter','length'),
('trip','Trip','transport'),
('hour','Hour','time'),
('day','Day','time');
