-- Global work stage — adds nullable work_stage columns to labour/machinery/
-- expense entries (material already has one, required) and renames the
-- managed catalog list "Material Work Stage" -> "Work Stage" so it's shared
-- across all four entry types.
--
-- Idempotent + txn-wrapped (mirrors 0020/0022/0024 procedure). Apply with:
--   psql "$DIRECT_URL" -f lib/db/migrations/0025_global_work_stage.sql
BEGIN;

ALTER TABLE "expense_entries" ADD COLUMN IF NOT EXISTS "work_stage" varchar(100);
--> statement-breakpoint
ALTER TABLE "labour_entries" ADD COLUMN IF NOT EXISTS "work_stage" varchar(100);
--> statement-breakpoint
ALTER TABLE "machinery_entries" ADD COLUMN IF NOT EXISTS "work_stage" varchar(100);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "expense_entries_site_id_work_stage_idx" ON "expense_entries" USING btree ("site_id","work_stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labour_entries_site_id_work_stage_idx" ON "labour_entries" USING btree ("site_id","work_stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machinery_entries_site_id_work_stage_idx" ON "machinery_entries" USING btree ("site_id","work_stage");
--> statement-breakpoint

-- Catalog rename: entry columns store the option NAME, not an FK, so no other
-- data migration is needed — existing material_entries.work_stage values keep
-- matching the renamed category's items.
UPDATE "categories" SET "name" = 'Work Stage' WHERE "name" = 'Material Work Stage';

COMMIT;
