-- Fix JWT identity helpers to use auth.uid() instead of the legacy
-- current_setting('request.jwt.claim.sub') approach, which stopped working
-- in newer Supabase/PostgREST versions.

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'guest'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Rebuild users RLS policies to use auth.uid() directly (belt-and-suspenders)
DROP POLICY IF EXISTS "users_self_read" ON public.users;
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
