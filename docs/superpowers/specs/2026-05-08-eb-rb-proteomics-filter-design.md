# EB/RB Proteomics Filter + Data Source Captions

**Date:** 2026-05-08  
**Status:** Approved

---

## Goal

Allow researchers to filter the gene list by EB or RB enrichment status from the CT-L2 quantitative proteomics dataset. No other Chlamydia database offers this. Also add data source attribution captions to the Transcriptomics and EB/RB Proteomics detail panels.

---

## Filter Chips

Two new chips added to the **Expression** section of the filter bar (below Early · Mid · Late · Constitutive):

- **EB enriched** — proteins more abundant in elementary bodies
- **RB enriched** — proteins more abundant in reticulate bodies

These chips behave identically to the expression pattern chips: toggle on/off, use the same cyan color scheme, and display in the main filter bar as `📈 EB enriched ×` / `📈 RB enriched ×` when active.

Both filters can coexist with an active expression pattern filter (AND logic).

---

## Enrichment Threshold

Source: Saka et al. 2011, *Molecular Microbiology* 82(5):1185–203 · PMID 22014092 · DOI 10.1111/j.1365-2958.2011.07877.x  
Method: Label-free LC/LC-MS/MS spectral counting, CT-L2 EB and RB forms.

- **EB enriched**: `eb_expression >= 2 × rb_expression` OR (`rb_expression IS NULL` AND `eb_expression > 0`)
- **RB enriched**: `rb_expression >= 2 × eb_expression`

Approximately 431 EB-enriched and 98 RB-enriched genes in the CT-L2 dataset.

Proteomics data is CT-L2 only. Chips are hidden (or shown as disabled) when viewing CT-D or CM strains, where no proteomics data exists.

---

## Schema Change

Add two boolean columns to the `genes` table:

```sql
ALTER TABLE genes ADD COLUMN eb_enriched boolean;
ALTER TABLE genes ADD COLUMN rb_enriched boolean;
```

Populated by a Node.js compute script (`data/compute_eb_rb_enriched.js`) that:
1. Fetches all expression_data rows with non-null `eb_expression` (paginated)
2. Applies the threshold logic
3. Updates the matching genes row via `upsert` or `update`
4. Leaves CT-D and CM genes as NULL (no data)

---

## Query Integration

- Add `eb_enriched,rb_enriched` to the genes SELECT in `fetchGenes()`
- When `_ebRbFilter === 'eb'`: `.eq('eb_enriched', true)`
- When `_ebRbFilter === 'rb'`: `.eq('rb_enriched', true)`
- New state variable `_ebRbFilter = null` (values: `null | 'eb' | 'rb'`)
- Reset on strain tab switch and `renderGenomes()`
- `anyActive` check updated to include `_ebRbFilter`

---

## Data Source Captions

Gray italic caption text at the bottom of each panel, replacing/augmenting the existing "CT-L2 spectral counts" line:

| Panel | Caption text |
|---|---|
| Transcriptomics (CT-L2) | Nicholson et al. 2003, J Bacteriol · PMID 12730178 |
| Transcriptomics (CT-D) | Belland et al. 2003, PNAS · PMID 12815105 |
| EB/RB Proteomics | Saka et al. 2011, Mol Microbiol · PMID 22014092 |

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/011_eb_rb_enriched.sql` | Add `eb_enriched`, `rb_enriched` columns |
| `data/compute_eb_rb_enriched.js` | Compute and populate the columns |
| `web/js/views/genomes.js` | Filter chips, state var, query filter, captions |
| `web/index.html` | Cache bump |
| `web/js/app.js` | Cache bump |
