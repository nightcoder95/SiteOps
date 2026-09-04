import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

if (!process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is not set. Copy .env.example to .env.local");
}

// NOTE: `drizzle-kit introspect` writes lib/db/migrations/{schema,relations}.ts.
// Those files are NOT the source of truth (lib/db/schema.ts is) and go stale
// immediately — they were deleted in 2026-09 because they still declared enums
// dropped in migration 0021. If you run introspect, delete its output again.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL,
  },
});
