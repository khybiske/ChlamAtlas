-- Migration 031: add mutant_pipeline.stock_locations (free-text, comma-separated).
--
-- The app's "Stocks" section and the mutant create/edit form's "Stock
-- location" field both already read/write this column, but it was never
-- actually created — schema/01_tables.sql documents it, but that file was
-- never applied to this database. Every save of a stock location has been
-- silently failing (edit) or logging a swallowed warning (create) until this
-- runs.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- (Remote migration history is not in sync with supabase/migrations, so do not
--  use `supabase db push` here.)
-- SAFE TO RE-RUN: yes (IF NOT EXISTS guard).

ALTER TABLE public.mutant_pipeline
  ADD COLUMN IF NOT EXISTS stock_locations TEXT;
