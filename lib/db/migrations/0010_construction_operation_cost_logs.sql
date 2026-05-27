DO $$
BEGIN
  CREATE TYPE "public"."material_work_stage" AS ENUM(
    'Basement Level',
    'Brick Level',
    'Lintel Level',
    'Roof Level',
    'Compound Wall',
    'Other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "labour_entries"
ADD COLUMN IF NOT EXISTS "wage_per_head" numeric(12, 2);--> statement-breakpoint

ALTER TABLE "material_entries"
ADD COLUMN IF NOT EXISTS "work_stage" "material_work_stage";--> statement-breakpoint

ALTER TABLE "material_entries"
ADD COLUMN IF NOT EXISTS "cost" numeric(12, 2);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "material_entries_site_id_work_stage_idx"
ON "material_entries" USING btree ("site_id", "work_stage");
