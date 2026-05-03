-- Adds qualitative expression pattern label for CT-L2 microarray data.
-- eb_expression is typed numeric and cannot store text pattern strings.
ALTER TABLE public.expression_data
  ADD COLUMN IF NOT EXISTS pattern_label text;
