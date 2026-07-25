// Apply ONE reviewed migration file to the database via psql.
//
// The live DB is push-managed: drizzle.__drizzle_migrations is empty, so
// `drizzle-kit migrate` (npm run db:migrate) would replay every migration in
// the journal against production. Migrations here are hand-written idempotent
// (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) and txn-wrapped, and
// are applied one file at a time on purpose. __drizzle_migrations stays empty.
//
// Usage: npm run db:apply -- lib/db/migrations/0025_global_work_stage.sql
//
// Back up first — pg_dump, not `npm run backup` (that one uploads to Drive and
// reads columns via schema.ts, so it breaks whenever schema.ts leads the DB):
//   pg_dump "$DIRECT_URL" --schema=public --no-owner --no-privileges -f ~/bak.sql

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const file = process.argv[2];

if (!file) {
  console.error("Usage: npm run db:apply -- <path/to/migration.sql>");
  process.exit(1);
}

if (!existsSync(file)) {
  console.error(`Migration file not found: ${file}`);
  process.exit(1);
}

const url = process.env.DIRECT_URL;

if (!url) {
  console.error("DIRECT_URL is not set. Copy .env.example to .env.local");
  process.exit(1);
}

// ON_ERROR_STOP so a failure part-way through the file's BEGIN/COMMIT aborts
// before COMMIT rather than leaving the migration half-applied.
const result = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", file], {
  stdio: "inherit",
});

if (result.error) {
  const reason =
    (result.error as NodeJS.ErrnoException).code === "ENOENT"
      ? "psql not found on PATH — install the postgresql client"
      : result.error.message;
  console.error(`Could not run psql: ${reason}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
