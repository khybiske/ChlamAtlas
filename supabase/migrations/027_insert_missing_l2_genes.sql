-- Migration 027: Insert 3 missing CT-L2 protein-coding genes
--
-- CTL0414, CTL0420, and CTL0856 are present in NCBI NC_010287.1 but were
-- absent from the original UniProt proteome export used to seed the DB.
-- All 3 are intact CDSs (not pseudogenes). Annotations from NCBI NC_010287.1.
--
-- The sort_index shift uses a large-offset technique to avoid temporary
-- unique-constraint violations during the multi-row UPDATE.
--
-- After this migration:
--   pL2 plasmid genes shift from sort_index 871–878 → 873–880
--   (pL2 genes fall above CTL0856 insertion point so pick up both +1 shifts)
--   CTL0897 (last chromosome gene) shifts 870 → 872
--   Code using the plasmid boundary must use >= 873 (was >= 871)

BEGIN;

-- Step 1: Move all CT-L2 genes with sort_index >= 402 to a collision-safe zone
UPDATE genes
SET    sort_index = sort_index + 10000
WHERE  strain_id  = 'cc33aea0-630d-42f0-a4f6-796996553711'
  AND  sort_index >= 402;

-- Step 2: Shift back to final positions
--   sort_index >= original 832 (now 10832+): gets +2 total (space for CTL0856 at 833)
--   sort_index 402–831 (now 10402–10831):    gets +1 total (space for CTL0414 at 402)
--   CTL0420 uses the natural gap at 405 (CTL0419 shifts 403→404, frees 405)
--   pL2 genes shift 871–878 → 872–879 (boundary constant updated in app code)
UPDATE genes
SET    sort_index = CASE
         WHEN sort_index >= 10832 THEN sort_index - 9998   -- original + 2
         ELSE                          sort_index - 9999   -- original + 1
       END
WHERE  strain_id  = 'cc33aea0-630d-42f0-a4f6-796996553711'
  AND  sort_index >= 10402;

-- Step 3: Insert the 3 missing genes
INSERT INTO genes (
  strain_id, locus_tag, sort_index,
  product, functional_category,
  start_bp, end_bp, strand,
  is_characterized
) VALUES
  -- CTL0414: phospholipase D-like (sits between CTL0413=401 and CTL0417=403 after shift)
  ('cc33aea0-630d-42f0-a4f6-796996553711', 'CTL0414', 402,
   'phospholipase D-like domain-containing protein', 'Lipid metabolism',
   505082, 506056, '-', false),

  -- CTL0420: hypothetical (sits between CTL0419=404 and CTL0422=406 after shift)
  ('cc33aea0-630d-42f0-a4f6-796996553711', 'CTL0420', 405,
   'hypothetical protein', 'Unknown',
   510817, 510984, '+', false),

  -- CTL0856: succinate dehydrogenase (sits between CTL0855=832 and CTL0858=834 after shift)
  ('cc33aea0-630d-42f0-a4f6-796996553711', 'CTL0856', 833,
   'succinate dehydrogenase/fumarate reductase transmembrane subunit', 'Energy metabolism',
   991328, 991897, '-', false);

-- Verification (review before committing)
SELECT locus_tag, sort_index
FROM   genes
WHERE  strain_id  = 'cc33aea0-630d-42f0-a4f6-796996553711'
  AND  locus_tag IN (
    'CTL0413','CTL0414','CTL0417','CTL0419','CTL0420','CTL0422',
    'CTL0855','CTL0856','CTL0858',
    'pL2-01','pL2-08'
  )
ORDER  BY sort_index;

COMMIT;
