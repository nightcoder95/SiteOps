-- Row Level Security for all public tables.
--
-- Identity: auth.uid()                 = user_profiles.user_id
-- Role:     auth.jwt() ->> 'user_role' = 'Admin' | 'Supervisor'
--           (injected at JWT mint time by custom_access_token_hook)
--
-- Admin      — full access to all data
-- Supervisor — scoped to sites they supervise and their own records
--
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
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.is_site_supervisor(uuid) FROM public, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_site_supervisor(uuid) TO authenticated;

-- ── user_profiles ─────────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "up:select"
  ON public.user_profiles FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "up:insert"
  ON public.user_profiles FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "up:update"
  ON public.user_profiles FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "up:delete"
  ON public.user_profiles FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── audit_logs ───────────────────────────────────────────────────────────────
-- INSERTs go through service-role (bypasses RLS); authenticated clients read only.
--> statement-breakpoint
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "al:select"
  ON public.audit_logs FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── sites ─────────────────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sites:select"
  ON public.sites FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "sites:insert"
  ON public.sites FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "sites:update"
  ON public.sites FOR UPDATE
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid())
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin' OR supervisor_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "sites:delete"
  ON public.sites FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── labour_entries ────────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.labour_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "le:select"
  ON public.labour_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "le:insert"
  ON public.labour_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "le:update"
  ON public.labour_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "le:delete"
  ON public.labour_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── material_entries ──────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.material_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "mte:select"
  ON public.material_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "mte:insert"
  ON public.material_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "mte:update"
  ON public.material_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "mte:delete"
  ON public.material_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── machinery_entries ─────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.machinery_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "mae:select"
  ON public.machinery_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "mae:insert"
  ON public.machinery_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "mae:update"
  ON public.machinery_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "mae:delete"
  ON public.machinery_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── expense_entries ───────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ee:select"
  ON public.expense_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "ee:insert"
  ON public.expense_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ee:update"
  ON public.expense_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ee:delete"
  ON public.expense_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── generic_entries ───────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.generic_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ge:select"
  ON public.generic_entries FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "ge:insert"
  ON public.generic_entries FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ge:update"
  ON public.generic_entries FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ge:delete"
  ON public.generic_entries FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND created_by = auth.uid())
  );

-- ── incident_reports ──────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ir:select"
  ON public.incident_reports FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "ir:insert"
  ON public.incident_reports FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ir:update"
  ON public.incident_reports FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "ir:delete"
  ON public.incident_reports FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND reported_by = auth.uid())
  );

-- ── resource_requests ─────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.resource_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rreq:select"
  ON public.resource_requests FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "rreq:insert"
  ON public.resource_requests FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );
--> statement-breakpoint
-- Admin can approve/decline any; Supervisor can edit their own pending requests.
CREATE POLICY "rreq:update"
  ON public.resource_requests FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "rreq:delete"
  ON public.resource_requests FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── field_requests ────────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.field_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "fr:select"
  ON public.field_requests FOR SELECT
  USING ((auth.jwt() ->> 'user_role') = 'Admin' OR public.is_site_supervisor(site_id));
--> statement-breakpoint
CREATE POLICY "fr:insert"
  ON public.field_requests FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "fr:update"
  ON public.field_requests FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(site_id) AND requested_by = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "fr:delete"
  ON public.field_requests FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── notifications ─────────────────────────────────────────────────────────────
-- INSERT handled by service-role server actions (bypasses RLS).
--> statement-breakpoint
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notif:select"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint
CREATE POLICY "notif:update"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK (user_id = auth.uid() OR (auth.jwt() ->> 'user_role') = 'Admin');

-- ── categories / subcategories / field_definitions ───────────────────────────
-- All authenticated users read; Admins write.
-- FOR ALL + separate FOR SELECT: SELECT policies OR'd, so non-admins still read.
--> statement-breakpoint
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cat:select"
  ON public.categories FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "cat:write"
  ON public.categories FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subcat:select"
  ON public.subcategories FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "subcat:write"
  ON public.subcategories FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "fd:select"
  ON public.field_definitions FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "fd:write"
  ON public.field_definitions FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── custom type lookup tables ─────────────────────────────────────────────────
-- Shared across all users; creator or Admin can update/delete their own types.
--> statement-breakpoint
ALTER TABLE public.custom_labour_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "clt:select"
  ON public.custom_labour_types FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "clt:insert"
  ON public.custom_labour_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "clt:update"
  ON public.custom_labour_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "clt:delete"
  ON public.custom_labour_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint

ALTER TABLE public.custom_material_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cmt:select"
  ON public.custom_material_types FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "cmt:insert"
  ON public.custom_material_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "cmt:update"
  ON public.custom_material_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "cmt:delete"
  ON public.custom_material_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint

ALTER TABLE public.custom_machinery_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cmac:select"
  ON public.custom_machinery_types FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "cmac:insert"
  ON public.custom_machinery_types FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "cmac:update"
  ON public.custom_machinery_types FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "cmac:delete"
  ON public.custom_machinery_types FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── unit_master (system table, read-only for all authenticated) ──────────────
--> statement-breakpoint
ALTER TABLE public.unit_master ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "um:select"
  ON public.unit_master FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "um:write"
  ON public.unit_master FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');

-- ── custom_units ──────────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.custom_units ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cu:select"
  ON public.custom_units FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
CREATE POLICY "cu:insert"
  ON public.custom_units FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (
      created_by_user_id = auth.uid()
      AND (site_id IS NULL OR public.is_site_supervisor(site_id))
    )
  );
--> statement-breakpoint
CREATE POLICY "cu:update"
  ON public.custom_units FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );
--> statement-breakpoint
CREATE POLICY "cu:delete"
  ON public.custom_units FOR DELETE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin' OR created_by_user_id = auth.uid()
  );

-- ── resource_transfers ────────────────────────────────────────────────────────
--> statement-breakpoint
ALTER TABLE public.resource_transfers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "rt:select"
  ON public.resource_transfers FOR SELECT
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR public.is_site_supervisor(from_site_id)
    OR public.is_site_supervisor(to_site_id)
  );
--> statement-breakpoint
-- Only the sending site's supervisor can initiate a transfer.
CREATE POLICY "rt:insert"
  ON public.resource_transfers FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(from_site_id) AND requested_by_user_id = auth.uid())
  );
--> statement-breakpoint
-- Admin approves/declines; sending supervisor can retract their own pending transfer.
CREATE POLICY "rt:update"
  ON public.resource_transfers FOR UPDATE
  USING (
    (auth.jwt() ->> 'user_role') = 'Admin'
    OR (public.is_site_supervisor(from_site_id) AND requested_by_user_id = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "rt:delete"
  ON public.resource_transfers FOR DELETE
  USING ((auth.jwt() ->> 'user_role') = 'Admin');
