-- ============================================================
-- 029_pipeline_enhancements.sql
--
-- PURPOSE: Adds pipeline stage tracking columns, WGS stage,
--          active assignments, planned-mutant flag, converts
--          priority to BOOLEAN, and creates pipeline_favorites.
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--   Do NOT run against the local schema file directly.
--
-- SAFE TO RE-RUN: All ALTER TABLEs use IF NOT EXISTS / IF EXISTS
--   guards where possible. The priority TYPE change is idempotent
--   only if the column is already BOOLEAN — run once on TEXT.
-- ============================================================

-- ── 1. mutant_pipeline: add WGS stage boolean ─────────────────────────────
-- Inserts between genotyping_complete and invitro_test_complete logically,
-- but Postgres does not support column ordering; order is cosmetic only.
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS wgs_complete BOOLEAN NOT NULL DEFAULT false;

-- ── 2. mutant_pipeline: per-stage completion metadata ─────────────────────
-- One (completed_by TEXT, completed_date DATE) pair per stage.
-- Covers all 7 stages including the new wgs stage.
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS plasmid_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS plasmid_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS transformation_completed_by   TEXT,
  ADD COLUMN IF NOT EXISTS transformation_completed_date DATE,
  ADD COLUMN IF NOT EXISTS cloning_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS cloning_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS genotyping_completed_by       TEXT,
  ADD COLUMN IF NOT EXISTS genotyping_completed_date     DATE,
  ADD COLUMN IF NOT EXISTS wgs_completed_by              TEXT,
  ADD COLUMN IF NOT EXISTS wgs_completed_date            DATE,
  ADD COLUMN IF NOT EXISTS invitro_completed_by          TEXT,
  ADD COLUMN IF NOT EXISTS invitro_completed_date        DATE,
  ADD COLUMN IF NOT EXISTS invivo_completed_by           TEXT,
  ADD COLUMN IF NOT EXISTS invivo_completed_date         DATE;

-- ── 3. mutant_pipeline: per-stage active assignments ──────────────────────
-- JSONB keyed by stage name, e.g.:
--   { "wgs": {"who": "D. Rockey", "initials": "DR", "lab": "osu"} }
-- Allows flexible per-stage assignment without a separate join table.
ALTER TABLE mutant_pipeline
  ADD COLUMN IF NOT EXISTS active_assignments JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 4. mutants: planned mutant flag ───────────────────────────────────────
-- is_planned = true means the mutant is queued/planned but not yet started.
-- Complements is_archived; both false = active.
ALTER TABLE mutants
  ADD COLUMN IF NOT EXISTS is_planned BOOLEAN NOT NULL DEFAULT false;

-- ── 5. mutants: priority TEXT → BOOLEAN ───────────────────────────────────
-- Existing values: NULL, empty string '', or a non-empty label like 'High'.
-- Any non-null, non-empty value maps to true; NULL/''/whitespace maps to false.
-- NOTE: Run this step only once. If priority is already BOOLEAN, skip.
ALTER TABLE mutants
  ALTER COLUMN priority TYPE BOOLEAN
    USING (priority IS NOT NULL AND trim(priority) != '');
ALTER TABLE mutants
  ALTER COLUMN priority SET DEFAULT false,
  ALTER COLUMN priority SET NOT NULL;

-- ── 6. pipeline_favorites table ───────────────────────────────────────────
-- Allows authenticated users to star/bookmark mutants in the pipeline view.
-- mutant_id references mutants(mutant_id) which is TEXT UNIQUE NOT NULL.
CREATE TABLE IF NOT EXISTS pipeline_favorites (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutant_id  TEXT NOT NULL REFERENCES mutants(mutant_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mutant_id)
);

-- ── 7. schema/01_tables.sql sync note ─────────────────────────────────────
-- After applying this migration, manually update schema/01_tables.sql to
-- reflect these new columns and the pipeline_favorites table definition
-- so the canonical schema stays accurate.
