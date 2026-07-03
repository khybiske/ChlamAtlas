#!/usr/bin/env node
/**
 * Exports each strain's protein sequences to a FASTA file for BLAST.
 * FASTA header is the locus_tag (canonical gene identifier) so BLAST hit
 * IDs map directly back to genes without an extra lookup table.
 *
 * Usage:
 *   node data/export_strain_fasta.js
 *
 * Output: data/blast/fasta/<common_name>.fasta (one per strain: Cpn, CT-D, CT-L2, CM)
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const OUT_DIR = path.join(__dirname, 'blast', 'fasta');
const STRAINS = ['Cpn', 'CT-D', 'CT-L2', 'CM'];

async function exportStrain(supabase, commonName) {
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', commonName).single();
  if (strainErr || !strainRow) { console.error(`Strain "${commonName}" not found.`); process.exit(1); }

  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes')
      .select('locus_tag, proteins(aa_sequence)')
      .eq('strain_id', strainRow.id)
      .range(from, from + 999);
    if (error) { console.error(`Failed to fetch genes for ${commonName}:`, error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  let written = 0, skipped = 0;
  const lines = [];
  for (const g of rows) {
    // PostgREST collapses one-to-many embeds to a single object only when it detects
    // a genuine one-to-one relationship; guard against it ever returning an array instead.
    const proteinRow = Array.isArray(g.proteins) ? g.proteins[0] : g.proteins;
    const seq = proteinRow?.aa_sequence;
    if (!seq) { skipped++; continue; }
    lines.push(`>${g.locus_tag}`);
    lines.push(seq);
    written++;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${commonName}.fasta`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`  ${commonName}: ${written} sequences written to ${outPath} (${skipped} skipped, no aa_sequence)`);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  for (const commonName of STRAINS) {
    await exportStrain(supabase, commonName);
  }
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
