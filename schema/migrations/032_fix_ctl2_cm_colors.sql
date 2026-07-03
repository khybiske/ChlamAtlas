-- 032_fix_ctl2_cm_colors.sql
-- Completes the color-unification work started in Phase 4 (031_fix_ctd_color.sql).
-- CT-L2 and CM's color_hex values were stale placeholders that never matched
-- their actual app-wide colors (green/blue respectively). This was deferred in
-- Phase 4 as a separate, pre-existing issue — now fixed because it's directly
-- visible in the gene-detail ortholog panel's accent strips, which (like
-- genome-alignment.js) read color_hex from this table directly rather than a
-- hardcoded frontend map.
-- Values match the canonical STRAIN_ACCENT map in web/js/views/genomes.js.
-- See docs/superpowers/specs/2026-07-03-cpn-phase5-fixes-design.md.

UPDATE public.strains SET color_hex = '#2f9e6e' WHERE common_name = 'CT-L2';
UPDATE public.strains SET color_hex = '#3f7fc4' WHERE common_name = 'CM';
