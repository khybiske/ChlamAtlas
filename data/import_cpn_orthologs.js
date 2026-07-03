#!/usr/bin/env node
/**
 * Parses reciprocal BLASTP hit files (from run_blast.sh) and computes Cpn
 * orthologs against CT-D, CT-L2, and CM using a "union of one-way best hits"
 * method: for each gene, take its best hit (highest bitscore) in the other
 * strain that clears the confirmed threshold (>=35% identity, >=70% query
 * coverage). A pair is included if EITHER direction's best hit produced it
 * — this captures co-orthologs from Cpn's known lineage-specific gene
 * duplications, which strict reciprocal-best-hit (requiring both directions
 * to agree) would miss. See docs/superpowers/specs/2026-07-02-cpn-addition-phase3-design.md.
 *
 * Usage:
 *   node data/import_cpn_orthologs.js --dry-run
 *   node data/import_cpn_orthologs.js
 *
 * Prerequisite: data/blast/run_blast.sh already run (hit files present in data/blast/hits/)
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN       = process.argv.includes('--dry-run');
const HITS_DIR      = path.join(__dirname, 'blast', 'hits');
const OTHER_STRAINS = ['CT-D', 'CT-L2', 'CM'];
const MIN_IDENTITY  = 35;   // percent
const MIN_COVERAGE  = 0.70; // fraction
const BATCH_SIZE    = 200;

/** Parse a BLASTP outfmt6 file (qseqid sseqid pident length qlen slen qstart qend bitscore). */
function parseHits(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map(line => {
    const [qseqid, sseqid, pident, length, qlen, slen, qstart, qend, bitscore] = line.split('\t');
    return {
      qseqid, sseqid,
      pident:   parseFloat(pident),
      qlen:     parseInt(qlen, 10),
      qstart:   parseInt(qstart, 10),
      qend:     parseInt(qend, 10),
      bitscore: parseFloat(bitscore),
    };
  });
}

/** Best hit per query (by bitscore) that clears the confirmed threshold. Returns Map<qseqid, {sseqid, pident, bitscore}>. */
function bestHitsAboveThreshold(hits) {
  const best = new Map();
  for (const h of hits) {
    const coverage = (h.qend - h.qstart + 1) / h.qlen;
    if (h.pident < MIN_IDENTITY || coverage < MIN_COVERAGE) continue;
    const existing = best.get(h.qseqid);
    if (!existing || h.bitscore > existing.bitscore) {
      best.set(h.qseqid, { sseqid: h.sseqid, pident: h.pident, bitscore: h.bitscore });
    }
  }
  return best;
}

/** Fetch { id: strainId, map: { locus_tag: gene_id } } for a strain. */
async function fetchLocusMap(supabase, commonName) {
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', commonName).single();
  if (strainErr || !strainRow) { console.error(`Strain "${commonName}" not found.`); process.exit(1); }

  const map = {};
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes').select('id, locus_tag').eq('strain_id', strainRow.id).range(from, from + 999);
    if (error) { console.error(`Failed to fetch genes for ${commonName}:`, error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const g of data) map[g.locus_tag] = g.id;
    if (data.length < 1000) break;
    from += 1000;
  }
  return { id: strainRow.id, map };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Fetching gene locus maps...');
  const cpnStrain = await fetchLocusMap(supabase, 'Cpn');
  const otherStrains = {};
  for (const s of OTHER_STRAINS) otherStrains[s] = await fetchLocusMap(supabase, s);
  console.log(`  Cpn: ${Object.keys(cpnStrain.map).length} genes`);
  for (const s of OTHER_STRAINS) console.log(`  ${s}: ${Object.keys(otherStrains[s].map).length} genes`);

  const pairs = new Map(); // key: "geneIdA|geneIdB" (sorted) -> ortholog row

  function addPair(cpnLocus, otherLocus, other, pident) {
    const geneA = cpnStrain.map[cpnLocus];
    const geneB = other.map[otherLocus];
    if (!geneA || !geneB) return;
    const [gA, gB] = geneA < geneB ? [geneA, geneB] : [geneB, geneA];
    const [sA, sB] = geneA < geneB ? [cpnStrain.id, other.id] : [other.id, cpnStrain.id];
    const key = `${gA}|${gB}`;
    const confidence = Math.round((pident / 100) * 100) / 100; // 2 decimal places, fits numeric(3,2)
    if (!pairs.has(key)) {
      pairs.set(key, { gene_id_a: gA, gene_id_b: gB, strain_id_a: sA, strain_id_b: sB, method: 'reciprocal_blast', confidence });
    }
  }

  for (const strainName of OTHER_STRAINS) {
    const other = otherStrains[strainName];

    // Direction 1: Cpn -> strain
    const hits1 = parseHits(path.join(HITS_DIR, `Cpn_vs_${strainName}.tsv`));
    const best1 = bestHitsAboveThreshold(hits1);
    for (const [cpnLocus, hit] of best1) {
      addPair(cpnLocus, hit.sseqid, other, hit.pident);
    }

    // Direction 2: strain -> Cpn
    const hits2 = parseHits(path.join(HITS_DIR, `${strainName}_vs_Cpn.tsv`));
    const best2 = bestHitsAboveThreshold(hits2);
    for (const [otherLocus, hit] of best2) {
      addPair(hit.sseqid, otherLocus, other, hit.pident);
    }

    console.log(`  ${strainName}: ${best1.size} Cpn->${strainName} best hits, ${best2.size} ${strainName}->Cpn best hits`);
  }

  const rows = Array.from(pairs.values());
  console.log(`\n${rows.length} total ortholog pairs (union of best hits, confirmed threshold only)`);

  // Duplication-capture QC: for each trio-strain gene, count distinct Cpn genes paired to it.
  // (Derived from the final deduplicated pairs, not raw hit-direction events, so an ordinary
  // conserved gene appearing in both directions/multiple strains isn't miscounted as "duplicated."
  // The real signature of a duplication event is one CT-D/CT-L2/CM gene mapping to >1 distinct
  // Cpn co-ortholog.)
  const partnersByTrioGene = new Map(); // trioGeneId -> Set<cpnGeneId>
  for (const row of rows) {
    const isACpn = row.strain_id_a === cpnStrain.id;
    const cpnGeneId  = isACpn ? row.gene_id_a : row.gene_id_b;
    const trioGeneId = isACpn ? row.gene_id_b : row.gene_id_a;
    if (!partnersByTrioGene.has(trioGeneId)) partnersByTrioGene.set(trioGeneId, new Set());
    partnersByTrioGene.get(trioGeneId).add(cpnGeneId);
  }
  const duplicated = Array.from(partnersByTrioGene.entries()).filter(([, cpnGenes]) => cpnGenes.size > 1);
  console.log(`Duplication-capture check: ${duplicated.length} trio-strain genes with >1 distinct Cpn ortholog`);
  if (duplicated.length > 0) {
    console.log('  Example trio-gene IDs (first 5):', duplicated.slice(0, 5).map(([geneId, set]) => `${geneId} (${set.size} Cpn orthologs)`).join(', '));
  }

  if (DRY_RUN) {
    console.log('[dry-run] Sample of first 5 pairs:');
    console.log(rows.slice(0, 5));
    console.log('[dry-run] No writes performed.');
    return;
  }

  let succeeded = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('orthologs').upsert(batch, { onConflict: 'gene_id_a,gene_id_b' });
    if (error) { console.error(`  ✗ batch ${i}: ${error.message}`); failed += batch.length; }
    else succeeded += batch.length;
  }
  console.log(`Done: ${succeeded} upserted, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
