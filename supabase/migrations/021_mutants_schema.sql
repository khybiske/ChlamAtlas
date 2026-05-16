-- Migration 021: Update mutation_type vocabulary, add mutation_method
-- Rename recombination→deletion, remove intron type, add mutation_method subtype column

-- Drop existing CHECK constraint
ALTER TABLE public.mutants DROP CONSTRAINT IF EXISTS mutants_mutation_type_check;

-- Backfill: recombination and intron both become deletion
UPDATE public.mutants SET mutation_type = 'deletion' WHERE mutation_type IN ('recombination', 'intron');

-- Add updated CHECK constraint (transposon | deletion | chemical)
ALTER TABLE public.mutants ADD CONSTRAINT mutants_mutation_type_check
  CHECK (mutation_type IN ('transposon', 'deletion', 'chemical'));

-- Add mutation_method for deletion subtypes (lambda_red, targetron, crispr)
ALTER TABLE public.mutants ADD COLUMN IF NOT EXISTS mutation_method text;
