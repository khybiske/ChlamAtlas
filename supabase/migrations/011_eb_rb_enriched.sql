-- supabase/migrations/011_eb_rb_enriched.sql
ALTER TABLE genes ADD COLUMN IF NOT EXISTS eb_enriched boolean;
ALTER TABLE genes ADD COLUMN IF NOT EXISTS rb_enriched boolean;
