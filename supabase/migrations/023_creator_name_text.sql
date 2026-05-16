-- Migration 023: Add creator_name as plain text field
-- Creator is often a historical collaborator who will never have an auth account.
-- Keep creator UUID FK for future use but add creator_name for display.

ALTER TABLE public.mutants ADD COLUMN IF NOT EXISTS creator_name text;
