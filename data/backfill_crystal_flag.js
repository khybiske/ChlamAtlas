#!/usr/bin/env node
// Backfills has_crystal_structure = true for proteins with a crystal entry in alphafold_results.
// Run: SUPABASE_SERVICE_KEY=<key> node data/backfill_crystal_flag.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ihobumwetoidqioifknt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Get all protein_ids that have a crystal row
  const { data: crystalRows, error: fetchErr } = await sb
    .from('alphafold_results')
    .select('protein_id')
    .eq('af_version', 'crystal');

  if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

  const proteinIds = [...new Set(crystalRows.map(r => r.protein_id))];
  console.log(`Found ${proteinIds.length} proteins with crystal structures.`);

  // Update in batches of 100
  for (let i = 0; i < proteinIds.length; i += 100) {
    const batch = proteinIds.slice(i, i + 100);
    const { error } = await sb
      .from('proteins')
      .update({ has_crystal_structure: true })
      .in('id', batch);
    if (error) { console.error('update error:', error); process.exit(1); }
    console.log(`Updated ${i + batch.length} / ${proteinIds.length}`);
  }

  console.log('Done — has_crystal_structure backfill complete.');
}

main();
