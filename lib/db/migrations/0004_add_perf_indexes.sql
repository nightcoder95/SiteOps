CREATE INDEX "expense_entries_site_id_date_idx" ON "expense_entries" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "incident_reports_site_id_idx" ON "incident_reports" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "labour_entries_site_id_date_idx" ON "labour_entries" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "machinery_entries_site_id_date_idx" ON "machinery_entries" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "material_entries_site_id_date_idx" ON "material_entries" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sites_supervisor_id_idx" ON "sites" USING btree ("supervisor_id");