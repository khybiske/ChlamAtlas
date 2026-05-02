#!/usr/bin/env node
/**
 * Imports proteins, alphafold_results, expression_data, and orthologs
 * from the three gene CSVs into Supabase.
 *
 * Run: SUPABASE_SERVICE_KEY=<key> node data/import_detail_data.js
 * Run single phase: SUPABASE_SERVICE_KEY=<key> node data/import_detail_data.js --phase=proteins
 * Valid phases: proteins | alphafold | expression | orthologs
 */

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const CSV_DIR    = path.join(__dirname, 'csv');
const BATCH_SIZE = 200;
const PHASE      = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] ?? null;

const STRAIN_FILES = [
  { file: 'ChlamDB - Genes_L2.csv', commonName: 'CT-L2' },
  { file: 'ChlamDB - Genes_D.csv',  commonName: 'CT-D'  },
  { file: 'ChlamDB - Genes_CM.csv', commonName: 'CM'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a numeric value; return null for empty, NQ, ND, -, or non-parseable. */
function parseNum(val) {
  if (!val) return null;
  const s = val.trim();
  if (!s || s === 'ND' || s === 'NQ' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Trim a string; return null if empty. */
function trimVal(val) {
  const s = (val || '').trim();
  return s || null;
}

/** Read and parse a CSV file from CSV_DIR. */
function parseCsv(file) {
  const filePath = path.join(CSV_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, bom: true });
}

/** Upsert rows in batches; log errors per batch. Returns { succeeded, failed }. */
async function batchUpsert(supabase, table, rows, conflictCol) {
  let succeeded = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCol });
    if (error) { console.error(`  ✗ ${table} batch ${i}: ${error.message}`); failed += batch.length; }
    else succeeded += batch.length;
  }
  return { succeeded, failed };
}

/** Insert rows in batches. Returns { succeeded, failed }. */
async function batchInsert(supabase, table, rows) {
  let succeeded = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) { console.error(`  ✗ ${table} batch ${i}: ${error.message}`); failed += batch.length; }
    else succeeded += batch.length;
  }
  return { succeeded, failed };
}

// ── Gene UUID map ─────────────────────────────────────────────────────────────

/**
 * Returns { 'CT-L2': { 'CTL0001': uuid, ... }, 'CT-D': { ... }, 'CM': { ... } }
 * Paginates through all rows to avoid the default 1000-row Supabase limit.
 */
async function buildGeneMaps(supabase) {
  const PAGE = 1000;
  let allGenes = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes')
      .select('id, locus_tag, strains(common_name)')
      .range(from, from + PAGE - 1);
    if (error) { console.error('Failed to fetch genes:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allGenes = allGenes.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const maps = {};
  let dropped = 0;
  for (const gene of allGenes) {
    const cn = gene.strains?.common_name;
    if (!cn) { dropped++; continue; }
    if (!maps[cn]) maps[cn] = {};
    maps[cn][gene.locus_tag] = gene.id;
  }
  if (dropped > 0) console.warn(`  ⚠ ${dropped} genes had no matching strain — skipped from map`);
  console.log('Gene maps built:',
    Object.entries(maps).map(([k, v]) => `${k}: ${Object.keys(v).length}`).join(', '));
  return maps;
}

// ── Main (phases added in subsequent tasks) ───────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);

  const VALID_PHASES = ['proteins', 'alphafold', 'expression', 'orthologs'];
  if (PHASE && !VALID_PHASES.includes(PHASE)) {
    console.error(`Unknown phase "${PHASE}". Valid: ${VALID_PHASES.join(' | ')}`);
    process.exit(1);
  }

  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);
  // Phase functions will accumulate into totalFailed — added in Tasks 3–6
  console.log('\nDone.');
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
