-- 031_fix_ctd_color.sql
-- Standardizes CT-D's color_hex to match its icon (pink/magenta), replacing a
-- value that was inconsistent with every hardcoded frontend color for CT-D.
-- Frontend files (genomes.js, home.js, app.js, alignment.js, structure-alignment.js)
-- hardcode their own color maps and were updated separately in this same phase;
-- this migration is specifically for web/js/views/genome-alignment.js, which reads
-- color_hex from this table directly instead of hardcoding a map.
-- See docs/superpowers/specs/2026-07-02-cpn-addition-phase4-design.md.

UPDATE public.strains SET color_hex = '#E75999' WHERE common_name = 'CT-D';
