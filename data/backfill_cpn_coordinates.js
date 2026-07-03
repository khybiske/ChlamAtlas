#!/usr/bin/env node
/**
 * Backfills genome coordinates (start_bp, end_bp, strand) for Cpn (TW-183)
 * genes from NCBI's RefSeq GFF annotation — data UniProt doesn't provide,
 * which Phase 1's import correctly left null rather than guessing.
 *
 * Source: GCF_000007205.1 (ASM720v1) — verified during design to carry
 * old_locus_tag=CpB#### matching our genes.locus_tag exactly, with 1-based
 * inclusive start/end coordinates and +/- strand, matching this project's
 * existing start_bp/end_bp/strand conventions.
 *
 * Usage:
 *   node data/backfill_cpn_coordinates.js --dry-run
 *   node data/backfill_cpn_coordinates.js
 */

const zlib = require('zlib');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN  = process.argv.includes('--dry-run');
const GFF_URL  = 'https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/007/205/GCF_000007205.1_ASM720v1/GCF_000007205.1_ASM720v1_genomic.gff.gz';
const BATCH_SIZE = 200;

/** Fetch and gunzip the GFF, return its text content. */
async function fetchGff() {
  const res = await fetch(GFF_URL);
  if (!res.ok) throw new Error(`GFF fetch failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return zlib.gunzipSync(buf).toString('utf8');
}

/** Parse GFF text into { locus_tag: { start_bp, end_bp, strand } } for gene features only. */
function parseGeneCoordinates(gffText) {
  const map = {};
  for (const line of gffText.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 9 || cols[2] !== 'gene') continue;
    const [, , , start, end, , strand, , attrs] = cols;
    const oldLocusMatch = attrs.match(/old_locus_tag=([^;]+)/);
    if (!oldLocusMatch) continue;
    map[oldLocusMatch[1]] = {
      start_bp: parseInt(start, 10),
      end_bp:   parseInt(end, 10),
      strand,
    };
  }
  return map;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Looking up Cpn strain...');
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', 'Cpn').single();
  if (strainErr || !strainRow) { console.error('Strain "Cpn" not found.'); process.exit(1); }

  console.log('Fetching Cpn genes...');
  const genes = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes').select('id, locus_tag').eq('strain_id', strainRow.id).range(from, from + 999);
    if (error) { console.error('Failed to fetch genes:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    genes.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  ${genes.length} Cpn genes found`);

  console.log('Fetching and parsing NCBI GFF...');
  const gffText = await fetchGff();
  const coordMap = parseGeneCoordinates(gffText);
  console.log(`  ${Object.keys(coordMap).length} gene features with old_locus_tag parsed from GFF`);

  const updates = [];
  let skipped = 0;
  for (const g of genes) {
    const coord = coordMap[g.locus_tag];
    if (!coord) { skipped++; continue; }
    updates.push({ id: g.id, ...coord });
  }
  console.log(`${updates.length} genes to update (${skipped} with no matching GFF entry — expected, e.g. RNA genes or minor annotation differences)`);

  if (DRY_RUN) {
    console.log('[dry-run] Sample of first 3 updates:');
    console.log(updates.slice(0, 3));
    console.log('[dry-run] No writes performed.');
    return;
  }

  // Note: plain .update() per row, not .upsert() — these are all existing rows
  // being patched with 3 columns, and upsert's INSERT-on-conflict path would
  // require every NOT NULL column (e.g. strain_id) to be present in the payload.
  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(({ id, ...coord }) =>
      supabase.from('genes').update(coord).eq('id', id)
    ));
    for (const { error } of results) {
      if (error) { console.error(`  ✗ ${error.message}`); failed++; }
      else succeeded++;
    }
  }
  console.log(`Done: ${succeeded} updated, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
