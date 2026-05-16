-- Composite (site_id, date DESC, created_at DESC) for entry list queries that
-- always sort newest-first. Replaces the asc-only (site_id, date) indexes.
CREATE INDEX IF NOT EXISTS "labour_entries_site_date_created_idx"
  ON "labour_entries" USING btree ("site_id", "date" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_entries_site_date_created_idx"
  ON "material_entries" USING btree ("site_id", "date" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "machinery_entries_site_date_created_idx"
  ON "machinery_entries" USING btree ("site_id", "date" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_entries_site_date_created_idx"
  ON "expense_entries" USING btree ("site_id", "date" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_reports_site_created_idx"
  ON "incident_reports" USING btree ("site_id", "created_at" DESC);
--> statement-breakpoint

-- Partial index for dashboard query: supervisor's active sites only.
CREATE INDEX IF NOT EXISTS "sites_supervisor_active_idx"
  ON "sites" USING btree ("supervisor_id")
  WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sites_active_idx"
  ON "sites" USING btree ("site_id")
  WHERE "archived_at" IS NULL;
--> statement-breakpoint

-- Lookup-table FKs used by category tree JOIN.
CREATE INDEX IF NOT EXISTS "subcategories_category_idx"
  ON "subcategories" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_definitions_subcategory_idx"
  ON "field_definitions" USING btree ("subcategory_id");
--> statement-breakpoint

-- Case-insensitive lookup for normalizeLabel duplicate detection.
CREATE INDEX IF NOT EXISTS "categories_name_lower_idx"
  ON "categories" USING btree (lower("name"));
