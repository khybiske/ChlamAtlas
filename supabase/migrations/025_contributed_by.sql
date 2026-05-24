-- Migration 025: Add contributed_by for mutant edit ownership
-- contributed_by = the system user who has edit rights over this mutant.
-- Auto-set on INSERT (trigger); can be set explicitly by admin for batch imports.

ALTER TABLE public.mutants
  ADD COLUMN IF NOT EXISTS contributed_by uuid REFERENCES public.users(id);

-- Auto-fill contributed_by with auth.uid() when not explicitly provided
CREATE OR REPLACE FUNCTION public.mutants_set_contributed_by()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.contributed_by IS NULL THEN
    NEW.contributed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mutants_auto_contributed_by ON public.mutants;
CREATE TRIGGER mutants_auto_contributed_by
  BEFORE INSERT ON public.mutants
  FOR EACH ROW EXECUTE FUNCTION public.mutants_set_contributed_by();

-- Expand community UPDATE rights to include contributed_by
DROP POLICY IF EXISTS "mutants_community_update_own" ON public.mutants;
CREATE POLICY "mutants_community_update_own" ON public.mutants
  FOR UPDATE
  USING  (creator = auth.uid() OR contributed_by = auth.uid())
  WITH CHECK (
    (creator = auth.uid() OR contributed_by = auth.uid())
    AND is_published = false
  );
