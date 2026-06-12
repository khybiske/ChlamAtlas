-- PPI literature seed — well-validated interactions from independent studies
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/ihobumwetoidqioifknt/sql/new
--
-- Verified locus tags (CT-D strain) as of 2026-06-12:
--   TarP  = CT456  (confirmed: gene_symbol tarP)
--   HtrA  = CT823  (confirmed: gene_symbol htrA)
--   FliA  = CT061  (CORRECTED from CT080; CT080 is ltuB, not fliA)
--   RpoB  = CT315  (CORRECTED from CT429; CT429 has no gene assignment)
--   LpxD  = CT243  (CORRECTED from CT615; CT615 is sigA, not lpxD)
--   IncA  = CT119  (confirmed: gene_symbol incA)
--   IncE  = CT116  (CORRECTED from CT224; CT224 has no gene assignment)
--
-- After running, verify with:
--   select method, count(*) from protein_interactions group by method order by method;
-- Expected: ap_ms 354, literature ~8, string 3534

do $$
declare
  tarp_d   uuid := (select id from genes where locus_tag = 'CT456' limit 1);
  htra_d   uuid := (select id from genes where locus_tag = 'CT823' limit 1);
  flia_d   uuid := (select id from genes where locus_tag = 'CT061' limit 1);
  rpob_d   uuid := (select id from genes where locus_tag = 'CT315' limit 1);
  lpxd_d   uuid := (select id from genes where locus_tag = 'CT243' limit 1);
  inca_d   uuid := (select id from genes where locus_tag = 'CT119' limit 1);
  ince_d   uuid := (select id from genes where locus_tag = 'CT116' limit 1);
begin

  -- TarP self-interaction (oligomerization)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (tarp_d, tarp_d, 'TarP', 'TarP self-interaction (oligomerization)',
     'ct', 'experimental', 'literature', false,
     'Clifton et al. 2004', '15128720');

  -- TarP -> ACTB (actin)
  insert into protein_interactions
    (gene_id, partner_external_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (tarp_d, 'P60709', 'ACTB', 'Actin — TarP nucleates actin polymerization on entry',
     'human', 'experimental', 'literature', false,
     'Clifton et al. 2004', '15128720');

  -- HtrA -> CSN2 (COP9 signalosome subunit 2)
  insert into protein_interactions
    (gene_id, partner_external_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (htra_d, 'P78344', 'CSN2', 'COP9 signalosome subunit 2',
     'human', 'experimental', 'literature', false,
     'Hale et al. 2009 (IntAct curated)', null);

  -- FliA (σ28) <-> RpoB (bidirectional)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (flia_d, rpob_d, 'rpoB', 'RNA polymerase β subunit — σ28 binds core RNAP',
     'ct', 'experimental', 'literature', false,
     'IntAct curated (bacterial two-hybrid)', null),
    (rpob_d, flia_d, 'fliA', 'σ28 — binds RNA polymerase β subunit',
     'ct', 'experimental', 'literature', false,
     'IntAct curated (bacterial two-hybrid)', null);

  -- LpxD self-interaction
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (lpxd_d, lpxd_d, 'lpxD', 'LpxD self-interaction (LPS biosynthesis enzyme)',
     'ct', 'experimental', 'literature', false,
     'IntAct curated', null);

  -- IncA <-> IncE (CT-CT, Mirrashidi AP-MS confirmed, also in IntAct)
  insert into protein_interactions
    (gene_id, partner_ct_gene_id, partner_name, partner_description,
     partner_organism, evidence_tier, method, strain_specific,
     study_reference, pubmed_id)
  values
    (inca_d, ince_d, 'IncE', 'IncA–IncE co-IP interaction',
     'ct', 'experimental', 'literature', false,
     'Mirrashidi et al. 2015', '26118995'),
    (ince_d, inca_d, 'IncA', 'IncA–IncE co-IP interaction',
     'ct', 'experimental', 'literature', false,
     'Mirrashidi et al. 2015', '26118995');

  raise notice 'Seed complete.';
end $$;
