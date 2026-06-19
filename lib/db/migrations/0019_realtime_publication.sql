-- Add entry/notification/site tables to the supabase_realtime publication so the
-- native Android client can subscribe to Postgres change streams. RLS (0015/0016)
-- already gates row visibility, so publishing changes is safe.
--
-- Idempotent: ALTER PUBLICATION ... ADD TABLE errors if a table is already a member,
-- so we guard each table against pg_publication_tables before adding it.
--
-- NOTE: this is an operational change (publication membership), not a schema change,
-- so the 0019 drizzle snapshot is an unchanged copy of 0018. The DB is push-managed
-- (see project_migration_lineage) — apply with: psql "$DIRECT_URL" -f this_file.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sites',
    'labour_entries',
    'material_entries',
    'machinery_entries',
    'expense_entries',
    'incident_reports',
    'generic_entries',
    'resource_requests',
    'resource_transfers',
    'field_requests',
    'notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip tables that don't exist (defensive across environments).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Skip tables already in the publication (avoids the duplicate error).
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
  END LOOP;
END $$;
