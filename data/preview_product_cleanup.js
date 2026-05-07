#!/usr/bin/env node
/**
 * Preview product field cleanup — shows before/after for all genes.product rows.
 * Does NOT modify any data.
 *
 * Run: SUPABASE_SERVICE_KEY=<key> node data/preview_product_cleanup.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

/**
 * Clean a UniProt product string:
 * 1. Strip [Includes: ...] and [Cleaved into: ...] blocks
 * 2. Strip annotation parentheticals (space-preceded paren groups, one level of nesting)
 * 3. Trim and collapse whitespace
 *
 * Preserves:
 * - Chemical notation like Na(+), K(+), (3R)- at string start
 * - [acyl-carrier-protein] and similar square-bracket biochemical terms
 * - Hyphens and other non-paren punctuation
 */
function cleanProduct(s) {
  if (!s) return s;

  // Step 1: strip [Includes: ...] and [Cleaved into: ...] blocks (to end of string)
  s = s.replace(/\s*\[(?:Includes|Cleaved into):[\s\S]*$/i, '');

  // Step 2: strip annotation parens — space + ( ... ) allowing one level of inner parens
  // Repeat twice to catch cases where two adjacent annotation groups remain
  const annotParen = /\s+\((?:[^()]*|\([^()]*\))*\)/g;
  s = s.replace(annotParen, '');
  s = s.replace(annotParen, '');

  // Step 3: trim
  return s.trim();
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Paginate through all genes with a product value
  const PAGE = 1000;
  let allGenes = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes')
      .select('id, locus_tag, product, strains(common_name)')
      .not('product', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allGenes = allGenes.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Fetched ${allGenes.length} genes with product values\n`);

  const changed   = [];
  const unchanged = [];
  const emptied   = [];   // cleaned to empty string — should not happen
  const suspicious = [];  // result is very short (< 8 chars) — flag for review

  for (const gene of allGenes) {
    const before = gene.product;
    const after  = cleanProduct(before);

    if (after === before) {
      unchanged.push(gene);
    } else if (!after) {
      emptied.push({ locus: gene.locus_tag, strain: gene.strains?.common_name, before });
    } else {
      changed.push({
        locus:  gene.locus_tag,
        strain: gene.strains?.common_name,
        before,
        after,
      });
      if (after.length < 8) {
        suspicious.push({ locus: gene.locus_tag, strain: gene.strains?.common_name, before, after });
      }
    }
  }

  console.log(`=== SUMMARY ===`);
  console.log(`  Unchanged: ${unchanged.length}`);
  console.log(`  Changed:   ${changed.length}`);
  console.log(`  Emptied:   ${emptied.length}  ← should be 0`);
  console.log(`  Suspicious (result < 8 chars): ${suspicious.length}`);

  if (emptied.length > 0) {
    console.log('\n=== EMPTIED (BUG — review immediately) ===');
    for (const r of emptied) console.log(`  [${r.strain}] ${r.locus}: ${JSON.stringify(r.before)}`);
  }

  if (suspicious.length > 0) {
    console.log('\n=== SUSPICIOUS (very short result) ===');
    for (const r of suspicious)
      console.log(`  [${r.strain}] ${r.locus}\n    BEFORE: ${r.before}\n    AFTER:  ${r.after}`);
  }

  // Show all changed rows for review
  console.log(`\n=== ALL CHANGED ROWS (${changed.length}) ===`);
  for (const r of changed) {
    console.log(`[${r.strain}] ${r.locus}`);
    console.log(`  BEFORE: ${r.before}`);
    console.log(`  AFTER:  ${r.after}`);
    console.log();
  }

  // Check for any result still containing [Includes or (EC — cleanup missed something
  const missed = changed.filter(r => /\(EC\s|\[(?:Includes|Cleaved into)/.test(r.after));
  if (missed.length > 0) {
    console.log(`\n=== CLEANUP INCOMPLETE (still has EC or [Includes) ===`);
    for (const r of missed)
      console.log(`  [${r.strain}] ${r.locus}: ${r.after}`);
  }
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
