# ChlamAtlas — Data Import: Proteins, Structure, Expression, Orthologs

**Date:** 2026-05-02
**Status:** Approved

## Goal

Populate four currently-empty Supabase tables so the gene detail panel shows real data instead of empty states:
- `proteins`
- `alphafold_results`
- `expression_data`
- `orthologs`

Source: three existing CSVs in `data/csv/` (`Genes_L2.csv`, `Genes_D.csv`, `Genes_CM.csv`).

---

## Schema Migration

One new column added to `expression_data`:

```sql
ALTER TABLE expression_data ADD COLUMN pattern_label text;
```

**Why:** CT-L2 microarray data is qualitative text (e.g. "Constitutive", "Mid_Late"). The existing `eb_expression` column is typed `numeric` and cannot hold strings. `pattern_label` stores the qualitative label cleanly.

Migration file: `supabase/migrations/006_expression_pattern_label.sql`

---

## Frontend Patch (`web/js/views/genomes.js`)

In `renderDetailTranscriptomics`, the CT-L2 qualitative branch currently reads `sorted[0]?.eb_expression` to detect and display the pattern label. Change to read `sorted[0]?.pattern_label` instead.

Before:
```js
if (values.every(v => v === 0) && sorted[0]?.eb_expression) {
    const pattern = String(sorted[0].eb_expression ?? 'Unknown')
```

After:
```js
if (sorted[0]?.pattern_label) {
    const pattern = String(sorted[0].pattern_label ?? 'Unknown')
```

---

## Import Script: `data/import_detail_data.js`

Single Node.js script, four sequential phases. Follows the same structure and conventions as `import_genes.js`. Run with `SUPABASE_SERVICE_KEY` env var set.

### Shared setup

- Load all gene UUIDs into a lookup map: `{ [commonName]: { [locus_tag]: uuid } }` for CT-L2, CT-D, CM.
- Load all strain UUIDs into a map: `{ [commonName]: uuid }`.
- `BATCH_SIZE = 200` for upsert calls.
- Non-numeric helpers: `parseNum(val)` returns `null` if val is empty, `NQ`, `ND`, or non-parseable; otherwise returns `parseFloat`.

---

### Phase 1: Proteins

One row per gene across all three strains.

**Column mapping (CSV → DB):**

| CSV column | DB column | Notes |
|---|---|---|
| `Uniprot ID` | `uniprot_id` | trim, null if empty |
| `AlphaFold ID` | `alphafold_id` | trim, null if empty |
| `Mass (kD)` | `mass_kd` | parseFloat, null if empty |
| `Length (bp)` | `length_aa` | `Math.round(bp / 3)`, null if empty |
| `Protein Family` | `protein_family` | trim, null if empty |
| `Subcellular Location` | `localization` | trim, null if empty |
| `Subunit Structure` | `oligomeric_state` | trim, null if empty |
| — | `function_narrative` | NULL (already in `genes.functional_category`) |
| — | `signal_peptide` | false (not in CSV) |
| — | `transmembrane_domains` | 0 (not in CSV) |

**Upsert conflict:** `gene_id`

Skip rows where `GeneID` is blank or has no matching gene UUID in the lookup map.

---

### Phase 2: AlphaFold Results

One row per protein. Requires Phase 1 to have run (needs protein UUIDs).

After Phase 1, build a protein UUID lookup map: `{ gene_id: protein_id }` by querying `proteins` for all just-inserted rows.

**Column mapping (CSV → DB):**

| CSV column | DB column | Notes |
|---|---|---|
| `AFImageURL` | `thumbnail_path` | as-is from CSV, null if empty |
| `Version` | `af_version` | "AF2" or "AF3" as-is |
| `PDB ID` | `top_homolog_pdb_id` | trim, null if empty |
| `Structural homology (Foldseek)` / `Structural homology inferred function` | `inferred_function` | column name differs per strain CSV; trim, null if empty |
| — | `mmcif_path` | constructed: `https://alphafold.ebi.ac.uk/files/AF-{uniprot_id}-F1-model_v4.cif` — null if uniprot_id is empty |
| — | `homology_score` | NULL |
| — | `homology_method` | NULL |
| — | `top_homolog_description` | NULL |

**Upsert conflict:** `(protein_id, af_version)`

Skip rows where `AFImageURL` and `AlphaFold ID` are both empty (no structure data).

---

### Phase 3: Expression Data

Delete-then-insert per gene (not upsert) to avoid stale timepoint rows from re-runs.

**CT-D** (894 genes, `Genes_D.csv`):

Six microarray rows per gene (T0–T5):

| Timepoint | CSV column |
|---|---|
| T0 | `1h` |
| T1 | `3h` |
| T2 | `8h` |
| T3 | `16h` |
| T4 | `24h` |
| T5 | `40h` |

Each row: `method='microarray'`, `value=parseNum(col)` (null if `-` or non-numeric), `eb_expression=NULL`, `rb_expression=NULL`, `pattern_label=NULL`.

One proteomics row per gene: `timepoint='T0'`, `method=NULL`, `value=NULL`, `eb_expression=parseNum(EB)`, `rb_expression=parseNum(RB)`.

**CT-L2** (877 genes, `Genes_L2.csv`): <!-- 877 data rows, 878 lines including header -->

One microarray row per gene: `timepoint='T0'`, `method='microarray'`, `value=0`, `pattern_label=Microarray column value` (trim; null if empty or "ND"), `eb_expression=NULL`, `rb_expression=NULL`.

One proteomics row per gene: `timepoint='T0'`, `method=NULL`, `value=NULL`, `eb_expression=parseNum(EB)`, `rb_expression=parseNum(RB)`.

**CM** (913 genes, `Genes_CM.csv`): No expression data — skip entirely.

---

### Phase 4: Orthologs

**Strategy:** Use CT-L2 CSV as primary source for L2 ↔ D and L2 ↔ CM pairs. Use CT-D CSV for D ↔ CM pairs only (skipping any where CT-L2 already created the pair, using a seen-set keyed on sorted UUID pairs).

**CT-L2 CSV:**
- `OrthologID_D` → look up CT-D gene UUID → create pair (CT-L2 gene, CT-D gene)
- `OrthologID_CM` → look up CM gene UUID → create pair (CT-L2 gene, CM gene)

**CT-D CSV:**
- `OrthologID_CM` → look up CM gene UUID → create pair (CT-D gene, CM gene), only if not already in seen-set

All pairs: `method='reciprocal_blast'`, `confidence=NULL`.

Canonical ordering: always store `gene_id_a < gene_id_b` (string comparison on UUIDs) to satisfy the unique constraint and avoid direction-dependent duplicates.

**Upsert conflict:** `(gene_id_a, gene_id_b)`

---

## Data Notes

- **NQ / ND in EB/RB columns:** Both stored as `NULL`. NQ = not quantified, ND = not detected (confirmed from source publication). No zero values exist in those columns.
- **CT-D `1h`/`3h` columns:** Many genes show `-` for early timepoints — stored as NULL value, not skipped.
- **mmcif_path for CT-L2 / CM:** Constructed from UniProt ID same as CT-D. AlphaFold DB hosts all three strains.
- **`length_aa` precision:** Derived as `Math.round(bp / 3)`. Not exact (no stop codon adjustment) but sufficient for display.
- **Static structure thumbnails:** Stored from CSV `AFImageURL` for genes that have them. Used as preview in gene list view. Will become optional once interactive Mol* viewer is built.

---

## Files Changed / Created

| File | Action |
|---|---|
| `supabase/migrations/006_expression_pattern_label.sql` | New — schema migration |
| `data/import_detail_data.js` | New — import script |
| `web/js/views/genomes.js` | Patch — 2-line fix in `renderDetailTranscriptomics` |
