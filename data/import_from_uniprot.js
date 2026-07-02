#!/usr/bin/env node
/**
 * Generic UniProt proteome importer — populates genes + proteins for any
 * strain sourced directly from UniProt (as opposed to a curated ChlamDB CSV).
 *
 * Usage:
 *   node data/import_from_uniprot.js --proteome=UP000000424 --strain=Cpn --locus-prefix=CpB
 *   node data/import_from_uniprot.js --proteome=UP000000424 --strain=Cpn --locus-prefix=CpB --dry-run
 *   node data/import_from_uniprot.js --proteome=UP000000424 --strain=Cpn --locus-prefix=CpB --limit=20
 *
 * The target strain must already exist in the `strains` table (common_name
 * match) — this script only populates genes/proteins, not the strain row.
 */

const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const BATCH_SIZE = 200;
const UNIPROT_FIELDS = [
  'accession', 'gene_oln', 'gene_primary', 'gene_synonym',
  'protein_name', 'length', 'mass', 'cc_function', 'cc_subcellular_location',
].join(',');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  if (!args.proteome || !args.strain || !args['locus-prefix']) {
    console.error('Usage: node data/import_from_uniprot.js --proteome=<UPxxxxxxxxxx> --strain=<common_name> --locus-prefix=<prefix> [--dry-run] [--limit=N]');
    process.exit(1);
  }
  return {
    proteome:    args.proteome,
    strain:      args.strain,
    locusPrefix: args['locus-prefix'],
    dryRun:      !!args['dry-run'],
    limit:       args.limit ? parseInt(args.limit, 10) : null,
  };
}

/** Strip UniProt bracket/paren annotation cruft from a protein name, same convention as import_genes.js. */
function cleanProduct(s) {
  if (!s) return s;
  s = s.replace(/\s*\[(?:Includes|Cleaved into):[\s\S]*$/i, '');
  const annotParen = /\s+\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)(?!-)/g;
  s = s.replace(annotParen, '');
  s = s.replace(annotParen, '');
  return s.trim();
}

/** Strip "FUNCTION: " / "SUBCELLULAR LOCATION: " prefixes and {ECO:...} evidence tags from UniProt CC fields. */
function cleanCcField(s, prefix) {
  if (!s) return null;
  let out = s.replace(new RegExp(`^${prefix}:\\s*`), '');
  out = out.replace(/\{ECO:[^}]*\}/g, '').trim();
  out = out.replace(/\s{2,}/g, ' ');
  return out || null;
}

/** Pull this strain's own locus tag out of UniProt's space-separated ordered-locus-name list. */
function extractLocusTag(geneOln, prefix) {
  if (!geneOln) return null;
  const tokens = geneOln.split(/\s+/);
  return tokens.find(t => t.startsWith(prefix)) || null;
}

/** Fetch every row of a UniProt proteome as parsed TSV objects, following Link-header pagination. */
async function fetchUniprotProteome(proteomeId, limit) {
  const rows = [];
  let url = `https://rest.uniprot.org/uniprotkb/search?query=proteome:${proteomeId}&format=tsv&fields=${UNIPROT_FIELDS}&size=500`;

  while (url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChlamAtlas/1.0 (khybiske@uw.edu; research use)' },
    });
    if (!res.ok) throw new Error(`UniProt fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const parsed = parse(text, { columns: true, delimiter: '\t', skip_empty_lines: true, trim: true, bom: true });
    rows.push(...parsed);
    if (limit && rows.length >= limit) return rows.slice(0, limit);

    const linkHeader = res.headers.get('link');
    const nextMatch = linkHeader && linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }
  return rows;
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

async function main() {
  const { proteome, strain, locusPrefix, dryRun, limit } = parseArgs();
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(`Looking up strain "${strain}"...`);
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id, common_name').eq('common_name', strain).single();
  if (strainErr || !strainRow) {
    console.error(`Strain "${strain}" not found. Create it first (see schema/migrations/030_add_cpn_strain.sql for the pattern).`);
    process.exit(1);
  }
  console.log(`  Found strain_id: ${strainRow.id}`);

  console.log(`Fetching proteome ${proteome} from UniProt...`);
  const uniRows = await fetchUniprotProteome(proteome, limit);
  console.log(`  ${uniRows.length} entries fetched`);

  const geneRows = [];
  const skippedNoLocus = [];
  for (const row of uniRows) {
    const locusTag = extractLocusTag(row['Gene Names (ordered locus)'], locusPrefix);
    if (!locusTag) { skippedNoLocus.push(row['Entry']); continue; }

    const symbol = (row['Gene Names (primary)'] || '').trim() || null;
    const synonyms = (row['Gene Names (synonym)'] || '').trim();
    const productRaw = cleanProduct((row['Protein names'] || '').trim());
    const isHypothetical = /^uncharacterized protein$/i.test(productRaw || '');
    const localization = cleanCcField(row['Subcellular location [CC]'], 'SUBCELLULAR LOCATION');

    geneRows.push({
      strain_id:           strainRow.id,
      locus_tag:           locusTag,
      gene_name:           symbol,
      gene_symbol:         symbol,
      aliases:             synonyms ? synonyms.split(/\s+/) : null,
      product:             productRaw || null,
      is_characterized:    !isHypothetical,
      is_hypothetical:     isHypothetical,
      is_membrane_protein: /membrane/i.test(localization || ''),
      _uniprot:            row, // carried through to build proteins rows below; stripped before upsert
    });
  }

  console.log(`  ${geneRows.length} genes mapped, ${skippedNoLocus.length} skipped (no "${locusPrefix}" locus tag)`);
  if (skippedNoLocus.length) console.log(`  Skipped accessions (first 10): ${skippedNoLocus.slice(0, 10).join(', ')}`);

  if (dryRun) {
    console.log('\n[dry-run] Sample of first 3 gene rows that would be upserted:');
    console.log(geneRows.slice(0, 3).map(({ _uniprot, ...g }) => g));
    console.log(`\n[dry-run] No writes performed. ${geneRows.length} genes, ${geneRows.length} proteins would be upserted.`);
    return;
  }

  const geneRowsClean = geneRows.map(({ _uniprot, ...g }) => g);
  const { succeeded: genesOk, failed: genesFailed } = await batchUpsert(
    supabase, 'genes', geneRowsClean, 'strain_id,locus_tag');
  console.log(`Genes: ${genesOk}/${geneRowsClean.length} upserted${genesFailed ? ` (${genesFailed} failed)` : ''}`);

  console.log('Re-fetching gene UUIDs to link proteins...');
  // Paginate: PostgREST caps unbounded selects at its default max-rows (often 1000),
  // which silently truncates results for strains with >1000 genes.
  const insertedGenes = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: fetchErr } = await supabase
      .from('genes').select('id, locus_tag').eq('strain_id', strainRow.id)
      .range(from, from + 999);
    if (fetchErr) { console.error('Failed to re-fetch genes:', fetchErr.message); process.exit(1); }
    insertedGenes.push(...page);
    if (page.length < 1000) break;
  }
  const locusToGeneId = Object.fromEntries(insertedGenes.map(g => [g.locus_tag, g.id]));

  const proteinRows = [];
  for (const g of geneRows) {
    const geneId = locusToGeneId[g.locus_tag];
    if (!geneId) continue;
    const row = g._uniprot;
    const massDa = parseFloat((row['Mass'] || '').replace(/,/g, ''));
    const lengthAa = parseInt(row['Length'], 10);
    proteinRows.push({
      gene_id:            geneId,
      uniprot_id:         row['Entry'],
      mass_kd:            isNaN(massDa) ? null : Math.round((massDa / 1000) * 10) / 10,
      length_aa:          isNaN(lengthAa) ? null : lengthAa,
      function_narrative: cleanCcField(row['Function [CC]'], 'FUNCTION'),
      localization:       cleanCcField(row['Subcellular location [CC]'], 'SUBCELLULAR LOCATION'),
    });
  }

  const { succeeded: protOk, failed: protFailed } = await batchUpsert(
    supabase, 'proteins', proteinRows, 'gene_id');
  console.log(`Proteins: ${protOk}/${proteinRows.length} upserted${protFailed ? ` (${protFailed} failed)` : ''}`);

  console.log('\nDone.');
  if (genesFailed > 0 || protFailed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
