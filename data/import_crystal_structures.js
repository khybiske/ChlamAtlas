#!/usr/bin/env node
// Inserts crystal structure rows into alphafold_results.
// Run: SUPABASE_SERVICE_KEY=<key> node data/import_crystal_structures.js
// Add --dry-run to preview without inserting.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();
const DRY_RUN = process.argv.includes('--dry-run');

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// For proteins with multiple PDB IDs, the first listed is the primary record.
// Extras are flagged in the `note` field for Kevin's review.
const CRYSTAL_DATA = [
  // CT-L2
  { locus_tag: 'CTL0140', pdb_id: '4ILQ' },
  { locus_tag: 'CTL0246', pdb_id: '6MRN' },
  { locus_tag: 'CTL0247', pdb_id: '5B5Q' },
  { locus_tag: 'CTL0276', pdb_id: '6UXD' },
  { locus_tag: 'CTL0505', pdb_id: '6UXC' },
  { locus_tag: 'CTL0515', pdb_id: '4QAQ' },
  { locus_tag: 'CTL0548', pdb_id: '3QH6' },
  { locus_tag: 'CTL0655', pdb_id: '4ILO' },
  { locus_tag: 'CTL0700', pdb_id: '4QL6' },
  { locus_tag: 'CTL0847', pdb_id: '4MLK' },
  { locus_tag: 'CTL0851', pdb_id: '6MAB' },
  { locus_tag: 'CTL0886', pdb_id: '5UE0' },
  { locus_tag: 'CTL0894', pdb_id: '2M1B' },
  // CT-D
  { locus_tag: 'CT045',  pdb_id: '6OME' },
  { locus_tag: 'CT067',  pdb_id: '6NSI' },
  { locus_tag: 'CT091',  pdb_id: '3T7Y' },
  { locus_tag: 'CT116',  pdb_id: '5TP1' },
  { locus_tag: 'CT119',  pdb_id: '6E6A' },
  { locus_tag: 'CT170',  pdb_id: '6V82' },
  { locus_tag: 'CT171',  pdb_id: '6V82', note: 'REVIEW: shares PDB 6V82 with CT170' },
  { locus_tag: 'CT220',  pdb_id: '7KM2' },
  { locus_tag: 'CT243',  pdb_id: '2IU8' },
  { locus_tag: 'CT381',  pdb_id: '3DEL' },
  { locus_tag: 'CT390',  pdb_id: '3ASA' },
  { locus_tag: 'CT407',  pdb_id: '6PTG' },
  { locus_tag: 'CT505',  pdb_id: '6OK4', note: 'REVIEW: additional PDB IDs 6WYC, 6X2E' },
  { locus_tag: 'CT585',  pdb_id: '6NCR' },
  { locus_tag: 'CT610',  pdb_id: '1RCW' },
  { locus_tag: 'CT664',  pdb_id: '3GQS', note: 'REVIEW: additional PDB ID 4QO6' },
  { locus_tag: 'CT670',  pdb_id: '3K29' },
  { locus_tag: 'CT706',  pdb_id: '6X60' },
  { locus_tag: 'CT736',  pdb_id: '3N08' },
  { locus_tag: 'CT772',  pdb_id: '6WE5' },
  { locus_tag: 'CT828',  pdb_id: '1SYY', note: 'REVIEW: additional PDB IDs 2ANI, 4D8F' },
  { locus_tag: 'CT858',  pdb_id: '3DJA' },
];

function rcsbThumbnailUrl(pdbId) {
  const lower = pdbId.toLowerCase();
  const mid = lower.slice(1, 3);
  return `https://cdn.rcsb.org/images/structures/${mid}/${lower}/${lower}_assembly-1.jpeg`;
}

function rcsbCifUrl(pdbId) {
  return `https://files.rcsb.org/download/${pdbId}.cif`;
}

async function main() {
  const locusTags = CRYSTAL_DATA.map(r => r.locus_tag);

  // Fetch genes by locus_tag
  const { data: genes, error: genesErr } = await sb
    .from('genes')
    .select('id, locus_tag')
    .in('locus_tag', locusTags);
  if (genesErr) { console.error('genes fetch error:', genesErr); process.exit(1); }

  const geneMap = Object.fromEntries(genes.map(g => [g.locus_tag, g.id]));

  // Fetch proteins by gene_id
  const geneIds = Object.values(geneMap);
  const { data: proteins, error: protsErr } = await sb
    .from('proteins')
    .select('id, gene_id')
    .in('gene_id', geneIds);
  if (protsErr) { console.error('proteins fetch error:', protsErr); process.exit(1); }

  const proteinMap = Object.fromEntries(proteins.map(p => [p.gene_id, p.id]));

  const rows = [];
  for (const entry of CRYSTAL_DATA) {
    const geneId = geneMap[entry.locus_tag];
    if (!geneId) { console.warn(`WARN: gene not found for ${entry.locus_tag}`); continue; }
    const proteinId = proteinMap[geneId];
    if (!proteinId) { console.warn(`WARN: protein not found for ${entry.locus_tag} (gene ${geneId})`); continue; }
    if (entry.note) console.log(`NOTE [${entry.locus_tag}]: ${entry.note}`);
    rows.push({
      protein_id:         proteinId,
      af_version:         'crystal',
      top_homolog_pdb_id: entry.pdb_id,
      mmcif_path:         rcsbCifUrl(entry.pdb_id),
      thumbnail_path:     rcsbThumbnailUrl(entry.pdb_id),
    });
  }

  console.log(`Prepared ${rows.length} crystal structure rows.`);
  if (DRY_RUN) { console.log('Dry run — not inserting.'); console.log(rows); return; }

  const { error: upsertErr } = await sb
    .from('alphafold_results')
    .upsert(rows, { onConflict: 'protein_id,af_version' });
  if (upsertErr) { console.error('upsert error:', upsertErr); process.exit(1); }
  console.log(`Inserted/updated ${rows.length} rows.`);
}

main();
