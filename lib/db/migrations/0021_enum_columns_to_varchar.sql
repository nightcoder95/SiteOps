-- Catalog SSOT — Phase 3. Convert the four former-enum columns to varchar,
-- preserving every existing value (USING col::text). The pg enum *types* are
-- left defined but unused (deletion deferred). Idempotent: each guard skips if
-- the column is already varchar.

-- material_entries.work_stage (nullable)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'material_entries' AND column_name = 'work_stage')
     <> 'character varying' THEN
    ALTER TABLE public.material_entries
      ALTER COLUMN work_stage TYPE varchar(100) USING work_stage::text;
  END IF;
END $$;
--> statement-breakpoint

-- expense_entries.category (not null)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'expense_entries' AND column_name = 'category')
     <> 'character varying' THEN
    ALTER TABLE public.expense_entries
      ALTER COLUMN category TYPE varchar(100) USING category::text;
  END IF;
END $$;
--> statement-breakpoint

-- incident_reports.incident_type (not null)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'incident_reports' AND column_name = 'incident_type')
     <> 'character varying' THEN
    ALTER TABLE public.incident_reports
      ALTER COLUMN incident_type TYPE varchar(100) USING incident_type::text;
  END IF;
END $$;
--> statement-breakpoint

-- incident_reports.severity (not null, default 'Low' — drop/re-add around retype)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'incident_reports' AND column_name = 'severity')
     <> 'character varying' THEN
    ALTER TABLE public.incident_reports ALTER COLUMN severity DROP DEFAULT;
    ALTER TABLE public.incident_reports
      ALTER COLUMN severity TYPE varchar(50) USING severity::text;
    ALTER TABLE public.incident_reports ALTER COLUMN severity SET DEFAULT 'Low';
  END IF;
END $$;
