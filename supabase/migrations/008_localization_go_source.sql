-- Add GO cellular component terms and source tracking to proteins
ALTER TABLE public.proteins
  ADD COLUMN IF NOT EXISTS subcellular_location_go  text[],
  ADD COLUMN IF NOT EXISTS localization_source      text;   -- 'lab_flag' | 'uniprot_sl' | 'uniprot_go' | 'user' | null

COMMENT ON COLUMN public.proteins.subcellular_location_go IS
  'GO cellular component term IDs (e.g. GO:0005829) from UniProt cross-references, used as SwissBioPics fallback when no SL terms exist';

COMMENT ON COLUMN public.proteins.localization_source IS
  'Tier that provided the active localization: lab_flag (Inc/T3SS override), uniprot_sl (curated UniProt SL annotation), uniprot_go (GO cellular component fallback), user (manual curation)';
