-- Revise the custom access token hook to also inject `must_change_password`
-- as a top-level JWT claim, alongside the existing `user_role` claim. Middleware
-- can then force a password change with an O(1) claim decode — no DB call on the
-- request path.
--
-- After running this migration:
--   1. No dashboard change is needed if the hook is already enabled — CREATE OR
--      REPLACE keeps the same function the hook points at.
--   2. Sign users out (or wait for token refresh) so tokens re-mint with the
--      new claim.

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

  -- The hook receives `user_id` as text; cast safely.
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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
--> statement-breakpoint

-- Widen the grant so the hook can read the new column (previous grant was only
-- (user_id, role)). Re-granting the existing columns is idempotent.
GRANT SELECT (user_id, role, must_change_password) ON public.user_profiles TO supabase_auth_admin;
