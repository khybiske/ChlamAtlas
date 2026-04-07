#!/usr/bin/env node
/**
 * Import gene data from CSV files into Supabase genes table.
 *
 * Columns imported → genes table:
 *   GeneID          → locus_tag
 *   FullGeneName    → gene_name
 *   GeneName        → gene_symbol
 *   Function        → functional_category (overridden to 'Inclusion membrane protein' if Inc true = TRUE)
 *   Mem true        → is_membrane_protein
 *   Hyp true        → is_hypothetical
 *   DNA true        → is_dna_binding
 *   Secr true       → is_t3_secreted
 *   Length (bp)     → end_bp (approximate — no start coord in source)
 *
 * Columns intentionally SKIPPED (belong in proteins / alphafold_results / expression_data):
 *   Product, Mass (kD), Uniprot ID, AlphaFold ID, AFImageURL, PDB ID, PDB, PDBImageURL,
 *   EB, RB, Microarray / 1h–40h expression, Protein Family, Biological Process,
 *   Cellular Component, Molecular Function, Subcellular Location, Subunit Structure,
 *   Structural homology, OrthologID_*, PZ, SortIndex, LastEdited, EditedByName, Favorite, Version
 */

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
// Use the service_role key (bypasses RLS) — never commit this to git
// Get it from: Supabase → Project Settings → API → service_role
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const CSV_DIR = path.join(__dirname, 'csv');

// Map: CSV filename → strains.common_name in DB
const STRAIN_FILES = [
  { file: 'ChlamDB - Genes_L2.csv', commonName: 'CT-L2' },
  { file: 'ChlamDB - Genes_D.csv',  commonName: 'CT-D'  },
  { file: 'ChlamDB - Genes_CM.csv', commonName: 'CM'    },
];

const BATCH_SIZE = 200; // rows per upsert call

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseBool(val) {
  if (!val) return false;
  return val.trim().toUpperCase() === 'TRUE';
}

function mapRow(row, strainId) {
  // "Inc true" genes get their functional_category forced to the canonical value
  const isInc = parseBool(row['Inc true']);
  let funcCat = (row['Function'] || '').trim() || null;
  if (isInc) funcCat = 'Inclusion membrane protein';

  const locus = (row['GeneID'] || '').trim();
  if (!locus) return null; // skip blank rows

  const lengthBp = parseInt(row['Length (bp)'], 10);

  return {
    strain_id:           strainId,
    locus_tag:           locus,
    gene_name:           (row['FullGeneName'] || '').trim() || null,
    gene_symbol:         (row['GeneName']     || '').trim() || null,
    functional_category: funcCat,
    is_membrane_protein: parseBool(row['Mem true']),
    is_hypothetical:     parseBool(row['Hyp true']),
    is_dna_binding:      parseBool(row['DNA true']),
    is_t3_secreted:      parseBool(row['Secr true']),
    is_characterized:    !parseBool(row['Hyp true']), // hypothetical → not characterized
    end_bp:              isNaN(lengthBp) ? null : lengthBp,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Fetch strain UUIDs once
  const { data: strains, error: strainErr } = await supabase
    .from('strains')
    .select('id, common_name');

  if (strainErr) {
    console.error('Failed to fetch strains:', strainErr.message);
    process.exit(1);
  }

  const strainMap = Object.fromEntries(strains.map(s => [s.common_name, s.id]));
  console.log('Strains found:', Object.keys(strainMap).join(', '));

  let totalInserted = 0;
  let totalSkipped  = 0;

  for (const { file, commonName } of STRAIN_FILES) {
    const strainId = strainMap[commonName];
    if (!strainId) {
      console.warn(`⚠️  No strain found for "${commonName}" — skipping ${file}`);
      continue;
    }

    const filePath = path.join(CSV_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${filePath} — skipping`);
      continue;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const rows = parse(raw, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
      relax_quotes:     true,
    });

    const genes = rows.map(r => mapRow(r, strainId)).filter(Boolean);
    console.log(`\n${commonName} (${file}): ${genes.length} genes parsed`);

    // Upsert in batches
    let inserted = 0;
    for (let i = 0; i < genes.length; i += BATCH_SIZE) {
      const batch = genes.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('genes')
        .upsert(batch, { onConflict: 'strain_id,locus_tag' });

      if (error) {
        console.error(`  ✗ Batch ${i}–${i + batch.length} failed:`, error.message);
      } else {
        inserted += batch.length;
        process.stdout.write(`  ✓ ${inserted}/${genes.length}\r`);
      }
    }

    console.log(`  ✓ ${inserted} rows upserted for ${commonName}   `);
    totalInserted += inserted;
    totalSkipped  += (genes.length - inserted);
  }

  console.log(`\nDone. ${totalInserted} total rows inserted/updated, ${totalSkipped} failed.`);
  console.log('\nColumns skipped (import these separately later):');
  console.log('  → proteins table:         Product, Mass (kD), Uniprot ID, Protein Family,');
  console.log('                            Biological Process, Molecular Function, etc.');
  console.log('  → alphafold_results table: AlphaFold ID, AFImageURL, Structural homology');
  console.log('  → expression_data table:  EB, RB, Microarray / 1h–40h timepoints');
  console.log('  → orthologs table:        OrthologID_D, OrthologID_L2, OrthologID_CM');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
