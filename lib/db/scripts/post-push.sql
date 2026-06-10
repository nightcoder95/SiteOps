-- ═══════════════════════════════════════════════════════════════════════════════
-- post-push.sql — Run AFTER `npx drizzle-kit push`
--
-- Layers everything drizzle-kit push can't express on top of the DDL it creates:
--   1. Custom access token hook  (PL/pgSQL function + grants)
--   2. Unit master seed          (18 rows, idempotent via ON CONFLICT)
--   3. Catalog seed              (4 categories + 22 subcategories, idempotent)
--   4. RLS policies              (helper fn + ENABLE RLS + all policies)
--
-- This script is fully idempotent — safe to re-run at any time.
--
-- Usage:
--   psql "$DIRECT_URL" -f lib/db/scripts/post-push.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. CUSTOM ACCESS TOKEN HOOK ────────────────────────────────────────────
-- Injects `user_role` and `must_change_password` claims into every JWT at mint
-- time. After running, enable in Supabase Dashboard → Auth → Hooks.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role text;
  resolved_must_change boolean;
  user_uuid uuid;
  claims jsonb;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  BEGIN
    user_uuid := (event->>'user_id')::uuid;
  EXCEPTION WHEN others THEN
    user_uuid := NULL;
  END;

  IF user_uuid IS NOT NULL THEN
    SELECT role::text, must_change_password
      INTO resolved_role, resolved_must_change
    FROM public.user_profiles
    WHERE user_id = user_uuid;
  END IF;

  IF resolved_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(resolved_role), true);
  END IF;

  -- Always emit the flag (default false) so a cleared flag overwrites a stale one.
  claims := jsonb_set(
    claims,
    '{must_change_password}',
    to_jsonb(COALESCE(resolved_must_change, false)),
    true
  );

  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- The hook reads user_profiles; grant the auth admin role read access.
GRANT SELECT (user_id, role, must_change_password) ON public.user_profiles TO supabase_auth_admin;


-- ─── 2. UNIT MASTER SEED (18 rows) ─────────────────────────────────────────
-- Idempotent: ON CONFLICT (code) upserts so re-runs are safe.

INSERT INTO "unit_master" ("code", "label", "category") VALUES
  ('nos',       'Nos',          'count'),
  ('pair',      'Pair',         'count'),
  ('set',       'Set',          'count'),
  ('bag_50kg',  'Bag (50 kg)',  'package'),
  ('packet',    'Packet',       'package'),
  ('kg',        'Kilogram',     'weight'),
  ('tonne',     'Tonne',        'weight'),
  ('litre',     'Litre',        'volume'),
  ('kilolitre', 'Kilolitre',    'volume'),
  ('cum',       'Cubic Meter',  'volume'),
  ('cft',       'CFT',          'volume'),
  ('sqft',      'Square Foot',  'area'),
  ('sqm',       'Square Meter', 'area'),
  ('rft',       'Running Foot', 'length'),
  ('meter',     'Meter',        'length'),
  ('trip',      'Trip',         'transport'),
  ('hour',      'Hour',         'time'),
  ('day',       'Day',          'time')
ON CONFLICT ("code") DO UPDATE
SET "label"    = EXCLUDED."label",
    "category" = EXCLUDED."category",
    "is_active" = true,
    "updated_at" = now();


-- ─── 3. CATALOG SEED (4 categories + 22 subcategories) ─────────────────────
-- Consolidated from 0009 + 0011. Idempotent: skips if categories already exist,
-- subcategory inserts use WHERE NOT EXISTS to avoid duplicates.

DO $$
DECLARE
  has_rows boolean;
  labour_id uuid;
  materials_id uuid;
  machinery_id uuid;
  expenses_id uuid;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.categories) INTO has_rows;
  IF has_rows THEN
    RAISE NOTICE 'Catalog seed: categories already exist, skipping.';
    RETURN;
  END IF;

  INSERT INTO public.categories (name, icon) VALUES ('Labour', NULL)              RETURNING category_id INTO labour_id;
  INSERT INTO public.categories (name, icon) VALUES ('Materials', NULL)           RETURNING category_id INTO materials_id;
  INSERT INTO public.categories (name, icon) VALUES ('Machinery/Equipment', NULL) RETURNING category_id INTO machinery_id;
  INSERT INTO public.categories (name, icon) VALUES ('Expenses', NULL)            RETURNING category_id INTO expenses_id;

  -- Labour subcategories
  INSERT INTO public.subcategories (category_id, name) VALUES
    (labour_id, 'Steel work'),
    (labour_id, 'Shuttering'),
    (labour_id, 'Brick work'),
    (labour_id, 'Concrete work'),
    (labour_id, 'Plastering'),
    (labour_id, 'Electric work'),
    (labour_id, 'Plumbing'),
    (labour_id, 'Tile work'),
    (labour_id, 'Wood work'),
    (labour_id, 'Paint work');

  -- Materials subcategories (original 4 + 4 from 0011)
  INSERT INTO public.subcategories (category_id, name) VALUES
    (materials_id, 'Cement'),
    (materials_id, 'M sand'),
    (materials_id, 'P sand'),
    (materials_id, 'Metal'),
    (materials_id, 'Steel'),
    (materials_id, 'Red Brick'),
    (materials_id, 'Cement Block 6in'),
    (materials_id, 'Cement Block 4in');

  -- Machinery subcategories
  INSERT INTO public.subcategories (category_id, name) VALUES
    (machinery_id, 'Excavator'),
    (machinery_id, 'Concrete Mixer'),
    (machinery_id, 'Crane'),
    (machinery_id, 'Vibrator'),
    (machinery_id, 'Generator');

  -- Expense subcategories
  INSERT INTO public.subcategories (category_id, name) VALUES
    (expenses_id, 'Transport'),
    (expenses_id, 'Food'),
    (expenses_id, 'Misc');
END $$;


-- ─── 4. ROW LEVEL SECURITY ─────────────────────────────────────────────────
-- Consolidated from 0014 + 0016. Every policy uses DROP IF EXISTS + CREATE
-- so this section is fully re-runnable.
--
-- Identity: auth.uid()                 = user_profiles.user_id
-- Role:     auth.jwt() ->> 'user_role' = 'Admin' | 'Supervisor'
-- Admin:    full access to all data
-- Supervisor: scoped to sites they supervise and their own records
-- Service-role clients (server actions) bypass RLS entirely.

-- ── Helper: check if current user supervises a given site ────────────────────
CREATE OR REPLACE FUNCTION public.is_site_supervisor(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sites
    WHERE site_id = p_site_id AND supervisor_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_site_supervisor(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_site_supervisor(uuid) TO authenticated;

-- ── user_profiles ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "up:select" ON public.user_profiles;
CREATE POLICY "up:select"
  ON public.user_profiles FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "up:insert" ON public.user_profiles;
CREATE POLICY "up:insert"
  ON public.user_profiles FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "up:update" ON public.user_profiles;
CREATE POLICY "up:update"
  ON public.user_profiles FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "up:delete" ON public.user_profiles;
CREATE POLICY "up:delete"
  ON public.user_profiles FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── audit_logs ───────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "al:select" ON public.audit_logs;
CREATE POLICY "al:select"
  ON public.audit_logs FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── sites ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sites:select" ON public.sites;
CREATE POLICY "sites:select"
  ON public.sites FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid());

DROP POLICY IF EXISTS "sites:insert" ON public.sites;
CREATE POLICY "sites:insert"
  ON public.sites FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "sites:update" ON public.sites;
CREATE POLICY "sites:update"
  ON public.sites FOR UPDATE
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid())
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid());

DROP POLICY IF EXISTS "sites:delete" ON public.sites;
CREATE POLICY "sites:delete"
  ON public.sites FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── labour_entries ────────────────────────────────────────────────────────────
ALTER TABLE public.labour_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "le:select" ON public.labour_entries;
CREATE POLICY "le:select"
  ON public.labour_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "le:insert" ON public.labour_entries;
CREATE POLICY "le:insert"
  ON public.labour_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "le:update" ON public.labour_entries;
CREATE POLICY "le:update"
  ON public.labour_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "le:delete" ON public.labour_entries;
CREATE POLICY "le:delete"
  ON public.labour_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── material_entries ──────────────────────────────────────────────────────────
ALTER TABLE public.material_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mte:select" ON public.material_entries;
CREATE POLICY "mte:select"
  ON public.material_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "mte:insert" ON public.material_entries;
CREATE POLICY "mte:insert"
  ON public.material_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "mte:update" ON public.material_entries;
CREATE POLICY "mte:update"
  ON public.material_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "mte:delete" ON public.material_entries;
CREATE POLICY "mte:delete"
  ON public.material_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── machinery_entries ─────────────────────────────────────────────────────────
ALTER TABLE public.machinery_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mae:select" ON public.machinery_entries;
CREATE POLICY "mae:select"
  ON public.machinery_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "mae:insert" ON public.machinery_entries;
CREATE POLICY "mae:insert"
  ON public.machinery_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "mae:update" ON public.machinery_entries;
CREATE POLICY "mae:update"
  ON public.machinery_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "mae:delete" ON public.machinery_entries;
CREATE POLICY "mae:delete"
  ON public.machinery_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── expense_entries ───────────────────────────────────────────────────────────
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ee:select" ON public.expense_entries;
CREATE POLICY "ee:select"
  ON public.expense_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "ee:insert" ON public.expense_entries;
CREATE POLICY "ee:insert"
  ON public.expense_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "ee:update" ON public.expense_entries;
CREATE POLICY "ee:update"
  ON public.expense_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "ee:delete" ON public.expense_entries;
CREATE POLICY "ee:delete"
  ON public.expense_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── generic_entries ───────────────────────────────────────────────────────────
ALTER TABLE public.generic_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ge:select" ON public.generic_entries;
CREATE POLICY "ge:select"
  ON public.generic_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "ge:insert" ON public.generic_entries;
CREATE POLICY "ge:insert"
  ON public.generic_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "ge:update" ON public.generic_entries;
CREATE POLICY "ge:update"
  ON public.generic_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "ge:delete" ON public.generic_entries;
CREATE POLICY "ge:delete"
  ON public.generic_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── incident_reports ──────────────────────────────────────────────────────────
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ir:select" ON public.incident_reports;
CREATE POLICY "ir:select"
  ON public.incident_reports FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "ir:insert" ON public.incident_reports;
CREATE POLICY "ir:insert"
  ON public.incident_reports FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );

DROP POLICY IF EXISTS "ir:update" ON public.incident_reports;
CREATE POLICY "ir:update"
  ON public.incident_reports FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );

DROP POLICY IF EXISTS "ir:delete" ON public.incident_reports;
CREATE POLICY "ir:delete"
  ON public.incident_reports FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );

-- ── resource_requests ─────────────────────────────────────────────────────────
ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rreq:select" ON public.resource_requests;
CREATE POLICY "rreq:select"
  ON public.resource_requests FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "rreq:insert" ON public.resource_requests;
CREATE POLICY "rreq:insert"
  ON public.resource_requests FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );

DROP POLICY IF EXISTS "rreq:update" ON public.resource_requests;
CREATE POLICY "rreq:update"
  ON public.resource_requests FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );

DROP POLICY IF EXISTS "rreq:delete" ON public.resource_requests;
CREATE POLICY "rreq:delete"
  ON public.resource_requests FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── field_requests ────────────────────────────────────────────────────────────
ALTER TABLE public.field_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fr:select" ON public.field_requests;
CREATE POLICY "fr:select"
  ON public.field_requests FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));

DROP POLICY IF EXISTS "fr:insert" ON public.field_requests;
CREATE POLICY "fr:insert"
  ON public.field_requests FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );

DROP POLICY IF EXISTS "fr:update" ON public.field_requests;
CREATE POLICY "fr:update"
  ON public.field_requests FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );

DROP POLICY IF EXISTS "fr:delete" ON public.field_requests;
CREATE POLICY "fr:delete"
  ON public.field_requests FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── notifications ─────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif:select" ON public.notifications;
CREATE POLICY "notif:select"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "notif:update" ON public.notifications;
CREATE POLICY "notif:update"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

-- ── categories / subcategories / field_definitions ───────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat:select" ON public.categories;
CREATE POLICY "cat:select"
  ON public.categories FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cat:write" ON public.categories;
CREATE POLICY "cat:write"
  ON public.categories FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcat:select" ON public.subcategories;
CREATE POLICY "subcat:select"
  ON public.subcategories FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "subcat:write" ON public.subcategories;
CREATE POLICY "subcat:write"
  ON public.subcategories FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fd:select" ON public.field_definitions;
CREATE POLICY "fd:select"
  ON public.field_definitions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "fd:write" ON public.field_definitions;
CREATE POLICY "fd:write"
  ON public.field_definitions FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── custom_labour_types ───────────────────────────────────────────────────────
ALTER TABLE public.custom_labour_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clt:select" ON public.custom_labour_types;
CREATE POLICY "clt:select"
  ON public.custom_labour_types FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "clt:insert" ON public.custom_labour_types;
CREATE POLICY "clt:insert"
  ON public.custom_labour_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "clt:update" ON public.custom_labour_types;
CREATE POLICY "clt:update"
  ON public.custom_labour_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "clt:delete" ON public.custom_labour_types;
CREATE POLICY "clt:delete"
  ON public.custom_labour_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── custom_material_types ─────────────────────────────────────────────────────
ALTER TABLE public.custom_material_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmt:select" ON public.custom_material_types;
CREATE POLICY "cmt:select"
  ON public.custom_material_types FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cmt:insert" ON public.custom_material_types;
CREATE POLICY "cmt:insert"
  ON public.custom_material_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cmt:update" ON public.custom_material_types;
CREATE POLICY "cmt:update"
  ON public.custom_material_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cmt:delete" ON public.custom_material_types;
CREATE POLICY "cmt:delete"
  ON public.custom_material_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── custom_machinery_types ────────────────────────────────────────────────────
ALTER TABLE public.custom_machinery_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmac:select" ON public.custom_machinery_types;
CREATE POLICY "cmac:select"
  ON public.custom_machinery_types FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cmac:insert" ON public.custom_machinery_types;
CREATE POLICY "cmac:insert"
  ON public.custom_machinery_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cmac:update" ON public.custom_machinery_types;
CREATE POLICY "cmac:update"
  ON public.custom_machinery_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cmac:delete" ON public.custom_machinery_types;
CREATE POLICY "cmac:delete"
  ON public.custom_machinery_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── unit_master ───────────────────────────────────────────────────────────────
ALTER TABLE public.unit_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "um:select" ON public.unit_master;
CREATE POLICY "um:select"
  ON public.unit_master FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "um:write" ON public.unit_master;
CREATE POLICY "um:write"
  ON public.unit_master FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── custom_units ──────────────────────────────────────────────────────────────
ALTER TABLE public.custom_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cu:select" ON public.custom_units;
CREATE POLICY "cu:select"
  ON public.custom_units FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "cu:insert" ON public.custom_units;
CREATE POLICY "cu:insert"
  ON public.custom_units FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (
      created_by_user_id = auth.uid()
      AND (site_id IS NULL OR public.is_site_supervisor(site_id))
    )
  );

DROP POLICY IF EXISTS "cu:update" ON public.custom_units;
CREATE POLICY "cu:update"
  ON public.custom_units FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cu:delete" ON public.custom_units;
CREATE POLICY "cu:delete"
  ON public.custom_units FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── resource_transfers ────────────────────────────────────────────────────────
ALTER TABLE public.resource_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rt:select" ON public.resource_transfers;
CREATE POLICY "rt:select"
  ON public.resource_transfers FOR SELECT
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR public.is_site_supervisor(from_site_id)
    OR public.is_site_supervisor(to_site_id)
  );

DROP POLICY IF EXISTS "rt:insert" ON public.resource_transfers;
CREATE POLICY "rt:insert"
  ON public.resource_transfers FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(from_site_id) AND requested_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rt:update" ON public.resource_transfers;
CREATE POLICY "rt:update"
  ON public.resource_transfers FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(from_site_id) AND requested_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rt:delete" ON public.resource_transfers;
CREATE POLICY "rt:delete"
  ON public.resource_transfers FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── push_subscriptions ────────────────────────────────────────────────────────
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps:select" ON public.push_subscriptions;
CREATE POLICY "ps:select"
  ON public.push_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

DROP POLICY IF EXISTS "ps:insert" ON public.push_subscriptions;
CREATE POLICY "ps:insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ps:update" ON public.push_subscriptions;
CREATE POLICY "ps:update"
  ON public.push_subscriptions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ps:delete" ON public.push_subscriptions;
CREATE POLICY "ps:delete"
  ON public.push_subscriptions FOR DELETE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');


-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. Verify with:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
--   SELECT count(*) FROM unit_master;
--   SELECT c.name, count(s.*) FROM categories c LEFT JOIN subcategories s
--     ON s.category_id = c.category_id GROUP BY c.name;
--   SELECT proname FROM pg_proc WHERE proname = 'custom_access_token_hook';
-- ═══════════════════════════════════════════════════════════════════════════════
