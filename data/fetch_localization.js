#!/usr/bin/env node
/**
 * Fetches subcellular localization data from UniProt and stores it in the proteins table.
 *
 * Precedence (highest → lowest):
 *   1. user      — localization_curated = true  (manual, never overwritten)
 *   2. lab_flag  — gene is Inc protein or is_t3_secreted → SL-0204 (Secreted)
 *   3. uniprot_sl — UniProt SUBCELLULAR LOCATION comment → SL term IDs
 *   4. uniprot_go — UniProt GO cellular component cross-references → GO term IDs
 *
 * Writes:
 *   proteins.subcellular_location_sl  — SL term IDs (used with SwissBioPics /sl/ endpoint)
 *   proteins.subcellular_location_go  — GO term IDs (used with SwissBioPics /go/ endpoint)
 *   proteins.localization_source      — which tier provided the active diagram data
 *
 * Run:        SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js
 * Dry run:    SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --dry-run
 * Single:     SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --uniprot=Q3KNA5
 * Force all:  SUPABASE_SERVICE_KEY=<key> node data/fetch_localization.js --force
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN    = process.argv.includes('--dry-run');
const FORCE_ALL  = process.argv.includes('--force');    // re-process even curated rows
const SINGLE_ID  = process.argv.find(a => a.startsWith('--uniprot='))?.split('=')[1] ?? null;
const CONCURRENCY = 5;
const BATCH_DELAY = 300;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch SL term IDs and GO cellular-component term IDs for a UniProt accession.
 * Returns { sl: string[], go: string[] }
 */
async function fetchUniProtLocalization(uniprotId) {
  const url = `https://rest.uniprot.org/uniprotkb/${uniprotId}.json`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`  ⚠ UniProt ${uniprotId}: HTTP ${res.status}`);
      return { sl: [], go: [] };
    }
    const data = await res.json();

    // SL term IDs from SUBCELLULAR LOCATION comments
    const sl = [];
    for (const comment of (data.comments ?? [])) {
      if (comment.commentType !== 'SUBCELLULAR LOCATION') continue;
      for (const loc of (comment.subcellularLocations ?? [])) {
        if (loc.location?.id) sl.push(loc.location.id);
      }
    }

    // GO cellular component (C:) cross-references
    const go = [];
    for (const xref of (data.uniProtKBCrossReferences ?? [])) {
      if (xref.database !== 'GO') continue;
      const term = xref.properties?.find(p => p.key === 'GoTerm');
      if (term?.value?.startsWith('C:')) go.push(xref.id); // e.g. "GO:0005829"
    }

    return { sl: [...new Set(sl)], go: [...new Set(go)] };
  } catch (err) {
    console.warn(`  ⚠ UniProt ${uniprotId}: ${err.message}`);
    return { sl: [], go: [] };
  }
}

async function runBatched(tasks, concurrency, delayMs) {
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    await Promise.all(batch.map(t => t()));
    process.stdout.write(`  Fetched ${Math.min(i + concurrency, tasks.length)}/${tasks.length}\r`);
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
    let q = supabase
      .from('proteins')
      .select('id, uniprot_id, localization_curated, localization, subcellular_location_sl, genes!inner(locus_tag, functional_category, is_t3_secreted)')
      .range(from, from + PAGE - 1);

    // Skip manually-curated rows unless --force
    if (!FORCE_ALL) q = q.eq('localization_curated', false);
    if (SINGLE_ID)  q = q.eq('uniprot_id', SINGLE_ID);

    const { data, error } = await q;
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data?.length) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const withUniProt    = allRows.filter(r => r.uniprot_id);
  const withoutUniProt = allRows.filter(r => !r.uniprot_id);
  console.log(`Loaded ${allRows.length} proteins (${withUniProt.length} with UniProt IDs, ${withoutUniProt.length} without)`);
  if (DRY_RUN) console.log('[DRY RUN — no DB writes]\n');

  // --- Fetch UniProt data for all proteins that have a UniProt ID ---
  console.log('\nFetching from UniProt API…');
  const fetchedMap = new Map(); // protein id → { sl, go }
  const tasks = withUniProt.map(row => async () => {
    const result = await fetchUniProtLocalization(row.uniprot_id);
    fetchedMap.set(row.id, result);
  });
  await runBatched(tasks, CONCURRENCY, BATCH_DELAY);
  console.log('\nFetch complete.');

  // --- Apply precedence and build update list ---
  const updates    = [];
  let cntLabFlag   = 0;
  let cntUniprotSl = 0;
  let cntUniprotGo = 0;
  let cntNoData    = 0;

  for (const row of allRows) {
    const gene = row.genes;
    const fetched = fetchedMap.get(row.id) ?? { sl: [], go: [] };

    const isInc        = gene?.functional_category === 'Inclusion membrane protein';
    const isT3Secreted = gene?.is_t3_secreted === true;

    let sl     = fetched.sl;
    let go     = fetched.go;
    let source = null;

    if (isInc || isT3Secreted) {
      // Lab flag: override to Secreted regardless of UniProt
      sl     = ['SL-0204'];
      go     = [];
      source = 'lab_flag';
      cntLabFlag++;
    } else if (sl.length) {
      source = 'uniprot_sl';
      cntUniprotSl++;
    } else if (go.length) {
      source = 'uniprot_go';
      cntUniprotGo++;
    } else {
      cntNoData++;
    }

    // Only queue an update if something meaningful changed
    const slChanged  = JSON.stringify(sl.sort())  !== JSON.stringify((row.subcellular_location_sl ?? []).slice().sort());
    const hasNewData = source !== null;

    if (hasNewData || slChanged) {
      updates.push({ id: row.id, subcellular_location_sl: sl, subcellular_location_go: go, localization_source: source });
    }
  }

  console.log(`\nSource breakdown:`);
  console.log(`  lab_flag  (Inc/T3SS override): ${cntLabFlag}`);
  console.log(`  uniprot_sl (SL annotation)   : ${cntUniprotSl}`);
  console.log(`  uniprot_go (GO fallback)      : ${cntUniprotGo}`);
  console.log(`  no data                       : ${cntNoData}`);
  console.log(`\n${updates.length} proteins to update.`);

  if (DRY_RUN || !updates.length) {
    console.log(DRY_RUN ? 'Dry run — exiting.' : 'Nothing to update.');
    return;
  }

  // --- Write to Supabase ---
  const BATCH_SIZE = 50;
  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const u of batch) {
      const { error } = await supabase
        .from('proteins')
        .update({
          subcellular_location_sl:  u.subcellular_location_sl,
          subcellular_location_go:  u.subcellular_location_go,
          localization_source:      u.localization_source,
        })
        .eq('id', u.id);
      if (error) { console.error(`  ✗ ${u.id}: ${error.message}`); failed++; }
      else succeeded++;
    }
    process.stdout.write(`  Wrote ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}\r`);
  }

  console.log(`\n✓ ${succeeded} rows updated, ${failed} failed.`);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
