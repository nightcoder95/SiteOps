-- 0023_remarks_trgm_search.sql
-- Global remarks/description search support (pg_trgm + GIN indexes).
-- Idempotent + re-run safe. DB is push-managed, NOT migrate-managed:
-- apply directly to the live DB, e.g.
--   psql "$DIRECT_URL" -f lib/db/migrations/0023_remarks_trgm_search.sql
-- (or via postgres.js `sql.unsafe(file)`). See migration-lineage note.
--
-- NOTE: CREATE INDEX (not CONCURRENTLY) — tables are small today and this runs
-- inside a single transaction. If any of these tables is large at apply time,
-- run that one index with CREATE INDEX CONCURRENTLY *outside* a transaction
-- instead (CONCURRENTLY cannot run inside a txn block).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS labour_entries_remarks_trgm_idx
  ON labour_entries USING gin (remarks gin_trgm_ops);

CREATE INDEX IF NOT EXISTS material_entries_remarks_trgm_idx
  ON material_entries USING gin (remarks gin_trgm_ops);

CREATE INDEX IF NOT EXISTS machinery_entries_remarks_trgm_idx
  ON machinery_entries USING gin (remarks gin_trgm_ops);

-- expense has no `remarks` column; its free-text note is `description`.
CREATE INDEX IF NOT EXISTS expense_entries_description_trgm_idx
  ON expense_entries USING gin (description gin_trgm_ops);
