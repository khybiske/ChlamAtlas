-- Migration 026: Add chimera recombination span columns to mutants
-- recombination_start / recombination_end are locus tags (text) in the backbone strain genome.
-- ortholog_span_cm is an informational text range like "TC0238-TC0272" from the source CSV.
ALTER TABLE public.mutants
  ADD COLUMN IF NOT EXISTS recombination_start  text,
  ADD COLUMN IF NOT EXISTS recombination_end    text,
  ADD COLUMN IF NOT EXISTS ortholog_span_cm     text;
