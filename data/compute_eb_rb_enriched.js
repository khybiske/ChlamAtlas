#!/usr/bin/env node
/**
 * Computes eb_enriched and rb_enriched for CT-L2 genes and writes to genes table.
 *
 * Thresholds (Saka et al. 2011, PMID 22014092 — label-free LC/LC-MS/MS spectral counts):
 *   eb_enriched: eb_expression >= 2 * rb_expression  OR  (rb_expression IS NULL AND eb_expression > 0)
 *   rb_enriched: rb_expression >= 2 * eb_expression
 *
 * Run:     SUPABASE_SERVICE_KEY=<key> node data/compute_eb_rb_enriched.js
 * Dry run: SUPABASE_SERVICE_KEY=<key> node data/compute_eb_rb_enriched.js --dry-run
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE    = 1000;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllProtRows() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('expression_data')
      .select('gene_id, eb_expression, rb_expression')
      .not('eb_expression', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function classify(eb, rb) {
  // eb and rb are numbers or null
  const ebVal = eb ?? 0;
  const rbVal = rb ?? 0;
  const ebEnriched = ebVal > 0 && (rb === null || ebVal >= 2 * rbVal);
  const rbEnriched = rbVal > 0 && rbVal >= 2 * ebVal;
  return { eb_enriched: ebEnriched || null, rb_enriched: rbEnriched || null };
}

async function main() {
  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const rows = await fetchAllProtRows();
  console.log(`Fetched ${rows.length} proteomic rows`);

  let ebCount = 0, rbCount = 0, neitherCount = 0;
  const updates = rows.map(r => {
    const { eb_enriched, rb_enriched } = classify(r.eb_expression, r.rb_expression);
    if (eb_enriched) ebCount++;
    if (rb_enriched) rbCount++;
    if (!eb_enriched && !rb_enriched) neitherCount++;
    return { id: r.gene_id, eb_enriched: eb_enriched ?? false, rb_enriched: rb_enriched ?? false };
  });

  console.log(`EB enriched: ${ebCount} | RB enriched: ${rbCount} | Neither: ${neitherCount}`);

  if (DRY_RUN) {
    console.log('Sample updates:', updates.slice(0, 5));
    return;
  }

  // Update each gene's eb_enriched and rb_enriched
  // We use individual updates since upsert would require all NOT NULL columns.
  // Batched via Promise.all in chunks of PAGE to avoid overwhelming the API.
  for (let i = 0; i < updates.length; i += PAGE) {
    const batch = updates.slice(i, i + PAGE);
    await Promise.all(batch.map(async (row) => {
      const { error } = await sb
        .from('genes')
        .update({ eb_enriched: row.eb_enriched, rb_enriched: row.rb_enriched })
        .eq('id', row.id);
      if (error) throw error;
    }));
    console.log(`Updated genes ${i + 1}–${Math.min(i + PAGE, updates.length)}`);
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
