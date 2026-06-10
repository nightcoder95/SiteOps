-- ─────────────────────────────────────────────────────────────────────────
-- First-admin bootstrap (run ONCE).
--
-- SiteOps is closed / invite-only — there is no self-signup, so the very first
-- admin must be created directly in the database. Every account after this one
-- is provisioned through the admin UI (POST /api/admin/users).
--
-- HOW TO RUN
--   1. Connect with the DIRECT (non-pooled) connection — your DIRECT_URL — using
--      psql or the Supabase SQL editor. The service role / db owner is required.
--   2. Replace the :email and :password placeholders below (or pass them as psql
--      variables: psql "$DIRECT_URL" -v email="'you@co.com'" -v password="'…'"
--      -f lib/db/seeds/first-admin.sql ).
--   3. Run the whole file inside one transaction (it already is).
--
-- Requires the pgcrypto extension (Supabase ships it). The email is marked
-- pre-confirmed so the admin can sign in immediately. must_change_password is
-- left false for the bootstrap admin — change it to true if you want the first
-- admin forced through the change-password flow too.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

WITH new_user AS (
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    :email,
    crypt(:password, gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  RETURNING id
)
INSERT INTO public.user_profiles (user_id, role, must_change_password)
SELECT id, 'Admin', false FROM new_user;

COMMIT;
