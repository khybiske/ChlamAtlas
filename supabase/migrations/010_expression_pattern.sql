-- Add expression_pattern to genes for filter support
-- Values: 'Early' | 'Mid' | 'Late' | 'Constitutive' | NULL
-- Populated by scripts/compute_expression_pattern.js
ALTER TABLE genes ADD COLUMN IF NOT EXISTS expression_pattern TEXT;

COMMENT ON COLUMN genes.expression_pattern IS
  'Developmental expression bucket: Early | Mid | Late | Constitutive. '
  'CT-L2: derived from microarray pattern_label (Nicholson 2003, PMID 12730178). '
  'CT-D: algorithmically classified from Belland 2003 (PMID 12815105) microarray values '
  '(Criteria D: onset/peak/tail thresholds on T0–T5 timepoints).';
