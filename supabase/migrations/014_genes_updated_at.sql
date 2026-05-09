-- Add updated_at / updated_by to genes table.
-- updated_by is plain text for now (display name like "Kevin Hybiske").
-- Self-contained: creates the trigger function if it doesn't already exist.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.genes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;

DROP TRIGGER IF EXISTS genes_set_updated_at ON public.genes;

CREATE TRIGGER genes_set_updated_at
  BEFORE UPDATE ON public.genes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
