#!/usr/bin/env node
/**
 * Searches RCSB PDB for structures of Chlamydia pneumoniae proteins
 * (species-level taxid — any Cpn strain, not just TW-183) and matches them
 * back to Cpn (TW-183) genes in our database: directly by UniProt accession,
 * or via gene_symbol when the structure was deposited under a different
 * Cpn strain's accession.
 *
 * READ-ONLY: this script never writes to Supabase. It's a discovery tool —
 * review its output, then hand-add approved entries to the CRYSTAL_DATA
 * array in data/import_crystal_structures.js and run that script to insert.
 *
 * Usage:
 *   node data/search_cpn_crystal_structures.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL
  || (() => { console.error('Error: set SUPABASE_URL env var'); process.exit(1); })();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || (() => { console.error('Error: set SUPABASE_SERVICE_KEY env var'); process.exit(1); })();

const CPN_SPECIES_TAXID = '83558'; // species-level: catches all Cpn strains' deposits

async function rcsbSearch() {
  const res = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: {
        type: 'terminal',
        service: 'text',
        parameters: {
          attribute: 'rcsb_entity_source_organism.taxonomy_lineage.id',
          operator: 'exact_match',
          value: CPN_SPECIES_TAXID,
        },
      },
      return_type: 'polymer_entity',
      // RCSB defaults to a 10-row page even when total_count is higher; request
      // a generous page size so results aren't silently truncated.
      request_options: {
        paginate: { start: 0, rows: 10000 },
      },
    }),
  });
  if (!res.ok) throw new Error(`RCSB search failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return (json.result_set || []).map(r => r.identifier); // e.g. "4NRH_1"
}

async function fetchEntityDetails(identifier) {
  const [pdbId, entityNum] = identifier.split('_');
  const res = await fetch(`https://data.rcsb.org/rest/v1/core/polymer_entity/${pdbId}/${entityNum}`);
  if (!res.ok) return null;
  const json = await res.json();
  return {
    pdbId,
    description: json.rcsb_polymer_entity?.pdbx_description || null,
    uniprotIds:  json.rcsb_polymer_entity_container_identifiers?.uniprot_ids || [],
  };
}

async function fetchUniprotGeneSymbol(accession) {
  const res = await fetch(`https://rest.uniprot.org/uniprotkb/${accession}.json`, {
    headers: { 'User-Agent': 'ChlamAtlas/1.0 (khybiske@uw.edu; research use)' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.genes?.[0]?.geneName?.value || null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('Looking up Cpn strain...');
  const { data: strainRow, error: strainErr } = await supabase
    .from('strains').select('id').eq('common_name', 'Cpn').single();
  if (strainErr || !strainRow) { console.error('Strain "Cpn" not found.'); process.exit(1); }

  console.log('Fetching Cpn genes (locus_tag, gene_symbol, uniprot_id)...');
  const genesByUniprot = {};
  const genesBySymbol  = {};
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('genes')
      .select('locus_tag, gene_symbol, proteins(uniprot_id)')
      .eq('strain_id', strainRow.id)
      .range(from, from + 999);
    if (error) { console.error('Failed to fetch genes:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const g of data) {
      const uid = g.proteins?.uniprot_id;
      if (uid) genesByUniprot[uid] = g;
      if (g.gene_symbol) genesBySymbol[g.gene_symbol.toLowerCase()] = g;
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  ${Object.keys(genesByUniprot).length} genes with uniprot_id, ${Object.keys(genesBySymbol).length} with gene_symbol`);

  console.log(`Searching RCSB for Cpn structures (species taxid ${CPN_SPECIES_TAXID})...`);
  const identifiers = await rcsbSearch();
  console.log(`  ${identifiers.length} polymer entities found`);

  const candidates = [];
  const unmatched   = [];
  for (const id of identifiers) {
    const entity = await fetchEntityDetails(id);
    if (!entity || entity.uniprotIds.length === 0) {
      unmatched.push({ id, reason: 'no UniProt accession on entity' });
      continue;
    }

    let matchedGene  = null;
    let matchMethod  = null;
    for (const uid of entity.uniprotIds) {
      if (genesByUniprot[uid]) { matchedGene = genesByUniprot[uid]; matchMethod = 'direct (uniprot_id)'; break; }
    }
    if (!matchedGene) {
      for (const uid of entity.uniprotIds) {
        const symbol = await fetchUniprotGeneSymbol(uid);
        if (symbol && genesBySymbol[symbol.toLowerCase()]) {
          matchedGene = genesBySymbol[symbol.toLowerCase()];
          matchMethod = `gene_symbol (deposited under ${uid}, symbol "${symbol}")`;
          break;
        }
      }
    }

    if (matchedGene) {
      candidates.push({
        pdb_id:       entity.pdbId,
        locus_tag:    matchedGene.locus_tag,
        gene_symbol:  matchedGene.gene_symbol,
        description:  entity.description,
        match_method: matchMethod,
      });
    } else {
      unmatched.push({ id, uniprotIds: entity.uniprotIds, description: entity.description, reason: 'no matching Cpn gene' });
    }
  }

  console.log(`\n=== Matched candidates (${candidates.length}) ===`);
  for (const c of candidates) {
    console.log(`  ${c.locus_tag.padEnd(10)} ${(c.gene_symbol || '(unnamed)').padEnd(12)} PDB ${c.pdb_id}  [${c.match_method}]  ${c.description || ''}`);
  }

  console.log(`\n=== Unmatched RCSB entities (${unmatched.length}) ===`);
  for (const u of unmatched) {
    console.log(`  ${u.id}  ${u.reason}${u.description ? '  ' + u.description : ''}`);
  }

  console.log('\nThis script performed NO database writes. Review the candidates above with Kevin, ' +
              "then add approved entries to data/import_crystal_structures.js's CRYSTAL_DATA array " +
              'and run that script to insert.');
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
