-- Custom Access Token hook for Supabase Auth.
-- Injects `user_role` claim into every JWT at mint time so server-side code
-- can trust the JWT and skip a per-request DB/Redis lookup for the role.
--
-- After running this migration:
--   1. Supabase Dashboard -> Auth -> Hooks -> Custom Access Token
--   2. Select function: public.custom_access_token_hook
--   3. Enable and save.
--   4. Sign users out so they re-mint tokens. (Existing sessions keep old claims
--      until refresh; respect the JWT TTL as the revocation lag.)

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_role text;
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
    SELECT role::text INTO resolved_role
    FROM public.user_profiles
    WHERE user_id = user_uuid;
  END IF;

  IF resolved_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(resolved_role), true);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
--> statement-breakpoint

-- The hook reads user_profiles; grant the auth admin role read access on the role column.
GRANT SELECT (user_id, role) ON public.user_profiles TO supabase_auth_admin;
