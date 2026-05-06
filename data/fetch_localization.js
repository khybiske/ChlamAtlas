#!/usr/bin/env node
/**
 * Fetches subcellular location SL term IDs from UniProt and stores them in
 * proteins.subcellular_location_sl, applying Chlamydia-specific flag overrides.
 *
 * Run:       SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js
 * Dry run:   SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --dry-run
 * Single:    SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --uniprot=Q3KNA5
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN     = process.argv.includes('--dry-run');
const SINGLE_ID   = process.argv.find(a => a.startsWith('--uniprot='))?.split('=')[1] ?? null;
const CONCURRENCY = 5;
const BATCH_DELAY = 300; // ms between batches

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Fetch SL term IDs for a UniProt accession. Returns [] on error or no data. */
async function fetchSlTerms(uniprotId) {
  const url = `https://rest.uniprot.org/uniprotkb/${uniprotId}.json`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`  ⚠ UniProt ${uniprotId}: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const ids = [];
    for (const comment of (data.comments ?? [])) {
      if (comment.commentType !== 'SUBCELLULAR LOCATION') continue;
      for (const sl of (comment.subcellularLocations ?? [])) {
        if (sl.location?.id) ids.push(sl.location.id);
      }
    }
    return [...new Set(ids)];
  } catch (err) {
    console.warn(`  ⚠ UniProt ${uniprotId}: ${err.message}`);
    return [];
  }
}

/** Run async tasks with limited concurrency. */
async function runBatched(tasks, concurrency, delayMs) {
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(t => t()));
    process.stdout.write(`  Processed ${Math.min(i + concurrency, tasks.length)}/${tasks.length}\r`);
    if (i + concurrency < tasks.length) await sleep(delayMs);
  }
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Loading proteins…');
  const PAGE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from('proteins')
      .select('id, uniprot_id, localization, subcellular_location_sl, genes!inner(functional_category, is_t3_secreted)')
      .eq('localization_curated', false)
      .range(from, from + PAGE - 1);
    if (SINGLE_ID) query = query.eq('uniprot_id', SINGLE_ID);
    const { data, error } = await query;
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data?.length) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const withUniProt    = allRows.filter(r => r.uniprot_id);
  const withoutUniProt = allRows.filter(r => !r.uniprot_id);
  console.log(`Loaded ${allRows.length} proteins (${withUniProt.length} have UniProt IDs, ${withoutUniProt.length} do not)`);
  if (DRY_RUN) console.log('[DRY RUN — no DB writes]\n');

  console.log('\nFetching from UniProt API…');
  const fetchedMap = new Map();
  const tasks = withUniProt.map(row => async () => {
    const slIds = await fetchSlTerms(row.uniprot_id);
    fetchedMap.set(row.id, slIds);
  });
  await runBatched(tasks, CONCURRENCY, BATCH_DELAY);
  console.log('\nFetch complete.');

  const updates = [];
  const spotCheck = [];

  for (const row of allRows) {
    const gene = row.genes;
    let resolvedSl = fetchedMap.get(row.id) ?? null;

    const isInc       = gene?.functional_category === 'Inclusion membrane protein';
    const isT3Secreted = gene?.is_t3_secreted === true;
    let overridden = false;
    if (isInc || isT3Secreted) {
      resolvedSl = ['SL-0204'];
      overridden = true;
    }

    if (!resolvedSl?.length) continue;

    if (!overridden && row.localization) {
      const existing = row.localization.toLowerCase();
      const existingHasSecr = existing.includes('secret');
      const fetchedHasSecr  = resolvedSl.some(id => id === 'SL-0204');
      if (existingHasSecr !== fetchedHasSecr) {
        spotCheck.push({ uniprot_id: row.uniprot_id, existing: row.localization, fetched: resolvedSl.join(', ') });
      }
    }

    updates.push({ id: row.id, subcellular_location_sl: resolvedSl });
  }

  if (spotCheck.length) {
    console.log(`\n=== SPOT-CHECK — ${spotCheck.length} secreted/non-secreted disagreements ===`);
    for (const r of spotCheck) {
      console.log(`  UniProt ${r.uniprot_id}:`);
      console.log(`    Existing: ${r.existing}`);
      console.log(`    Fetched:  ${r.fetched}`);
    }
  } else {
    console.log('\n✓ Spot-check: no secreted/non-secreted disagreements found.');
  }

  console.log(`\n${updates.length} proteins to update.`);
  if (DRY_RUN) { console.log('Dry run — exiting without writes.'); return; }

  const BATCH_SIZE = 50;
  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const u of batch) {
      const { error } = await supabase
        .from('proteins')
        .update({ subcellular_location_sl: u.subcellular_location_sl })
        .eq('id', u.id);
      if (error) { console.error(`  ✗ ${u.id}: ${error.message}`); failed++; }
      else succeeded++;
    }
    process.stdout.write(`  Wrote ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}\r`);
  }

  console.log(`\n✓ ${succeeded} rows updated, ${failed} failed.`);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
