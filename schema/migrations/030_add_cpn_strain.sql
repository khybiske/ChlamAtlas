-- 030_add_cpn_strain.sql
-- Adds Chlamydia pneumoniae TW-183 as a new strain.
-- Color chosen to be distinct from the existing green (L2) / blue (CM) / pink (CT-D) trio,
-- matched to the approved Cpn icon (design/icons_transparent/Cpnicon_transparent.png).
-- emoji_icon is unused by the frontend (no code path renders it) — left null.
-- See docs/superpowers/specs/2026-07-02-cpn-addition-phase1-design.md for strain selection rationale.

INSERT INTO public.strains (species, strain_name, common_name, ncbi_taxid, emoji_icon, color_hex, is_active)
VALUES ('Chlamydia pneumoniae', 'TW-183', 'Cpn', '182082', NULL, '#AE5CE8', true)
ON CONFLICT (species, strain_name) DO NOTHING;
