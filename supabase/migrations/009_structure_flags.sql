-- Add structure availability flags to proteins for gene list filtering
ALTER TABLE public.proteins
  ADD COLUMN IF NOT EXISTS has_af3_structure      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_crystal_structure  boolean NOT NULL DEFAULT false;

-- Backfill has_af3_structure from existing alphafold_results data
UPDATE public.proteins p
SET has_af3_structure = true
WHERE EXISTS (
  SELECT 1 FROM public.alphafold_results ar
  WHERE ar.protein_id = p.id
    AND ar.af_version IN ('v3', 'AF3', 'AFv3')
);

COMMENT ON COLUMN public.proteins.has_af3_structure IS
  'True when an AlphaFold3 prediction exists in alphafold_results for this protein';

COMMENT ON COLUMN public.proteins.has_crystal_structure IS
  'True when an experimentally resolved crystal/cryo-EM structure is available; populated manually or via PDB import';
