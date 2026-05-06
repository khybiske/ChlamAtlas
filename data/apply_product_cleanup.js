#!/usr/bin/env node
/**
 * Apply product field cleanup to genes table.
 *
 * Cleaning rules:
 *   1. Strip [Includes: ...] and [Cleaved into: ...] blocks
 *   2. Strip annotation parentheticals (space-preceded paren groups, one level nesting)
 *      Exception: paren groups immediately followed by '-' are part of the primary name
 *      e.g. tRNA (guanine-N(7)-)-methyltransferase — the (guanine-N(7)-) is kept
 *   3. Manual override: restore (Glutamate) in "Neutral Amino Acid (Glutamate) Transporter"
 *
 * Run: SUPABASE_SERVICE_KEY=<key> node data/apply_product_cleanup.js
 * Dry run (preview only): SUPABASE_SERVICE_KEY=<key> node data/apply_product_cleanup.js --dry-run
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const DRY_RUN = process.argv.includes('--dry-run');

function cleanProduct(s) {
  if (!s) return s;

  // Step 1: strip [Includes: ...] and [Cleaved into: ...] blocks (to end of string)
  s = s.replace(/\s*\[(?:Includes|Cleaved into):[\s\S]*$/i, '');

  // Step 2: strip annotation parens — space + ( ... ) allowing two levels of inner parens.
  // The (?!-) negative lookahead preserves hyphen-connected groups that are part of the
  // primary name, e.g. tRNA (guanine-N(7)-)-methyltransferase.
  // Two levels handles synonyms like (tRNA (guanine(46)-N(7))-methyltransferase).
  const annotParen = /\s+\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)(?!-)/g;
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
  console.log(`Fetched ${allGenes.length} genes with product values`);

  // Build list of rows that need updating
  const updates = [];
  for (const gene of allGenes) {
    let after = cleanProduct(gene.product);

    // Manual override: restore substrate specificity for Glutamate transporter
    if (after === 'Neutral Amino Acid Transporter') {
      after = 'Neutral Amino Acid (Glutamate) Transporter';
    }

    if (after !== gene.product) {
      updates.push({ id: gene.id, locus_tag: gene.locus_tag, strain: gene.strains?.common_name, before: gene.product, after });
    }
  }

  console.log(`\n${updates.length} rows to update`);
  if (DRY_RUN) {
    console.log('\n[DRY RUN — no changes written]\n');
    for (const u of updates) {
      console.log(`[${u.strain}] ${u.locus_tag}`);
      console.log(`  BEFORE: ${u.before}`);
      console.log(`  AFTER:  ${u.after}`);
      console.log();
    }
    return;
  }

  // Apply updates in batches
  const BATCH = 50;
  let succeeded = 0, failed = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) {
      const { error } = await supabase
        .from('genes')
        .update({ product: u.after })
        .eq('id', u.id);
      if (error) {
        console.error(`  ✗ ${u.locus_tag}: ${error.message}`);
        failed++;
      } else {
        succeeded++;
      }
    }
    process.stdout.write(`  Updated ${Math.min(i + BATCH, updates.length)}/${updates.length}\r`);
  }

  console.log(`\n✓ ${succeeded} rows updated, ${failed} failed`);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
