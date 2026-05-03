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

// ── Phase 1: Proteins ─────────────────────────────────────────────────────────

async function importProteins(supabase, geneMaps) {
  console.log('\n── Phase 1: Proteins ──────────────────────────');
  let totalInserted = 0, totalSkipped = 0, totalFailed = 0;

  for (const { file, commonName } of STRAIN_FILES) {
    const rows    = parseCsv(file);
    const geneMap = geneMaps[commonName] || {};
    const proteins = [];

    for (const row of rows) {
      const locus  = trimVal(row['GeneID']);
      if (!locus) continue;
      const geneId = geneMap[locus];
      if (!geneId) { totalSkipped++; continue; }

      const bpLen = parseNum(row['Length (bp)']);
      proteins.push({
        gene_id:          geneId,
        uniprot_id:       trimVal(row['Uniprot ID']),
        alphafold_id:     trimVal(row['AlphaFold ID']),
        mass_kd:          parseNum(row['Mass (kD)']),
        length_aa:        bpLen != null ? Math.floor(bpLen) : null,
        protein_family:   trimVal(row['Protein Family']),
        function_narrative: trimVal(row['Function']),
        localization:     trimVal(row['Subcellular Location']),
        oligomeric_state: trimVal(row['Subunit Structure']),
      });
    }

    const { succeeded, failed } = await batchUpsert(supabase, 'proteins', proteins, 'gene_id');
    console.log(`  ${commonName}: ${succeeded}/${proteins.length} proteins upserted${failed ? ` (${failed} failed)` : ''}`);
    totalInserted += succeeded;
    totalFailed   += failed;
  }

  console.log(`  Total: ${totalInserted} inserted, ${totalSkipped} no-match skipped, ${totalFailed} upsert failed`);
  return totalFailed;
}

// ── Phase 2: AlphaFold Results ────────────────────────────────────────────────

async function importAlphaFold(supabase, geneMaps) {
  console.log('\n── Phase 2: AlphaFold Results ─────────────────');

  // Build gene_id → protein_id lookup from what was just upserted.
  // Paginate to avoid the default 1000-row Supabase limit (2687 proteins).
  const PAGE = 1000;
  let allProts = [];
  let from = 0;
  while (true) {
    const { data, error: protErr } = await supabase
      .from('proteins')
      .select('id, gene_id')
      .range(from, from + PAGE - 1);
    if (protErr) { console.error('Failed to fetch proteins:', protErr.message); return 0; }
    if (!data || data.length === 0) break;
    allProts = allProts.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const protMap = Object.fromEntries(allProts.map(p => [p.gene_id, p.id]));
  console.log(`  ${allProts.length} proteins loaded for lookup`);

  let totalInserted = 0, totalSkipped = 0, totalFailed = 0;

  for (const { file, commonName } of STRAIN_FILES) {
    const rows    = parseCsv(file);
    const geneMap = geneMaps[commonName] || {};
    const afRows  = [];

    for (const row of rows) {
      const locus = trimVal(row['GeneID']);
      if (!locus) continue;

      const geneId    = geneMap[locus];
      const proteinId = geneId ? protMap[geneId] : null;
      if (!proteinId) { totalSkipped++; continue; }

      const afImageUrl = trimVal(row['AFImageURL']);
      const afId       = trimVal(row['AlphaFold ID']);
      if (!afImageUrl && !afId) { totalSkipped++; continue; } // no usable structure data

      // Default to 'AF2' when Version is blank — most rows predate the AF3 rollout
      // Validate af_version against allowlist to catch typos (e.g., 'AF#' in CT-D)
      const VALID_VERSIONS = new Set(['AF2', 'AF3']);
      const rawVersion = trimVal(row['Version']) || 'AF2';
      const afVersion  = VALID_VERSIONS.has(rawVersion) ? rawVersion : 'AF2';
      if (afVersion !== rawVersion) console.warn(`  ⚠ ${commonName} ${locus}: unrecognized version "${rawVersion}", stored as AF2`);

      const uniprotId = trimVal(row['Uniprot ID']);
      const mmcifPath = uniprotId
        ? `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_v4.cif`
        : null;

      // Column name differs between strain CSVs:
      // CT-L2 and CM use "Structural homology (Foldseek)"
      // CT-D uses "Structural homology inferred function"
      const inferred = trimVal(row['Structural homology (Foldseek)'])
                    || trimVal(row['Structural homology inferred function']);

      afRows.push({
        protein_id:          proteinId,
        af_version:          afVersion,
        thumbnail_path:      afImageUrl,
        mmcif_path:          mmcifPath,
        top_homolog_pdb_id:  trimVal(row['PDB ID']),
        inferred_function:   inferred,
      });
    }

    const nullThumbs = afRows.filter(r => !r.thumbnail_path).length;
    if (nullThumbs > 0) console.warn(`  ⚠ ${commonName}: ${nullThumbs}/${afRows.length} rows have no thumbnail_path`);

    const { succeeded, failed } = await batchUpsert(supabase, 'alphafold_results', afRows, 'protein_id,af_version');
    console.log(`  ${commonName}: ${succeeded}/${afRows.length} AF rows upserted${failed ? ` (${failed} failed)` : ''}`);
    totalInserted += succeeded;
    totalFailed   += failed;
  }

  console.log(`  Total: ${totalInserted} AF rows inserted, ${totalSkipped} no-protein skipped, ${totalFailed} upsert failed`);
  return totalFailed;
}

// ── Phase 3: Expression Data ──────────────────────────────────────────────────

async function importExpression(supabase, geneMaps) {
  console.log('\n── Phase 3: Expression Data ───────────────────');

  const CT_D_TIMEPOINTS = [
    { tp: 'T0', col: '1h'  },
    { tp: 'T1', col: '3h'  },
    { tp: 'T2', col: '8h'  },
    { tp: 'T3', col: '16h' },
    { tp: 'T4', col: '24h' },
    { tp: 'T5', col: '40h' },
  ];

  let totalInserted = 0, totalFailed = 0;

  // ── CT-D ─────────────────────────────────────────────────────────────────
  {
    const rows    = parseCsv('ChlamDB - Genes_D.csv');
    const geneMap = geneMaps['CT-D'] || {};
    const exprRows = [];
    const geneIds  = [];

    for (const row of rows) {
      const locus  = trimVal(row['GeneID']);
      if (!locus) continue;
      const geneId = geneMap[locus];
      if (!geneId) continue;
      geneIds.push(geneId);

      // Six microarray timepoint rows
      for (const { tp, col } of CT_D_TIMEPOINTS) {
        exprRows.push({
          gene_id:   geneId,
          timepoint: tp,
          method:    'microarray',
          value:     parseNum(row[col]),
        });
      }

      // One proteomics row (only if at least one value is present)
      const eb = parseNum(row['EB']);
      const rb = parseNum(row['RB']);
      if (eb != null || rb != null) {
        exprRows.push({
          gene_id:       geneId,
          timepoint:     'T0',
          method:        null,
          value:         null,
          eb_expression: eb,
          rb_expression: rb,
        });
      }
    }

    // Delete existing rows for these genes before inserting fresh data
    let deleteFailed = false;
    for (let i = 0; i < geneIds.length; i += BATCH_SIZE) {
      const batch = geneIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('expression_data').delete().in('gene_id', batch);
      if (error) {
        console.error('  ✗ Delete error (CT-D), aborting insert to prevent duplicates:', error.message);
        deleteFailed = true;
        break;
      }
    }
    if (deleteFailed) {
      totalFailed += exprRows.length;
    } else {
      const { succeeded, failed } = await batchInsert(supabase, 'expression_data', exprRows);
      console.log(`  CT-D: ${succeeded}/${exprRows.length} expression rows inserted${failed ? ` (${failed} failed)` : ''}`);
      totalInserted += succeeded;
      totalFailed   += failed;
    }
  }

  // ── CT-L2 ────────────────────────────────────────────────────────────────
  {
    const rows    = parseCsv('ChlamDB - Genes_L2.csv');
    const geneMap = geneMaps['CT-L2'] || {};
    const exprRows = [];
    const geneIds  = [];

    for (const row of rows) {
      const locus  = trimVal(row['GeneID']);
      if (!locus) continue;
      const geneId = geneMap[locus];
      if (!geneId) continue;
      geneIds.push(geneId);

      // One qualitative microarray row (skip if pattern is absent or ND)
      const pattern = trimVal(row['Microarray']);
      if (pattern && pattern !== 'ND') {
        exprRows.push({
          gene_id:       geneId,
          timepoint:     'T0',
          method:        'microarray',
          value:         null,
          pattern_label: pattern,
        });
      }

      // One proteomics row
      const eb = parseNum(row['EB']);
      const rb = parseNum(row['RB']);
      if (eb != null || rb != null) {
        exprRows.push({
          gene_id:       geneId,
          timepoint:     'T0',
          method:        null,
          value:         null,
          eb_expression: eb,
          rb_expression: rb,
        });
      }
    }

    let deleteFailed = false;
    for (let i = 0; i < geneIds.length; i += BATCH_SIZE) {
      const batch = geneIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('expression_data').delete().in('gene_id', batch);
      if (error) {
        console.error('  ✗ Delete error (CT-L2), aborting insert to prevent duplicates:', error.message);
        deleteFailed = true;
        break;
      }
    }
    if (deleteFailed) {
      totalFailed += exprRows.length;
    } else {
      const { succeeded, failed } = await batchInsert(supabase, 'expression_data', exprRows);
      console.log(`  CT-L2: ${succeeded}/${exprRows.length} expression rows inserted${failed ? ` (${failed} failed)` : ''}`);
      totalInserted += succeeded;
      totalFailed   += failed;
    }
  }

  // CM: no expression data
  console.log(`  CM: skipped (no expression data in source)`);
  console.log(`  Total: ${totalInserted} expression rows, ${totalFailed} failed`);
  return totalFailed;
}

// ── Phase 4: Orthologs ────────────────────────────────────────────────────────

async function importOrthologs(supabase, geneMaps) {
  console.log('\n── Phase 4: Orthologs ──────────────────────────');

  // Fetch strain UUIDs
  const { data: strains, error: strainErr } = await supabase
    .from('strains')
    .select('id, common_name');
  if (strainErr) { console.error('Failed to fetch strains:', strainErr.message); return 0; }
  const strainMap = Object.fromEntries(strains.map(s => [s.common_name, s.id]));

  const l2Map = geneMaps['CT-L2'] || {};
  const dMap  = geneMaps['CT-D']  || {};
  const cmMap = geneMaps['CM']    || {};

  const pairs = [];
  const seen  = new Set(); // canonical sorted UUID pair key

  function addPair(idA, cnA, idB, cnB) {
    if (!idA || !idB) return;
    // Canonical ordering by UUID string to satisfy UNIQUE(gene_id_a, gene_id_b)
    const [gA, gB] = idA < idB ? [idA, idB] : [idB, idA];
    const [sA, sB] = idA < idB ? [cnA, cnB] : [cnB, cnA];
    const key = `${gA}|${gB}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({
      gene_id_a:   gA,
      gene_id_b:   gB,
      strain_id_a: strainMap[sA],
      strain_id_b: strainMap[sB],
      method:      'reciprocal_blast',
    });
  }

  // CT-L2 CSV: L2↔D and L2↔CM pairs
  const l2Rows = parseCsv('ChlamDB - Genes_L2.csv');
  for (const row of l2Rows) {
    const l2Id = l2Map[trimVal(row['GeneID'])];
    if (!l2Id) continue;

    const dLocus  = trimVal(row['OrthologID_D']);
    if (dLocus)  addPair(l2Id, 'CT-L2', dMap[dLocus],  'CT-D');

    const cmLocus = trimVal(row['OrthologID_CM']);
    if (cmLocus) addPair(l2Id, 'CT-L2', cmMap[cmLocus], 'CM');
  }

  // CT-D CSV: D↔CM pairs only (L2↔D already covered above)
  const dRows = parseCsv('ChlamDB - Genes_D.csv');
  for (const row of dRows) {
    const dId = dMap[trimVal(row['GeneID'])];
    if (!dId) continue;

    const cmLocus = trimVal(row['OrthologID_CM']);
    if (cmLocus) addPair(dId, 'CT-D', cmMap[cmLocus], 'CM');
  }

  console.log(`  ${pairs.length} ortholog pairs assembled`);

  const { succeeded, failed } = await batchUpsert(supabase, 'orthologs', pairs, 'gene_id_a,gene_id_b');
  console.log(`  ${succeeded} ortholog pairs upserted${failed ? ` (${failed} failed)` : ''}`);
  return failed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);

  const VALID_PHASES = ['proteins', 'alphafold', 'expression', 'orthologs'];
  if (PHASE && !VALID_PHASES.includes(PHASE)) {
    console.error(`Unknown phase "${PHASE}". Valid: ${VALID_PHASES.join(' | ')}`);
    process.exit(1);
  }

  let totalFailed = 0;
  if (!PHASE || PHASE === 'proteins')   totalFailed += await importProteins(supabase, geneMaps);
  if (!PHASE || PHASE === 'alphafold')  totalFailed += await importAlphaFold(supabase, geneMaps);
  if (!PHASE || PHASE === 'expression') totalFailed += await importExpression(supabase, geneMaps);
  if (!PHASE || PHASE === 'orthologs')  totalFailed += await importOrthologs(supabase, geneMaps);

  console.log('\nDone.');
  if (totalFailed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
