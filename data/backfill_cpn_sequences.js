#!/usr/bin/env node
/**
 * Backfills proteins.aa_sequence for Cpn (Chlamydia pneumoniae TW-183) from
 * UniProt — the trio's aa_sequence came from NCBI eutils (fetch_sequences.js),
 * but Cpn's protein data was sourced from UniProt directly (Phase 1), so we
 * fetch sequences from the same source for consistency and simplicity.
 *
 * Usage:
 *   node data/backfill_cpn_sequences.js --dry-run
 *   node data/backfill_cpn_sequences.js
 */

const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN     = process.argv.includes('--dry-run');
const PROTEOME_ID = 'UP000000424'; // TW-183, locked in Phase 1
const BATCH_SIZE  = 200;

async function fetchUniprotSequences(proteomeId) {
  const map = {};
  let url = `https://rest.uniprot.org/uniprotkb/search?query=proteome:${proteomeId}&format=tsv&fields=accession,sequence&size=500`;
  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ChlamAtlas/1.0 (khybiske@uw.edu; research use)' } });
    if (!res.ok) throw new Error(`UniProt fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const rows = parse(text, { columns: true, delimiter: '\t', skip_empty_lines: true, trim: true, bom: true });
    for (const row of rows) map[row['Entry']] = row['Sequence'];
    const linkHeader = res.headers.get('link');
    const nextMatch  = linkHeader && linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }
  return map;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Looking up Cpn strain...');
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', 'Cpn').single();
  if (strainErr || !strainRow) { console.error('Strain "Cpn" not found.'); process.exit(1); }

  console.log('Fetching Cpn proteins (id, uniprot_id)...');
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('proteins')
      .select('id, gene_id, uniprot_id, genes!inner(strain_id)')
      .eq('genes.strain_id', strainRow.id)
      .range(from, from + 999);
    if (error) { console.error('Failed to fetch proteins:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  ${all.length} Cpn proteins found`);

  console.log(`Fetching sequences from UniProt proteome ${PROTEOME_ID}...`);
  const seqMap = await fetchUniprotSequences(PROTEOME_ID);
  console.log(`  ${Object.keys(seqMap).length} sequences fetched`);

  const updates = [];
  let skipped = 0;
  for (const p of all) {
    const seq = seqMap[p.uniprot_id];
    if (!seq) { skipped++; continue; }
    // gene_id is included (not just id/aa_sequence) because PostgREST's upsert
    // builds an INSERT ... ON CONFLICT DO UPDATE statement, and Postgres
    // validates NOT NULL constraints (gene_id is NOT NULL) on the constructed
    // INSERT row before conflict resolution is evaluated — even though the
    // row always exists and this is effectively an update-only operation.
    updates.push({ id: p.id, gene_id: p.gene_id, aa_sequence: seq });
  }
  console.log(`${updates.length} proteins to update (${skipped} with no matching UniProt sequence)`);

  if (DRY_RUN) {
    console.log('[dry-run] Sample of first 3 updates:');
    console.log(updates.slice(0, 3).map(u => ({ id: u.id, aa_sequence_len: u.aa_sequence.length })));
    console.log('[dry-run] No writes performed.');
    return;
  }

  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('proteins').upsert(batch, { onConflict: 'id' });
    if (error) { console.error(`  ✗ batch ${i}: ${error.message}`); failed += batch.length; }
    else succeeded += batch.length;
  }
  console.log(`Done: ${succeeded} updated, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
