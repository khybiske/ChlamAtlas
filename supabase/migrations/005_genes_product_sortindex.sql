-- Adds product description and genomic sort order to genes table.
-- Run in Supabase SQL editor before re-running the import script.

ALTER TABLE public.genes
  ADD COLUMN IF NOT EXISTS product    text,
  ADD COLUMN IF NOT EXISTS sort_index integer;

CREATE INDEX IF NOT EXISTS genes_sort_idx ON public.genes(strain_id, sort_index);
