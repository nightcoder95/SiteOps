-- Re-baseline + site lifecycle changes.
--
-- This migration registers `push_subscriptions` into the Drizzle lineage (it was
-- previously added by the hand-applied 0015 migration that lived outside the
-- journal, so the snapshot drifted and re-emitted it). All statements are
-- idempotent, so this is a safe no-op on a DB where 0015 already ran, and a
-- correct create on a fresh DB. Going forward the Drizzle snapshot matches the
-- real schema and `db:generate` produces clean diffs.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subscription_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT IF EXISTS "sites_name_unique";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "full_name" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sites_name_active_uidx" ON "sites" USING btree ("name") WHERE "sites"."archived_at" IS NULL AND "sites"."is_deleted" = false;
