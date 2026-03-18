-- ChlamAtlas — Row-Level Security policies
-- Run in Supabase SQL editor AFTER 001_schema.sql
-- Run BEFORE 003_seed.sql

-- ─── ROLE HELPERS ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()::uuid),
    'guest'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_lab_member_or_above()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.get_user_role() IN ('lab_member', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.get_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT auth.uid()::uuid IS NOT NULL;
$$;

-- ─── STRAINS: public read ─────────────────────────────────────────────────────
ALTER TABLE public.strains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strains_public_read" ON public.strains
  FOR SELECT USING (true);

-- ─── GENES: public read ───────────────────────────────────────────────────────
ALTER TABLE public.genes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "genes_public_read" ON public.genes
  FOR SELECT USING (true);

-- ─── PROTEINS: public read ────────────────────────────────────────────────────
ALTER TABLE public.proteins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proteins_public_read" ON public.proteins
  FOR SELECT USING (true);

-- ─── ORTHOLOGS: public read ───────────────────────────────────────────────────
ALTER TABLE public.orthologs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orthologs_public_read" ON public.orthologs
  FOR SELECT USING (true);

-- ─── EXPRESSION DATA: public read ────────────────────────────────────────────
ALTER TABLE public.expression_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expression_public_read" ON public.expression_data
  FOR SELECT USING (true);

-- ─── ALPHAFOLD RESULTS: public read ──────────────────────────────────────────
ALTER TABLE public.alphafold_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "af_results_public_read" ON public.alphafold_results
  FOR SELECT USING (true);

-- ─── PUBLICATIONS: public read ────────────────────────────────────────────────
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publications_public_read" ON public.publications
  FOR SELECT USING (true);

-- ─── ANNOTATIONS: public read, authenticated write ───────────────────────────
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "annotations_public_read" ON public.annotations
  FOR SELECT USING (true);
CREATE POLICY "annotations_community_insert" ON public.annotations
  FOR INSERT WITH CHECK (public.is_authenticated() AND curator_id = auth.uid()::uuid);
-- Only admin can update/delete annotations (revert workflow)
CREATE POLICY "annotations_admin_write" ON public.annotations
  FOR ALL USING (public.is_admin());

-- ─── ANNOTATION HISTORY: lab_member+ read; inserts via trigger only ──────────
ALTER TABLE public.annotation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "annot_history_lab_read" ON public.annotation_history
  FOR SELECT USING (public.is_lab_member_or_above());
-- No direct INSERT policy — inserts happen via SECURITY DEFINER trigger only

-- ─── MUTANTS ──────────────────────────────────────────────────────────────────
-- is_published = false rows are invisible to guest and community users.
ALTER TABLE public.mutants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mutants_public_read" ON public.mutants
  FOR SELECT USING (
    is_published = true
    OR public.is_lab_member_or_above()
  );

CREATE POLICY "mutants_community_insert" ON public.mutants
  FOR INSERT WITH CHECK (
    public.is_authenticated()
    AND creator = auth.uid()::uuid
    AND is_published = false    -- community users cannot self-publish
  );

-- Community users can update their own mutants, but cannot toggle is_published
CREATE POLICY "mutants_community_update_own" ON public.mutants
  FOR UPDATE
  USING (creator = auth.uid()::uuid)
  WITH CHECK (
    creator = auth.uid()::uuid
    AND is_published = false
  );

CREATE POLICY "mutants_lab_member_update_all" ON public.mutants
  FOR UPDATE USING (public.is_lab_member_or_above());

CREATE POLICY "mutants_admin_delete" ON public.mutants
  FOR DELETE USING (public.is_admin());

-- ─── MUTANT PIPELINE: lab_member+ only ───────────────────────────────────────
ALTER TABLE public.mutant_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_lab_read" ON public.mutant_pipeline
  FOR SELECT USING (public.is_lab_member_or_above());

CREATE POLICY "pipeline_lab_write" ON public.mutant_pipeline
  FOR ALL USING (public.is_lab_member_or_above());

-- ─── MUTANT PHENOTYPES: follows mutant's is_published status ─────────────────
ALTER TABLE public.mutant_phenotypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phenotypes_read" ON public.mutant_phenotypes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mutants m
      WHERE m.id = mutant_id
      AND (m.is_published = true OR public.is_lab_member_or_above())
    )
  );

CREATE POLICY "phenotypes_lab_write" ON public.mutant_phenotypes
  FOR ALL USING (public.is_lab_member_or_above());

-- ─── USERS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row; admins can read all
CREATE POLICY "users_self_read" ON public.users
  FOR SELECT USING (
    id = auth.uid()::uuid OR public.is_admin()
  );

-- Users can update their own profile columns (display_name, lab_affiliation, role_request)
-- They cannot update 'role' because of the REVOKE below
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid()::uuid)
  WITH CHECK (id = auth.uid()::uuid);

CREATE POLICY "users_admin_all" ON public.users
  FOR ALL USING (public.is_admin());

-- Prevent any non-superuser from directly updating the role column.
-- Role changes must go through set_user_role() SECURITY DEFINER function.
REVOKE UPDATE (role) ON public.users FROM authenticated, anon;

-- Prevent lab_member from toggling is_published — only admin can publish/unpublish
-- Publication changes go through set_mutant_published() SECURITY DEFINER function
REVOKE UPDATE (is_published) ON public.mutants FROM authenticated, anon;

-- Admin-only function to change a user's role (bypasses the REVOKE above)
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user roles';
  END IF;
  IF new_role NOT IN ('guest','community','lab_member','admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;

-- Admin-only function to toggle a mutant's is_published status
CREATE OR REPLACE FUNCTION public.set_mutant_published(target_mutant_id uuid, published boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can publish or unpublish mutants';
  END IF;
  UPDATE public.mutants SET is_published = published WHERE id = target_mutant_id;
END;
$$;

-- ─── FAVORITES: own rows only ─────────────────────────────────────────────────
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_own" ON public.favorites
  FOR ALL USING (user_id = auth.uid()::uuid)
  WITH CHECK (user_id = auth.uid()::uuid);

-- ─── LAB MEMBER REQUESTS ──────────────────────────────────────────────────────
ALTER TABLE public.lab_member_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_own_read" ON public.lab_member_requests
  FOR SELECT USING (user_id = auth.uid()::uuid OR public.is_admin());

CREATE POLICY "requests_own_insert" ON public.lab_member_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()::uuid
    AND public.is_authenticated()
  );

CREATE POLICY "requests_admin_update" ON public.lab_member_requests
  FOR UPDATE USING (public.is_admin());

-- ─── SITE CONFIG / UPDATES: public read, admin write ────────────────────────
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_config_public_read" ON public.site_config
  FOR SELECT USING (true);
CREATE POLICY "site_config_admin_write" ON public.site_config
  FOR ALL USING (public.is_admin());

ALTER TABLE public.site_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_updates_public_read" ON public.site_updates
  FOR SELECT USING (true);
CREATE POLICY "site_updates_admin_write" ON public.site_updates
  FOR ALL USING (public.is_admin());

-- ─── ANNOTATION HISTORY TRIGGER ───────────────────────────────────────────────
-- Logs annotation.value changes to annotation_history automatically.
-- auth.uid() calls current_setting('request.jwt.claim.sub') which IS populated by
-- PostgREST in transaction context, so works for client requests. Returns NULL in
-- SQL editor (superuser context) — history rows from test/admin SQL runs will have
-- edited_by = NULL, which is acceptable.
CREATE OR REPLACE FUNCTION public.log_annotation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_id uuid;
BEGIN
  caller_id := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO public.annotation_history
      (annotation_id, field_name, old_value, new_value, edited_by, edited_at)
    VALUES
      (NEW.id, 'value', OLD.value, NEW.value, caller_id, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annotations_history_trigger ON public.annotations;
CREATE TRIGGER annotations_history_trigger
  AFTER UPDATE ON public.annotations
  FOR EACH ROW EXECUTE FUNCTION public.log_annotation_change();
