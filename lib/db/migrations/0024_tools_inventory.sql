-- Tools Inventory module — 4 tables + indexes + CHECKs + FK actions + RLS +
-- default category seed.
--
-- Idempotent + txn-wrapped so it is safe to apply against the push-managed live
-- DB and safe to re-run (mirrors 0020/0022 procedure — see project_migration_
-- lineage). Apply with:
--   psql "$DIRECT_URL" -f lib/db/migrations/0024_tools_inventory.sql
-- (NOT `npm run db:migrate` — the live DB is push-managed, __drizzle_migrations
-- is empty). Object names match drizzle-kit output so `db:generate` stays clean.
BEGIN;

-- ── tool_categories ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tool_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tool_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"code_prefix" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_categories_category_id_unique" UNIQUE("category_id")
);
--> statement-breakpoint

-- ── tools ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tools" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tools_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tool_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(20) NOT NULL,
	"category_id" uuid NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"icon" varchar(50),
	"version" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tools_tool_id_unique" UNIQUE("tool_id"),
	CONSTRAINT "tools_code_unique" UNIQUE("code"),
	CONSTRAINT "tools_total_quantity_nonneg" CHECK ("tools"."total_quantity" >= 0)
);
--> statement-breakpoint

-- ── tool_assignments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tool_assignments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tool_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"tool_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_assignments_quantity_pos" CHECK ("tool_assignments"."quantity" >= 1)
);
--> statement-breakpoint

-- ── tool_movements (append-only ledger) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tool_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tool_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"movement_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"from_location" varchar(64) NOT NULL,
	"to_location" varchar(64) NOT NULL,
	"quantity" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"note" varchar(500),
	"actor_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_movements_movement_id_unique" UNIQUE("movement_id"),
	CONSTRAINT "tool_movements_quantity_pos" CHECK ("tool_movements"."quantity" >= 1)
);
--> statement-breakpoint

-- ── Foreign keys (idempotent) ───────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "tools" ADD CONSTRAINT "tools_category_id_tool_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tool_categories"("category_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tools" ADD CONSTRAINT "tools_created_by_user_id_user_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tools" ADD CONSTRAINT "tools_updated_by_user_id_user_profiles_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_assignments" ADD CONSTRAINT "tool_assignments_tool_id_tools_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("tool_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_assignments" ADD CONSTRAINT "tool_assignments_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_movements" ADD CONSTRAINT "tool_movements_tool_id_tools_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("tool_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tool_movements" ADD CONSTRAINT "tool_movements_actor_user_id_user_profiles_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "tool_categories_name_active_uidx" ON "tool_categories" USING btree (lower("name")) WHERE "tool_categories"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_categories_code_prefix_uidx" ON "tool_categories" USING btree ("code_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tools_name_active_uidx" ON "tools" USING btree (lower("name")) WHERE "tools"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tools_category_id_idx" ON "tools" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_assignments_tool_site_uidx" ON "tool_assignments" USING btree ("tool_id","site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_assignments_tool_id_idx" ON "tool_assignments" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_assignments_site_id_idx" ON "tool_assignments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_movements_tool_created_idx" ON "tool_movements" USING btree ("tool_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_movements_created_idx" ON "tool_movements" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint

-- ── RLS: authenticated read, admin write (mirror unit_master / categories) ──
ALTER TABLE "tool_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tc:select" ON "tool_categories";--> statement-breakpoint
CREATE POLICY "tc:select" ON "tool_categories" FOR SELECT USING (auth.role() = 'authenticated');--> statement-breakpoint
DROP POLICY IF EXISTS "tc:write" ON "tool_categories";--> statement-breakpoint
CREATE POLICY "tc:write" ON "tool_categories" FOR ALL USING ((auth.jwt() ->> 'user_role') = 'Admin') WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');--> statement-breakpoint

ALTER TABLE "tools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tools:select" ON "tools";--> statement-breakpoint
CREATE POLICY "tools:select" ON "tools" FOR SELECT USING (auth.role() = 'authenticated');--> statement-breakpoint
DROP POLICY IF EXISTS "tools:write" ON "tools";--> statement-breakpoint
CREATE POLICY "tools:write" ON "tools" FOR ALL USING ((auth.jwt() ->> 'user_role') = 'Admin') WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');--> statement-breakpoint

ALTER TABLE "tool_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ta:select" ON "tool_assignments";--> statement-breakpoint
CREATE POLICY "ta:select" ON "tool_assignments" FOR SELECT USING (auth.role() = 'authenticated');--> statement-breakpoint
DROP POLICY IF EXISTS "ta:write" ON "tool_assignments";--> statement-breakpoint
CREATE POLICY "ta:write" ON "tool_assignments" FOR ALL USING ((auth.jwt() ->> 'user_role') = 'Admin') WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');--> statement-breakpoint

ALTER TABLE "tool_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tm:select" ON "tool_movements";--> statement-breakpoint
CREATE POLICY "tm:select" ON "tool_movements" FOR SELECT USING (auth.role() = 'authenticated');--> statement-breakpoint
DROP POLICY IF EXISTS "tm:write" ON "tool_movements";--> statement-breakpoint
CREATE POLICY "tm:write" ON "tool_movements" FOR ALL USING ((auth.jwt() ->> 'user_role') = 'Admin') WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');--> statement-breakpoint

-- ── Seed default tool categories (idempotent) ──────────────────────────────
INSERT INTO "tool_categories" (name, code_prefix, sort_order) VALUES
	('Hand Tool', 'HND', 0),
	('Power Tool', 'PWR', 1),
	('Equipment', 'EQP', 2),
	('Container', 'CNT', 3),
	('Safety', 'SFT', 4)
ON CONFLICT (code_prefix) DO NOTHING;

COMMIT;
