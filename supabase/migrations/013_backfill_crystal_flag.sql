-- Backfill has_crystal_structure from existing alphafold_results data
-- The 009 migration added the column but only backfilled has_af3_structure.
UPDATE public.proteins p
SET has_crystal_structure = true
WHERE EXISTS (
  SELECT 1 FROM public.alphafold_results ar
  WHERE ar.protein_id = p.id
    AND ar.af_version = 'crystal'
);
