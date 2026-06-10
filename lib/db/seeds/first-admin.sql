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
-- seeded TRUE so the bootstrap password (typed into psql/shell history) must be
-- rotated on first login (S4).
--
-- IMPORTANT: Uses bcrypt cost 10 (gen_salt('bf', 10)) and includes an
-- auth.identities row — both required by modern Supabase GoTrue.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

WITH new_user AS (
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    aud, role, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    :email,
    crypt(:password, gen_salt('bf', 10)),
    now(),
    'authenticated',
    'authenticated',
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '',
    now(),
    now()
  )
  RETURNING id, email
),
-- Modern Supabase requires an auth.identities row for email/password login.
new_identity AS (
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    id, id, id::text, 'email',
    jsonb_build_object(
      'sub', id::text,
      'email', email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(), now(), now()
  FROM new_user
  RETURNING user_id
)
INSERT INTO public.user_profiles (user_id, role, must_change_password)
SELECT user_id, 'Admin', true FROM new_identity;

COMMIT;
