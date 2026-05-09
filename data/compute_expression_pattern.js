#!/usr/bin/env node
/**
 * Computes expression_pattern for all genes and writes it to genes.expression_pattern.
 *
 * CT-L2: maps pattern_label from expression_data → Early | Mid | Late | Constitutive
 *   Source: Nicholson et al. 2003, PMID 12730178 (CT-L2 microarray, J Bacteriol)
 *
 * CT-D:  applies Criteria D algorithm on T0–T5 microarray values
 *   Source: Belland et al. 2003, PMID 12815105 (CT-D microarray, PNAS)
 *   Timepoints: T0=1h T1=3h T2=8h T3=16h T4=24h T5=40h
 *   Rules (applied in order):
 *     Early       — norm[T1] >= 0.50 AND norm[T4] <= 0.85 (high at 3h, not still climbing at 24h)
 *     Late        — onset (first tp >= 15% of max) at T3 (16h) or later
 *     Constitutive— onset by T2 (8h) AND norm[T5] >= 0.65 (elevated through 40h)
 *     Mid         — everything else (onset by 8h, declines or peaks mid-cycle)
 *     null        — max value < 50 (no usable expression signal)
 *
 * Run: SUPABASE_SERVICE_KEY=<key> node data/compute_expression_pattern.js
 * Dry: SUPABASE_SERVICE_KEY=<key> node data/compute_expression_pattern.js --dry-run
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN = process.argv.includes('--dry-run');

const CTD_STRAIN  = 'b54d4520-4749-4cee-acfe-fc3c8a240fa6';
const CTL2_STRAIN = 'cc33aea0-630d-42f0-a4f6-796996553711';

const TP_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5'];

// Normalize L2 pattern_label → our 4-bucket vocabulary
const L2_PATTERN_MAP = {
  'Early':       'Early',
  'Mid':         'Mid',
  'Mid_Late':    'Mid',
  'Late':        'Late',
  'late':        'Late',
  'Very_Late':   'Late',
  'Constitutive':'Constitutive',
};

function classifyCTD(tpMap) {
  const vals = TP_ORDER.map(tp => tpMap[tp] ?? 0);
  const maxVal = Math.max(...vals);
  if (maxVal < 50) return null;

  const norm = vals.map(v => v / maxVal);
  const onsetIdx = norm.findIndex(n => n >= 0.15);
  const tail = norm[5]; // T5 = 40h

  // Early: substantially expressed at 3h (T1) and not still monotonically climbing to 24h
  if (norm[1] >= 0.50 && norm[4] <= 0.85) return 'Early';

  // Late: first substantial expression at 16h (T3) or later
  if (onsetIdx >= 3) return 'Late';

  // Constitutive: on by 8h (T2) and stays elevated at 40h
  if (onsetIdx <= 2 && tail >= 0.65) return 'Constitutive';

  // Mid: on by 8h, but declines or peaks mid-cycle (covers Mid and Mid_Late from L2)
  return 'Mid';
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Column added via migration 010 — nothing to do here

  // Paginate through all rows of a query (bypasses Supabase 1000-row default limit)
  async function fetchAll(query) {
    const PAGE = 1000;
    let rows = [], from = 0;
    while (true) {
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw error;
      rows = rows.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  // ── CT-L2: map from pattern_label ──────────────────────────────────────────
  console.log('\n── CT-L2 (pattern_label mapping) ──');
  const l2Expr = await fetchAll(
    sb.from('expression_data').select('gene_id, pattern_label').not('pattern_label', 'is', null)
  );

  // Deduplicate — take first pattern_label per gene
  const l2Map = {};
  for (const r of l2Expr) {
    if (!l2Map[r.gene_id]) l2Map[r.gene_id] = r.pattern_label;
  }

  const l2Updates = Object.entries(l2Map)
    .map(([gene_id, label]) => ({ gene_id, pattern: L2_PATTERN_MAP[label] ?? null }))
    .filter(u => u.pattern !== null);

  const l2Counts = {};
  for (const u of l2Updates) l2Counts[u.pattern] = (l2Counts[u.pattern] || 0) + 1;
  console.log('  Distribution:', l2Counts);
  console.log('  Total to update:', l2Updates.length);

  // ── CT-D: classify from microarray values ──────────────────────────────────
  console.log('\n── CT-D (Criteria D algorithm) ──');
  const ctdExpr = await fetchAll(
    sb.from('expression_data').select('gene_id, timepoint, value')
      .eq('method', 'microarray').in('timepoint', TP_ORDER)
  );

  const { data: ctdGeneRows } = await sb.from('genes').select('id').eq('strain_id', CTD_STRAIN);
  const ctdSet = new Set(ctdGeneRows.map(g => g.id));

  const ctdByGene = {};
  for (const r of ctdExpr) {
    if (!ctdSet.has(r.gene_id)) continue;
    if (!ctdByGene[r.gene_id]) ctdByGene[r.gene_id] = {};
    ctdByGene[r.gene_id][r.timepoint] = r.value ?? 0;
  }

  const ctdUpdates = Object.entries(ctdByGene)
    .map(([gene_id, tpMap]) => ({ gene_id, pattern: classifyCTD(tpMap) }))
    .filter(u => u.pattern !== null);

  const ctdCounts = {};
  for (const u of ctdUpdates) ctdCounts[u.pattern] = (ctdCounts[u.pattern] || 0) + 1;
  console.log('  Distribution:', ctdCounts);
  console.log('  Total to update:', ctdUpdates.length);

  if (DRY_RUN) {
    console.log('\nDry run — no writes performed.');
    return;
  }

  // ── Write in batches ───────────────────────────────────────────────────────
  const allUpdates = [...l2Updates, ...ctdUpdates];
  console.log('\nWriting', allUpdates.length, 'gene updates...');

  const BATCH = 100;
  let written = 0;
  for (let i = 0; i < allUpdates.length; i += BATCH) {
    const batch = allUpdates.slice(i, i + BATCH);
    for (const { gene_id, pattern } of batch) {
      const { error } = await sb.from('genes')
        .update({ expression_pattern: pattern })
        .eq('id', gene_id);
      if (error) console.warn('  Update failed for', gene_id, ':', error.message);
    }
    written += batch.length;
    process.stdout.write(`\r  ${written}/${allUpdates.length}`);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
