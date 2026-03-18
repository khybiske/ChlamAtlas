-- ChlamAtlas — Seed data
-- Run in Supabase SQL editor AFTER 001_schema.sql and 002_rls.sql
-- Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING)

-- ─── STRAINS ──────────────────────────────────────────────────────────────────
INSERT INTO public.strains (species, strain_name, common_name, ncbi_taxid, color_hex, is_active)
VALUES
  ('Chlamydia trachomatis', 'L2/434', 'CT-L2', '471472', '#7c3aed', true),
  ('Chlamydia trachomatis', 'D/UW-3', 'CT-D',  '272561', '#1d4ed8', true),
  ('Chlamydia muridarum',   'Nigg',   'CM',    '243161', '#c2410c', true)
ON CONFLICT (species, strain_name) DO NOTHING;

-- ─── SITE CONFIG DEFAULT ──────────────────────────────────────────────────────
INSERT INTO public.site_config (key, title, body, link_url, link_label)
VALUES (
  'featured_spotlight',
  'Welcome to ChlamAtlas',
  'ChlamAtlas integrates genomic, structural, and mutant data for Chlamydia research. Start by exploring a strain or browsing mutants.',
  '#genomes',
  'Browse genomes'
)
ON CONFLICT (key) DO NOTHING;
