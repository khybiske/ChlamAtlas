/**
 * Fetches CDS nucleotide (dna_sequence) and amino acid (aa_sequence) sequences
 * from NCBI for all three Chlamydia strains and upserts them into Supabase.
 *
 * Usage:
 *   node data/fetch_sequences.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env (root of repo).
 * Reads .env manually — no dotenv dependency needed.
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
}
const SUPABASE_URL         = env.SUPABASE_URL         || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Strain → original INSDC accession ────────────────────────────────────────
// We use the original INSDC (GenBank/EMBL) submissions, NOT the RefSeq NC_ records.
// The RefSeq records have been reannotated with new CTL_RS##### locus tags that the
// field does not use. The INSDC originals retain the community locus tags (CTL0001,
// CT001, TC0001) that are canonical in ChlamAtlas and all published literature.
//
//   CT-L2  AM884176.1  (Thomson et al. 2008, Sanger; RefSeq NC_010287 is identical)
//   CT-D   AE001273.1  (Stephens et al. 1998; RefSeq NC_000117 is identical)
//   CM     AE002160.2  (Ying et al. 2000; RefSeq NC_002620 is identical)
const STRAINS = [
  { common_name: 'CT-L2', accession: 'AM884176.1' },
  { common_name: 'CT-D',  accession: 'AE001273.1' },
  { common_name: 'CM',    accession: 'AE002160.2' },
];

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const EMAIL     = 'khybiske@uw.edu'; // identifies requests to NCBI

// ── NCBI fetch helper ─────────────────────────────────────────────────────────
function fetchNcbi(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── FASTA parser ──────────────────────────────────────────────────────────────
// Returns Map<locus_tag, sequence>
// Normalizes locus tags to match ChlamAtlas DB format:
//   CT_001 → CT001  (AE001273 INSDC uses underscore; DB does not)
//   TC_0001 → TC0001 (AE002160 same issue)
function normalizeLocus(tag) {
  // Strip internal underscores between letter prefix and numeric suffix
  // e.g. CT_001 → CT001, TC_0001 → TC0001. CTL0001 is unchanged (no underscore).
  return tag.replace(/^([A-Za-z]+)_(\d+)$/, '$1$2');
}

function parseFasta(text) {
  const map = new Map();
  let currentTag = null;
  let seqParts   = [];

  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      if (currentTag) map.set(currentTag, seqParts.join(''));
      const m = line.match(/\[locus_tag=([^\]]+)\]/);
      currentTag = m ? normalizeLocus(m[1]) : null;
      seqParts   = [];
    } else if (currentTag) {
      seqParts.push(line.trim());
    }
  }
  if (currentTag) map.set(currentTag, seqParts.join(''));
  return map;
}

// ── Batch update helper ───────────────────────────────────────────────────────
// Runs concurrent UPDATE ... WHERE id = ? calls (no INSERT, avoids NOT NULL issues).
async function batchUpdate(table, rows, valueField) {
  const CONCURRENT = 25;
  let updated = 0;
  for (let i = 0; i < rows.length; i += CONCURRENT) {
    const batch = rows.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      batch.map(row =>
        sb.from(table).update({ [valueField]: row[valueField] }).eq('id', row.id)
      )
    );
    results.forEach(({ error }) => {
      if (error) console.error(`  update error on ${table}:`, error.message);
      else updated++;
    });
  }
  return updated;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Load all genes from DB: id, locus_tag, strain common_name
  console.log('Loading genes from Supabase…');
  const { data: genes, error: gErr } = await sb
    .from('genes')
    .select('id, locus_tag, strains!inner(common_name)');
  if (gErr) { console.error(gErr); process.exit(1); }
  console.log(`  ${genes.length} genes loaded`);

  // 2. Load all proteins from DB: id, gene_id
  console.log('Loading proteins from Supabase…');
  const { data: proteins, error: pErr } = await sb
    .from('proteins')
    .select('id, gene_id');
  if (pErr) { console.error(pErr); process.exit(1); }
  const proteinByGeneId = new Map(proteins.map(p => [p.gene_id, p.id]));
  console.log(`  ${proteins.length} proteins loaded`);

  // Index genes by [strain common_name][locus_tag] → gene
  const geneIndex = new Map(); // "CT-L2:CTL0001" → { id, locus_tag }
  for (const g of genes) {
    const key = `${g.strains.common_name}:${g.locus_tag}`;
    geneIndex.set(key, g);
  }

  let totalDna = 0;
  let totalAa  = 0;

  for (const strain of STRAINS) {
    console.log(`\n── ${strain.common_name} (${strain.accession}) ──`);

    // 3. Fetch CDS nucleotide FASTA
    const ntUrl = `${NCBI_BASE}?db=nuccore&id=${strain.accession}` +
      `&rettype=fasta_cds_na&retmode=text&tool=ChlamAtlas&email=${EMAIL}`;
    console.log('  Fetching nt sequences…');
    await sleep(400); // stay well under NCBI rate limit
    const ntText = await fetchNcbi(ntUrl);
    const ntMap  = parseFasta(ntText);
    console.log(`  Parsed ${ntMap.size} nt sequences`);

    // 4. Fetch CDS amino acid FASTA
    const aaUrl = `${NCBI_BASE}?db=nuccore&id=${strain.accession}` +
      `&rettype=fasta_cds_aa&retmode=text&tool=ChlamAtlas&email=${EMAIL}`;
    console.log('  Fetching aa sequences…');
    await sleep(400);
    const aaText = await fetchNcbi(aaUrl);
    const aaMap  = parseFasta(aaText);
    console.log(`  Parsed ${aaMap.size} aa sequences`);

    // 5. Build gene update rows
    const geneRows    = [];
    const proteinRows = [];

    for (const [locusTag, dnaSeq] of ntMap) {
      const gene = geneIndex.get(`${strain.common_name}:${locusTag}`);
      if (!gene) continue;
      geneRows.push({ id: gene.id, dna_sequence: dnaSeq });
    }
    for (const [locusTag, aaSeq] of aaMap) {
      const gene = geneIndex.get(`${strain.common_name}:${locusTag}`);
      if (!gene) continue;
      const proteinId = proteinByGeneId.get(gene.id);
      if (!proteinId) continue;
      proteinRows.push({ id: proteinId, aa_sequence: aaSeq });
    }

    console.log(`  Matched ${geneRows.length} gene nt / ${proteinRows.length} protein aa rows`);

    // 6. Upsert
    if (geneRows.length) {
      const n = await batchUpdate('genes', geneRows, 'dna_sequence');
      console.log(`  Updated ${n} gene nt sequences`);
      totalDna += n;
    }
    if (proteinRows.length) {
      const n = await batchUpdate('proteins', proteinRows, 'aa_sequence');
      console.log(`  Updated ${n} protein aa sequences`);
      totalAa += n;
    }
  }

  console.log(`\nDone. ${totalDna} dna_sequence rows, ${totalAa} aa_sequence rows written.`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error(e); process.exit(1); });
