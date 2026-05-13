ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "role" "user_role" NOT NULL DEFAULT 'Supervisor';--> statement-breakpoint
DROP TABLE IF EXISTS "accounts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "verifications" CASCADE;
