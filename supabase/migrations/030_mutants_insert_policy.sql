-- Migration 030: allow any authenticated user to create a mutant record.
--
-- Until now only admins could INSERT into public.mutants ("mutants: admin full
-- write" FOR ALL). The site now has a "New mutant" form open to every signed-in
-- user (public/community/lab_member/admin). New records are unpublished unless
-- the creator is lab_member/admin and opts in on the form.
--
-- contributed_by is auto-populated with auth.uid() by the
-- mutants_set_contributed_by BEFORE INSERT trigger (migration 025). RLS WITH
-- CHECK runs after BEFORE triggers, so pinning `contributed_by = auth.uid()`
-- both passes for honest inserts and blocks a client trying to create a record
-- owned by someone else. It also blocks anon (auth.uid() IS NULL).
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- (Remote migration history is not in sync with supabase/migrations, so do not
--  use `supabase db push` here.)
-- SAFE TO RE-RUN: yes (DROP POLICY IF EXISTS guard).

DROP POLICY IF EXISTS "mutants_authenticated_insert" ON public.mutants;
CREATE POLICY "mutants_authenticated_insert" ON public.mutants
  FOR INSERT
  WITH CHECK (
    -- own the record you create (admin may assign it to another user)
    (contributed_by = auth.uid() OR public.current_user_role() = 'admin')
    -- lands unpublished unless you're lab_member/admin
    AND (
      is_published = false
      OR public.current_user_role() IN ('lab_member', 'admin')
    )
  );

-- mutant_pipeline already restricts INSERT to lab_member/admin
-- ("pipeline: lab member write"), which is what we want: the create form only
-- adds a pipeline row when the creator is lab_member/admin.
