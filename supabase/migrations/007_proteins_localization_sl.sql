-- Adds curated subcellular location SL term IDs and a curation protection flag.
ALTER TABLE public.proteins
  ADD COLUMN IF NOT EXISTS subcellular_location_sl text[],
  ADD COLUMN IF NOT EXISTS localization_curated     boolean NOT NULL DEFAULT false;
