-- Add DNA (CDS nucleotide) and amino acid sequence columns.
-- Populated via data/fetch_sequences.js using NCBI eutils fasta_cds_na / fasta_cds_aa.
ALTER TABLE public.genes    ADD COLUMN IF NOT EXISTS dna_sequence TEXT;
ALTER TABLE public.proteins ADD COLUMN IF NOT EXISTS aa_sequence  TEXT;
