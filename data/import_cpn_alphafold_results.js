#!/usr/bin/env node
/**
 * Populates alphafold_results rows for Cpn (Chlamydia pneumoniae TW-183)
 * directly from the proteins table — no external CSV needed, since
 * AlphaFold DB URLs are derived purely from uniprot_id, which Phase 1's
 * import already populated.
 *
 * Usage:
 *   node data/import_cpn_alphafold_results.js --dry-run
 *   node data/import_cpn_alphafold_results.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN    = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;
const PAGE_SIZE  = 1000;

async function fetchCpnProteins(supabase, strainId) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('proteins')
      .select('id, uniprot_id, genes!inner(strain_id)')
      .eq('genes.strain_id', strainId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('Failed to fetch proteins:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Looking up Cpn strain...');
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', 'Cpn').single();
  if (strainErr || !strainRow) { console.error('Strain "Cpn" not found.'); process.exit(1); }

  console.log('Fetching Cpn proteins...');
  const proteins = await fetchCpnProteins(supabase, strainRow.id);
  console.log(`  ${proteins.length} proteins found`);

  const rows = [];
  let skippedNoUniprot = 0;
  for (const p of proteins) {
    if (!p.uniprot_id) { skippedNoUniprot++; continue; }
    rows.push({
      protein_id:     p.id,
      af_version:     'AF2',
      mmcif_path:     `https://alphafold.ebi.ac.uk/files/AF-${p.uniprot_id}-F1-model_v4.cif`,
      thumbnail_path: null,
    });
  }

  console.log(`${rows.length} alphafold_results rows to upsert (${skippedNoUniprot} proteins with no uniprot_id skipped)`);

  if (DRY_RUN) {
    console.log('[dry-run] Sample of first 3 rows:');
    console.log(rows.slice(0, 3));
    console.log('[dry-run] No writes performed.');
    return;
  }

  let succeeded = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('alphafold_results').upsert(batch, { onConflict: 'protein_id,af_version' });
    if (error) { console.error(`  ✗ batch ${i}: ${error.message}`); failed += batch.length; }
    else succeeded += batch.length;
  }
  console.log(`Done: ${succeeded} upserted, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
