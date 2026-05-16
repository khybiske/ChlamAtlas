-- Migration 022: Add chimera to mutation_type vocabulary
-- Chimeras are interspecies recombinants (CT/CM blocks swapped), distinct from deletions

ALTER TABLE public.mutants DROP CONSTRAINT IF EXISTS mutants_mutation_type_check;

ALTER TABLE public.mutants ADD CONSTRAINT mutants_mutation_type_check
  CHECK (mutation_type IN ('transposon', 'deletion', 'chemical', 'chimera'));
