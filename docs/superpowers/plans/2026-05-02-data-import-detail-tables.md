# Data Import: Proteins, Structure, Expression, Orthologs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `proteins`, `alphafold_results`, `expression_data`, and `orthologs` tables from the three gene CSVs so the gene detail panel shows real data instead of empty states.

**Architecture:** Single Node.js import script (`data/import_detail_data.js`) with four sequential phases; a `--phase=X` flag allows running each independently. A small schema migration adds `pattern_label text` to `expression_data`. A two-line patch to `genomes.js` switches the CT-L2 qualitative transcriptomics display to use the new column.

**Tech Stack:** Node.js (CommonJS), `csv-parse`, `@supabase/supabase-js`. All packages already installed. Run with `SUPABASE_SERVICE_KEY` env var set.

---

## Files

| File | Action |
|---|---|
| `supabase/migrations/006_expression_pattern_label.sql` | Create — schema migration |
| `web/js/views/genomes.js` | Patch lines 901–903 — use `pattern_label` instead of `eb_expression` |
| `data/import_detail_data.js` | Create — full import script with four phases |

---

## Task 1: Schema Migration + Frontend Patch

**Files:**
- Create: `supabase/migrations/006_expression_pattern_label.sql`
- Modify: `web/js/views/genomes.js:901-903`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/006_expression_pattern_label.sql` with this exact content:

```sql
-- Adds qualitative expression pattern label for CT-L2 microarray data.
-- eb_expression is typed numeric and cannot store text pattern strings.
ALTER TABLE public.expression_data
  ADD COLUMN IF NOT EXISTS pattern_label text;
```

- [ ] **Step 2: Run the migration in Supabase**

Go to https://supabase.com/dashboard/project/ihobumwetoidqioifknt/sql/new and paste + run the SQL above.

Expected: no error, query executes successfully.

- [ ] **Step 3: Patch genomes.js — replace the CT-L2 qualitative branch**

In `web/js/views/genomes.js`, replace lines 901–903:

Old:
```js
  // CT-L2 qualitative case: all numeric values are 0 but eb_expression has a pattern label
  if (values.every(v => v === 0) && sorted[0]?.eb_expression) {
    const pattern = String(sorted[0].eb_expression ?? 'Unknown').toUpperCase().replace('_', ' ');
```

New:
```js
  // CT-L2 qualitative case: pattern_label column holds the expression pattern string
  if (sorted[0]?.pattern_label) {
    const pattern = String(sorted[0].pattern_label ?? 'Unknown').toUpperCase().replace('_', ' ');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_expression_pattern_label.sql web/js/views/genomes.js
git commit -m "feat: add pattern_label to expression_data, patch genomes.js transcriptomics branch"
```

---

## Task 2: Script Scaffolding, Helpers, and Gene UUID Map

**Files:**
- Create: `data/import_detail_data.js`

- [ ] **Step 1: Create the script with scaffolding, constants, and helpers**

Create `data/import_detail_data.js`:

```js
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
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true });
}

/** Upsert rows in batches; log errors per batch. Returns count of rows attempted. */
async function batchUpsert(supabase, table, rows, conflictCol) {
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCol });
    if (error) console.error(`  ✗ ${table} batch ${i}: ${error.message}`);
    else count += batch.length;
  }
  return count;
}

/** Insert rows in batches. Returns count of rows attempted. */
async function batchInsert(supabase, table, rows) {
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) console.error(`  ✗ ${table} batch ${i}: ${error.message}`);
    else count += batch.length;
  }
  return count;
}

// ── Gene UUID map ─────────────────────────────────────────────────────────────

/**
 * Returns { 'CT-L2': { 'CTL0001': uuid, ... }, 'CT-D': { ... }, 'CM': { ... } }
 */
async function buildGeneMaps(supabase) {
  const { data, error } = await supabase
    .from('genes')
    .select('id, locus_tag, strains(common_name)');
  if (error) { console.error('Failed to fetch genes:', error.message); process.exit(1); }

  const maps = {};
  for (const gene of data) {
    const cn = gene.strains?.common_name;
    if (!cn) continue;
    if (!maps[cn]) maps[cn] = {};
    maps[cn][gene.locus_tag] = gene.id;
  }
  console.log('Gene maps built:',
    Object.entries(maps).map(([k, v]) => `${k}: ${Object.keys(v).length}`).join(', '));
  return maps;
}

// ── Main (phases added in subsequent tasks) ───────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
```

- [ ] **Step 2: Verify the scaffold runs and gene maps load correctly**

```bash
cd /Users/khybiske/Developer/web/ChlamAtlas
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js
```

Expected output:
```
Gene maps built: CT-L2: 877, CT-D: 894, CM: 913
Running phase: all
```

(Exact counts may vary slightly; all three strains must appear with non-zero counts.)

- [ ] **Step 3: Commit**

```bash
git add data/import_detail_data.js
git commit -m "feat: import script scaffold with helpers and gene UUID map"
```

---

## Task 3: Phase 1 — Proteins

**Files:**
- Modify: `data/import_detail_data.js`

- [ ] **Step 1: Add `importProteins` function**

Add this function to `data/import_detail_data.js`, before the `main()` function:

```js
async function importProteins(supabase, geneMaps) {
  console.log('\n── Phase 1: Proteins ──────────────────────────');
  let totalInserted = 0, totalSkipped = 0;

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
        length_aa:        bpLen != null ? Math.round(bpLen / 3) : null,
        protein_family:   trimVal(row['Protein Family']),
        localization:     trimVal(row['Subcellular Location']),
        oligomeric_state: trimVal(row['Subunit Structure']),
      });
    }

    const inserted = await batchUpsert(supabase, 'proteins', proteins, 'gene_id');
    console.log(`  ${commonName}: ${inserted}/${proteins.length} proteins upserted`);
    totalInserted += inserted;
  }

  console.log(`  Total: ${totalInserted} proteins inserted, ${totalSkipped} genes skipped`);
}
```

- [ ] **Step 2: Call `importProteins` in `main()`**

Replace the `main()` function body:

```js
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);

  if (!PHASE || PHASE === 'proteins')  await importProteins(supabase, geneMaps);
}
```

- [ ] **Step 3: Run proteins phase only and verify**

```bash
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js --phase=proteins
```

Expected output:
```
Gene maps built: CT-L2: 877, CT-D: 894, CM: 913
Running phase: proteins

── Phase 1: Proteins ──────────────────────────
  CT-L2: 877/877 proteins upserted
  CT-D: 894/894 proteins upserted
  CM: 913/913 proteins upserted
  Total: 2684 proteins inserted, 0 genes skipped
```

(Total should be ~2684; minor variation is fine.)

Verify in Supabase Dashboard → Table Editor → `proteins`: row count should match.

- [ ] **Step 4: Commit**

```bash
git add data/import_detail_data.js
git commit -m "feat: import script Phase 1 — proteins"
```

---

## Task 4: Phase 2 — AlphaFold Results

**Files:**
- Modify: `data/import_detail_data.js`

- [ ] **Step 1: Add `importAlphaFold` function**

Add this function before `main()`:

```js
async function importAlphaFold(supabase, geneMaps) {
  console.log('\n── Phase 2: AlphaFold Results ─────────────────');

  // Build gene_id → protein_id lookup from what was just upserted
  const { data: prots, error: protErr } = await supabase
    .from('proteins')
    .select('id, gene_id');
  if (protErr) { console.error('Failed to fetch proteins:', protErr.message); return; }
  const protMap = Object.fromEntries(prots.map(p => [p.gene_id, p.id]));
  console.log(`  ${prots.length} proteins loaded for lookup`);

  let totalInserted = 0, totalSkipped = 0;

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
      const afVersion  = trimVal(row['Version']);
      if ((!afImageUrl && !afId) || !afVersion) continue; // no usable structure data

      const uniprotId = trimVal(row['Uniprot ID']);
      const mmcifPath = uniprotId
        ? `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_v4.cif`
        : null;

      // Column name differs between strain CSVs
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

    const inserted = await batchUpsert(supabase, 'alphafold_results', afRows, 'protein_id,af_version');
    console.log(`  ${commonName}: ${inserted}/${afRows.length} AF rows upserted`);
    totalInserted += inserted;
  }

  console.log(`  Total: ${totalInserted} AF rows, ${totalSkipped} proteins skipped`);
}
```

- [ ] **Step 2: Add `importAlphaFold` call to `main()`**

```js
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);

  if (!PHASE || PHASE === 'proteins')  await importProteins(supabase, geneMaps);
  if (!PHASE || PHASE === 'alphafold') await importAlphaFold(supabase, geneMaps);
}
```

- [ ] **Step 3: Run alphafold phase only and verify**

```bash
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js --phase=alphafold
```

Expected output:
```
── Phase 2: AlphaFold Results ─────────────────
  2684 proteins loaded for lookup
  CT-L2: ~877/877 AF rows upserted
  CT-D: ~894/894 AF rows upserted
  CM: ~913/913 AF rows upserted
  Total: ~2684 AF rows, 0 proteins skipped
```

Verify in Supabase Dashboard → `alphafold_results`: row count should be ~2684.
Spot-check one row: open a gene detail panel on the live site — the structure section thumbnail should now show an image instead of placeholder.

- [ ] **Step 4: Commit**

```bash
git add data/import_detail_data.js
git commit -m "feat: import script Phase 2 — alphafold_results"
```

---

## Task 5: Phase 3 — Expression Data

**Files:**
- Modify: `data/import_detail_data.js`

- [ ] **Step 1: Add `importExpression` function**

Add this function before `main()`:

```js
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

  let totalInserted = 0;

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
    for (let i = 0; i < geneIds.length; i += BATCH_SIZE) {
      const batch = geneIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('expression_data').delete().in('gene_id', batch);
      if (error) console.error('  ✗ Delete error:', error.message);
    }

    const inserted = await batchInsert(supabase, 'expression_data', exprRows);
    console.log(`  CT-D: ${inserted}/${exprRows.length} expression rows inserted`);
    totalInserted += inserted;
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
          value:         0,
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

    for (let i = 0; i < geneIds.length; i += BATCH_SIZE) {
      const batch = geneIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('expression_data').delete().in('gene_id', batch);
      if (error) console.error('  ✗ Delete error:', error.message);
    }

    const inserted = await batchInsert(supabase, 'expression_data', exprRows);
    console.log(`  CT-L2: ${inserted}/${exprRows.length} expression rows inserted`);
    totalInserted += inserted;
  }

  // CM: no expression data
  console.log(`  CM: skipped (no expression data in source)`);
  console.log(`  Total: ${totalInserted} expression rows`);
}
```

- [ ] **Step 2: Add `importExpression` call to `main()`**

```js
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);

  if (!PHASE || PHASE === 'proteins')   await importProteins(supabase, geneMaps);
  if (!PHASE || PHASE === 'alphafold')  await importAlphaFold(supabase, geneMaps);
  if (!PHASE || PHASE === 'expression') await importExpression(supabase, geneMaps);
}
```

- [ ] **Step 3: Run expression phase only and verify**

```bash
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js --phase=expression
```

Expected output:
```
── Phase 3: Expression Data ───────────────────
  CT-D: expression rows inserted  (6 microarray + ~1 proteomics per gene = ~5000–6000 rows)
  CT-L2: expression rows inserted (~1–2 rows per gene with data = ~1200–1600 rows)
  CM: skipped (no expression data in source)
  Total: ~6000–8000 expression rows
```

Verify in Supabase Dashboard → `expression_data`: row count should be in that range.
On the live site, open a CT-D gene detail panel — transcriptomics bar chart should now show bars.
Open a CT-L2 gene — should show a qualitative pattern badge (e.g., "CONSTITUTIVE").

- [ ] **Step 4: Commit**

```bash
git add data/import_detail_data.js
git commit -m "feat: import script Phase 3 — expression_data"
```

---

## Task 6: Phase 4 — Orthologs

**Files:**
- Modify: `data/import_detail_data.js`

- [ ] **Step 1: Add `importOrthologs` function**

Add this function before `main()`:

```js
async function importOrthologs(supabase, geneMaps) {
  console.log('\n── Phase 4: Orthologs ──────────────────────────');

  // Fetch strain UUIDs
  const { data: strains, error: strainErr } = await supabase
    .from('strains')
    .select('id, common_name');
  if (strainErr) { console.error('Failed to fetch strains:', strainErr.message); return; }
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

  const inserted = await batchUpsert(supabase, 'orthologs', pairs, 'gene_id_a,gene_id_b');
  console.log(`  ${inserted} ortholog pairs upserted`);
}
```

- [ ] **Step 2: Add `importOrthologs` call to `main()` — final complete version**

Replace `main()` with the final version:

```js
async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const geneMaps = await buildGeneMaps(supabase);
  console.log(`\nRunning phase: ${PHASE ?? 'all'}`);

  if (!PHASE || PHASE === 'proteins')   await importProteins(supabase, geneMaps);
  if (!PHASE || PHASE === 'alphafold')  await importAlphaFold(supabase, geneMaps);
  if (!PHASE || PHASE === 'expression') await importExpression(supabase, geneMaps);
  if (!PHASE || PHASE === 'orthologs')  await importOrthologs(supabase, geneMaps);

  console.log('\nDone.');
}
```

- [ ] **Step 3: Run orthologs phase only and verify**

```bash
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js --phase=orthologs
```

Expected output:
```
── Phase 4: Orthologs ──────────────────────────
  ~2400–2600 ortholog pairs assembled
  ~2400–2600 ortholog pairs upserted
```

Verify in Supabase Dashboard → `orthologs`: row count should match.
On the live site, open a CT-L2 gene detail panel — orthologs section should now show CT-D and CM entries with strain color bars and locus tags.

- [ ] **Step 4: Commit**

```bash
git add data/import_detail_data.js
git commit -m "feat: import script Phase 4 — orthologs"
```

---

## Task 7: Full Run + Final Verification

**Files:** None (run-only verification task)

- [ ] **Step 1: Run the complete import (all phases)**

This is safe to run even if individual phases have already been run — proteins and alphafold upsert on conflict, expression uses delete-then-insert, orthologs upsert on conflict.

```bash
SUPABASE_SERVICE_KEY=<your-key> node data/import_detail_data.js
```

Expected: all four phases complete with no error lines, final "Done."

- [ ] **Step 2: Verify row counts in Supabase dashboard**

Go to https://supabase.com/dashboard/project/ihobumwetoidqioifknt/editor and run:

```sql
SELECT
  (SELECT count(*) FROM proteins)          AS proteins,
  (SELECT count(*) FROM alphafold_results) AS alphafold_results,
  (SELECT count(*) FROM expression_data)   AS expression_data,
  (SELECT count(*) FROM orthologs)         AS orthologs;
```

Expected ranges:
- `proteins`: ~2684
- `alphafold_results`: ~2684
- `expression_data`: ~6000–8500
- `orthologs`: ~2400–2600

- [ ] **Step 3: Smoke-test the live site**

Push the current branch to trigger a Vercel deploy:

```bash
git push
```

Then open the live site and verify three gene detail panels:
1. A **CT-D gene** (e.g. CT001): Structure section shows thumbnail + AF version tab, Transcriptomics shows bar chart, Protein Info shows mass/family/UniProt link.
2. A **CT-L2 gene** (e.g. CTL0001): Transcriptomics shows a qualitative pattern badge (e.g. "CONSTITUTIVE"), Orthologs section shows CT-D and CM entries.
3. A **CM gene** (e.g. TC0001): Protein info shows, Structure shows, Orthologs shows. Transcriptomics shows "No expression data" (expected — CM has none).

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: data import corrections from smoke test"
```
