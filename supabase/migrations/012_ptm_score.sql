-- supabase/migrations/012_ptm_score.sql
-- Add pTM score column for AlphaFold v3 rows in alphafold_results.
-- Kept separate from homology_score (mean pLDDT, 0-100) because pTM uses a 0-1 scale.
ALTER TABLE alphafold_results ADD COLUMN IF NOT EXISTS ptm_score float;
