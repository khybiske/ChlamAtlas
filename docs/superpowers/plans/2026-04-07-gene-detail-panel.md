# Gene Detail Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full gene detail panel in `web/js/views/genomes.js`, matching the v2 mockup design locked in on 2026-04-07.

**Architecture:** The detail panel renders in `#detail-panel` on desktop (split-pane right column) and full-screen on mobile. The gene row object from the list cache is passed in directly so the hero renders instantly — async queries for proteins, orthologs, expression, and neighbors fire in parallel and fill section slots as they resolve. All sections use inline styles consistent with the rest of genomes.js.

**Tech Stack:** Vanilla JS, Supabase (PostgREST), inline CSS, SVG for gene map, Mol* (lazy CDN) for structure viewer, SwissBioPics web component (placeholder wiring).

**Key design decisions (from 2026-04-07 session):**
- Hero: category-color gradient, no stat bar; unnamed gene → locus tag shown large in mono
- Gene Info + Orthologs: 2-column side-by-side
- Genomic Context: compact 2-row SVG (+ strand top, – strand bottom), poster-style directional arrows
- Protein section: `genes.product` as description text (column J in CSV)
- 3-col row: Transcriptomics | EB/RB Proteomics | Cell Localization
- Structure: full-width, tabs (Crystal / AFv3 / AFv2), square viewer left, metadata right
- No emojis in section headers — green accent bar + all-caps text

**Reference mockup:** `docs/mockups/gene-detail-panel-mockup-v2.html`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/004_genes_product_sortindex.sql` | CREATE | Adds `product` and `sort_index` columns to genes |
| `data/import_genes.js` | MODIFY | Maps CSV `Product` → `genes.product`, `SortIndex` → `genes.sort_index` |
| `web/js/views/genomes.js` | MODIFY | All detail panel code; replaces stubs and old showGeneDetail |

---

## Task 1: Add `product` and `sort_index` columns to genes schema

These columns are needed before the detail panel can display product descriptions or fetch genomic neighbors.

`product` = the protein product annotation from NCBI (e.g., "Inclusion membrane protein A") — Column J in Kevin's CSVs. Required for the hero subtitle and Protein section description.

`sort_index` = integer sort order within the genome, used to fetch neighboring genes for the gene map. Comes from `SortIndex` in the CSV.

**Files:**
- Create: `supabase/migrations/004_genes_product_sortindex.sql`
- Modify: `data/import_genes.js`

- [ ] **Step 1: Create the migration SQL file**

```sql
-- supabase/migrations/004_genes_product_sortindex.sql
-- Adds product description and genomic sort order to genes table.
-- Run in Supabase SQL editor before re-running the import script.

ALTER TABLE public.genes
  ADD COLUMN IF NOT EXISTS product    text,
  ADD COLUMN IF NOT EXISTS sort_index integer;

CREATE INDEX IF NOT EXISTS genes_sort_idx ON public.genes(strain_id, sort_index);
```

- [ ] **Step 2: Run the migration in Supabase SQL editor**

Navigate to Supabase → SQL Editor → New query. Paste and run the migration. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'genes' AND column_name IN ('product','sort_index');
```
Expected: two rows returned.

- [ ] **Step 3: Update `data/import_genes.js` to map the new columns**

In the `mapRow` function, add two new fields after `is_characterized`:

```js
// data/import_genes.js — mapRow function
function mapRow(row, strainId) {
  const isInc = parseBool(row['Inc true']);
  let funcCat = (row['Function'] || '').trim() || null;
  if (isInc) funcCat = 'Inclusion membrane protein';

  const locus = (row['GeneID'] || '').trim();
  if (!locus) return null;

  const lengthBp  = parseInt(row['Length (bp)'], 10);
  const sortIndex = parseInt(row['SortIndex'],    10);

  return {
    strain_id:           strainId,
    locus_tag:           locus,
    gene_name:           (row['FullGeneName'] || '').trim() || null,
    gene_symbol:         (row['GeneName']     || '').trim() || null,
    product:             (row['Product']      || '').trim() || null,   // NEW
    sort_index:          isNaN(sortIndex) ? null : sortIndex,          // NEW
    functional_category: funcCat,
    is_membrane_protein: parseBool(row['Mem true']),
    is_hypothetical:     parseBool(row['Hyp true']),
    is_dna_binding:      parseBool(row['DNA true']),
    is_t3_secreted:      parseBool(row['Secr true']),
    is_characterized:    !parseBool(row['Hyp true']),
    end_bp:              isNaN(lengthBp) ? null : lengthBp,
  };
}
```

- [ ] **Step 4: Re-run the import (upserts will update existing rows)**

```bash
cd /Users/khybiske/Developer/web/ChlamAtlas/data
SUPABASE_SERVICE_KEY=<key> node import_genes.js
```

Expected output: `Done. Imported N genes for CT-L2/CT-D/CM.` with no errors.

- [ ] **Step 5: Spot-check in Supabase**

Run in SQL editor:
```sql
SELECT locus_tag, product, sort_index
FROM genes g
JOIN strains s ON g.strain_id = s.id
WHERE s.common_name = 'CT-L2' AND gene_name IS NOT NULL
LIMIT 10;
```
Expected: rows with non-null `product` (e.g., "Inclusion membrane protein A") and numeric `sort_index`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/004_genes_product_sortindex.sql data/import_genes.js
git commit -m "feat: add product and sort_index to genes schema + import"
```

---

## Task 2: Expand fetchGenes SELECT + gene cache + update detail function signatures

The gene row passed into `showGeneDetailDesktop()` must contain all fields needed for instant hero render and gene map queries. A module-level cache stores gene objects from list fetches.

**Files:**
- Modify: `web/js/views/genomes.js` (lines 34–50 module state; lines 285–295 fetchGenes SELECT; lines 339–358 row click handler; lines 691–692 stubs)

- [ ] **Step 1: Add `_geneCache` and `_sectionOpen` to module state**

After the existing module state block (after line 47, `let _scrollPos = 0;`), add:

```js
// Maps geneId (string) → gene object from the last list fetch
const _geneCache = new Map();

// Which detail sections are expanded (resets on new gene selection)
let _sectionOpen = {
  gene: true, protein: true, structure: true,
  transcriptomics: true, proteomics: true,
  localization: false, interactions: false,
};
```

- [ ] **Step 2: Update fetchGenes SELECT to include all detail fields**

Replace the existing `.select(...)` call in `fetchGenes` (currently around line 287):

```js
// Before:
.select(
  'id,locus_tag,gene_name,functional_category,is_characterized,is_membrane_protein,is_hypothetical,is_t3_secreted,strains!inner(common_name)',
  { count: 'exact' }
)

// After:
.select(
  'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
  'start_bp,end_bp,strand,' +
  'functional_category,is_characterized,is_membrane_protein,' +
  'is_hypothetical,is_dna_binding,is_t3_secreted,' +
  'strains!inner(common_name,color_hex)',
  { count: 'exact' }
)
```

- [ ] **Step 3: Populate `_geneCache` after each fetch in `fetchGenes`**

After `let rows = genes;` (around line 325), add:

```js
// Cache all fetched gene objects for detail panel use
genes.forEach(g => _geneCache.set(String(g.id), g));
```

- [ ] **Step 4: Update row click handlers to pass gene object**

In the `newRows.forEach` click handler (around line 342), update both branches:

```js
row.addEventListener('click', () => {
  const isMobile = window.innerWidth < 640;
  const geneId   = row.dataset.id;
  const gene     = _geneCache.get(geneId);
  if (!gene) return; // shouldn't happen — row was just rendered from cache

  if (isMobile) {
    showGeneDetailMobile(gene, container);
  } else {
    _selectedId = geneId;
    list.querySelectorAll('.gene-row').forEach(r => {
      const sel = r.dataset.id === _selectedId;
      r.style.background  = sel ? '#f0fdf4' : '';
      r.style.borderLeft  = sel ? '2px solid #16a34a' : '';
      r.style.paddingLeft = sel ? '10px' : '';
    });
    showGeneDetailDesktop(gene, container);
  }
});
```

- [ ] **Step 5: Verify no regressions — list still loads and gene rows are clickable**

Open the dev server and load the Genomes tab. List should load normally. Clicking a gene row should fire `showGeneDetailDesktop` (currently a stub — no visible change yet). Check browser console for errors.

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: expand gene SELECT fields, add gene cache, update detail signatures"
```

---

## Task 3: `showGeneDetailDesktop` — scaffold + hero card

Implement the full detail panel scaffold with the hero card rendering immediately from the gene object. Async sections show skeleton loaders while queries are in-flight.

**Files:**
- Modify: `web/js/views/genomes.js` — replace stub `showGeneDetailDesktop` at line 691

The category-badge lookup maps each functional_category to light bg/text/border for the badge (distinct from the full-saturation `CATEGORY_COLORS` used for the 3px list stripe and gene map arrows).

- [ ] **Step 1: Add `CATEGORY_BADGE` lookup constant** (after the existing `CATEGORY_COLORS` block)

```js
// Light badge styles for hero card — bg, text color, border
const CATEGORY_BADGE = {
  'Amino acid metabolism':      { bg:'#fff3ed', text:'#9a3412', border:'#fed7aa' },
  'Cell envelope':              { bg:'#f0fdfa', text:'#134e4a', border:'#99f6e4' },
  'Cell processes':             { bg:'#eff6ff', text:'#1e3a8a', border:'#bfdbfe' },
  'Cofactor metabolism':        { bg:'#f5f3ff', text:'#4c1d95', border:'#ddd6fe' },
  'Energy metabolism':          { bg:'#fef2f2', text:'#991b1b', border:'#fecaca' },
  'Inclusion membrane protein': { bg:'#fef9ee', text:'#a37742', border:'#f0d898' },
  'Inermediary metabolism':     { bg:'#fef2f2', text:'#7f1d1d', border:'#fecaca' },
  'Lipid metabolism':           { bg:'#faf5ff', text:'#581c87', border:'#e9d5ff' },
  'Membrane transport':         { bg:'#f0f9ff', text:'#0c4a6e', border:'#bae6fd' },
  'Nucleotide metabolism':      { bg:'#fdf2f8', text:'#831843', border:'#fbcfe8' },
  'Replication':                { bg:'#fefce8', text:'#713f12', border:'#fde68a' },
  'Secreted effector':          { bg:'#f0fdf4', text:'#14532d', border:'#86efac' },
  'Transcription':              { bg:'#fffbeb', text:'#78350f', border:'#fde68a' },
  'Translation':                { bg:'#f7fee7', text:'#365314', border:'#d9f99d' },
  'Type III secretion':         { bg:'#fdf4ef', text:'#5c3317', border:'#e8c9b3' },
  'Unknown':                    { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' },
};
```

- [ ] **Step 2: Add `sectionHead()` helper** (after `skeletonRows`, before detail stubs)

```js
// Returns a section header div: green accent bar + all-caps label.
// rightContent: optional HTML string rendered right-aligned in the header.
function sectionHead(label, rightContent = '') {
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 16px 7px;">
      <div style="width:2px;height:12px;background:#1a6b4a;border-radius:1px;flex-shrink:0;"></div>
      <span style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#1a6b4a;">${label}</span>
      ${rightContent ? `<span style="margin-left:auto;font-size:8.5px;color:#bbb;font-family:'DM Mono',monospace;">${rightContent}</span>` : ''}
    </div>`;
}
```

- [ ] **Step 3: Add `detailSkeleton()` helper**

```js
// Generic loading skeleton for a detail section body.
// lines: number of skeleton bars to show.
function detailSkeleton(lines = 3) {
  const bar = (w) =>
    `<div style="height:10px;width:${w};background:#f3f4f6;border-radius:4px;margin-bottom:7px;animation:pulse 1.5s ease-in-out infinite;"></div>`;
  return `<div style="padding:10px 16px 14px;">${Array.from({length: lines}, (_, i) =>
    bar(['60%','80%','45%'][i % 3])
  ).join('')}</div>`;
}
```

- [ ] **Step 4: Implement `showGeneDetailDesktop(gene, container)`**

Replace the existing stub at the bottom of the file:

```js
function showGeneDetailDesktop(gene, container) {
  const detail = container.querySelector('#detail-panel');
  if (!detail) return;

  _sectionOpen = { gene: true, protein: true, structure: true,
                   transcriptomics: true, proteomics: true,
                   localization: false, interactions: false };

  const favs   = loadFavorites();
  const isFav  = favs.has(String(gene.id));
  const strain = gene.strains?.common_name ?? _strain;

  // Category color + badge style
  const catColor = CATEGORY_COLORS[gene.functional_category] ?? CATEGORY_COLOR_DEFAULT;
  const catBadge = CATEGORY_BADGE[gene.functional_category] ?? { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' };
  const catLabel = gene.functional_category ?? '';

  // Hero background: very light tint derived from category color
  // color-mix is well-supported (Chrome 111+, FF 113+, Safari 16.2+)
  const heroBg = `color-mix(in srgb, ${catColor} 12%, white)`;

  const heroHtml = `
    <div style="padding:16px 20px 14px;border-bottom:3px solid ${catColor};background:linear-gradient(150deg,${heroBg} 0%,#ffffff 65%);">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;">
        <div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.85);border:2px solid rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;font-size:18px;color:#d1d5db;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.08);">⬡</div>
        <div style="flex:1;min-width:0;">
          ${gene.gene_name
            ? `<div style="font-size:24px;font-weight:700;color:#111;line-height:1.1;">${gene.gene_name}</div>
               <div style="font-size:9.5px;font-family:'DM Mono',monospace;color:#888;margin-top:2px;">${gene.locus_tag}</div>`
            : `<div style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:#333;line-height:1.1;">${gene.locus_tag}</div>`
          }
          <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.45;">${gene.product ?? (gene.functional_category ?? 'Hypothetical protein')}</div>
        </div>
        <button id="detail-fav-btn" data-id="${gene.id}"
          style="font-size:16px;background:none;border:none;cursor:pointer;color:${isFav ? '#f59e0b' : '#d1d5db'};padding:0;flex-shrink:0;padding-top:2px;"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#16a34a;border:1px solid rgba(22,163,74,0.3);">${strain}</span>
        ${catLabel ? `<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:${catBadge.bg};color:${catBadge.text};border:1px solid ${catBadge.border};">${catLabel}</span>` : ''}
        ${gene.is_characterized ? `<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#059669;border:1px solid rgba(5,150,105,0.3);">Characterized</span>` : ''}
      </div>
    </div>`;

  detail.innerHTML = `
    <div style="background:white;">
      ${heroHtml}
      <!-- 2-col: Gene Info + Orthologs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div id="d-gene-info" style="border-right:1px solid #f0f0f0;"></div>
        <div id="d-orthologs">${detailSkeleton(3)}</div>
      </div>
      <!-- Genomic Context -->
      <div id="d-gene-map" style="border-bottom:1px solid #f0f0f0;">${detailSkeleton(2)}</div>
      <!-- Protein -->
      <div id="d-protein" style="border-bottom:1px solid #f0f0f0;">${detailSkeleton(4)}</div>
      <!-- 3-col: Transcriptomics + EB/RB + Localization -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div id="d-transcriptomics" style="border-right:1px solid #f0f0f0;">${detailSkeleton(3)}</div>
        <div id="d-proteomics"      style="border-right:1px solid #f0f0f0;">${detailSkeleton(2)}</div>
        <div id="d-localization"></div>
      </div>
      <!-- Structure -->
      <div id="d-structure" style="border-bottom:1px solid #f0f0f0;">${detailSkeleton(3)}</div>
    </div>`;

  // Wire favorite button in detail panel
  detail.querySelector('#detail-fav-btn').addEventListener('click', e => {
    const id    = e.currentTarget.dataset.id;
    const nowFav = toggleFavorite(id);
    e.currentTarget.textContent = nowFav ? '★' : '☆';
    e.currentTarget.style.color  = nowFav ? '#f59e0b' : '#d1d5db';
    // Sync star in list panel
    const listBtn = container.querySelector(`.fav-btn[data-id="${id}"]`);
    if (listBtn) {
      listBtn.textContent = nowFav ? '★' : '☆';
      listBtn.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
    }
  });

  // Render synchronous sections immediately
  renderDetailGeneInfo(detail, gene);
  renderDetailLocalizationPlaceholder(detail);

  // Fire async queries in parallel
  loadDetailAsync(detail, gene);
}
```

- [ ] **Step 5: Verify the hero renders on gene row click**

Click any gene row in the list. The detail panel should show the hero card with correct name/locus/product/badges. Color gradient should match the gene's functional category. Skeleton loaders appear below.

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: detail panel scaffold + hero card with category color gradient"
```

---

## Task 4: Gene Info section (synchronous — no async needed)

Gene Info renders entirely from the gene row object already in hand. No additional query needed.

**Files:**
- Modify: `web/js/views/genomes.js` — add `renderDetailGeneInfo()`

- [ ] **Step 1: Implement `renderDetailGeneInfo(detail, gene)`**

Add this function before the detail stubs at the bottom of the file:

```js
function renderDetailGeneInfo(detail, gene) {
  const flags = [];
  if (gene.functional_category?.includes('Inclusion')) flags.push('Inc Protein');
  if (gene.is_membrane_protein)  flags.push('Membrane');
  if (gene.is_t3_secreted)       flags.push('T3 Secreted');
  if (gene.is_dna_binding)       flags.push('DNA Binding');

  const flagPill = (label) =>
    `<span style="font-size:8.5px;font-weight:600;padding:2px 7px;border-radius:10px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">${label}</span>`;

  const prop = (label, value) => value == null ? '' : `
    <div style="display:flex;flex-direction:column;gap:1px;">
      <span style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">${label}</span>
      <span style="font-size:11.5px;color:#222;font-weight:500;">${value}</span>
    </div>`;

  const strandLabel = gene.strand === '+' ? '+ (sense)' : gene.strand === '-' ? '− (antisense)' : '—';
  const lengthLabel = gene.end_bp ? `${gene.end_bp.toLocaleString()} bp` : '—';
  const posLabel    = (gene.start_bp && gene.end_bp)
    ? `${gene.start_bp.toLocaleString()}–${gene.end_bp.toLocaleString()}`
    : null;

  const el = detail.querySelector('#d-gene-info');
  if (!el) return;
  el.innerHTML = `
    ${sectionHead('Gene Info')}
    <div style="padding:2px 16px 14px;">
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Length', lengthLabel)}
        ${prop('Strand', strandLabel)}
        ${posLabel ? prop('Position', posLabel) : ''}
      </div>
      ${flags.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${flags.map(flagPill).join('')}</div>` : ''}
      <div id="d-ext-links" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        <!-- Populated in Task 8 when protein data arrives (UniProt/NCBI IDs) -->
      </div>
    </div>`;
}
```

- [ ] **Step 2: Verify gene info section renders immediately on gene click**

Click any gene. Gene Info section should show length, strand, any flag pills. Links area is empty (will fill once protein data loads).

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene info section (synchronous from gene row)"
```

---

## Task 5: Async data loader + Orthologs section

All async sections fire from a single `loadDetailAsync(detail, gene)` function. This function runs Q2 (proteins + expression) and Q3 (orthologs) and Q4 (gene map neighbors) in parallel.

**Files:**
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Implement `loadDetailAsync(detail, gene)`**

```js
async function loadDetailAsync(detail, gene) {
  // Three queries in parallel:
  // Q_protein: proteins row + alphafold_results + expression_data
  // Q_ortho:   orthologs for this gene
  // Q_neighbors: flanking genes for gene map

  const [protResult, orthoResult, neighborResult] = await Promise.all([
    sb.from('proteins')
      .select('*,alphafold_results(*)')
      .eq('gene_id', gene.id)
      .maybeSingle(),

    sb.from('orthologs')
      .select(`
        id,
        gene_b:genes!gene_id_b(
          id, locus_tag, gene_name, strand, functional_category,
          strains(common_name, color_hex)
        )
      `)
      .eq('gene_id_a', gene.id),

    gene.sort_index != null
      ? sb.from('genes')
          .select('id,locus_tag,gene_name,functional_category,strand,end_bp,sort_index')
          .eq('strain_id', gene.strain_id)
          .gte('sort_index', gene.sort_index - 6)
          .lte('sort_index', gene.sort_index + 6)
          .order('sort_index', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Also fetch expression data separately (keyed by gene_id, not protein_id)
  const { data: exprRows } = await sb.from('expression_data')
    .select('*')
    .eq('gene_id', gene.id);

  renderDetailOrthologs(detail, orthoResult.data ?? [], gene);
  renderDetailGeneMap(detail, gene, neighborResult.data ?? []);
  renderDetailProtein(detail, gene, protResult.data);
  renderDetailTranscriptomics(detail, gene, exprRows ?? []);
  renderDetailProteomics(detail, gene, exprRows ?? []);
  renderDetailStructure(detail, gene, protResult.data?.alphafold_results ?? []);
}
```

- [ ] **Step 2: Implement `renderDetailOrthologs(detail, orthoRows, gene)`**

```js
function renderDetailOrthologs(detail, orthoRows, gene) {
  const el = detail.querySelector('#d-orthologs');
  if (!el) return;

  if (!orthoRows.length) {
    el.innerHTML = `
      ${sectionHead('Orthologs')}
      <div style="padding:8px 16px 14px;font-size:10px;color:#bbb;font-style:italic;">No orthologs recorded</div>`;
    return;
  }

  const rows = orthoRows.map(o => {
    const g = o.gene_b;
    if (!g) return '';
    const strain    = g.strains?.common_name ?? '?';
    const colorHex  = g.strains?.color_hex ?? '#9ca3af';
    const nameHtml  = g.gene_name
      ? `<span style="font-size:9.5px;font-family:'DM Mono',monospace;color:#222;font-weight:600;">${g.locus_tag}</span>
         <span style="font-size:9.5px;color:#9ca3af;margin-left:4px;overflow:hidden;text-overflow:ellipsis;">${g.gene_name}</span>`
      : `<span style="font-size:9.5px;font-family:'DM Mono',monospace;color:#9ca3af;">${g.locus_tag}</span>`;

    return `
      <div class="orth-row-btn" data-id="${g.id}" style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid #f7f7f7;cursor:pointer;"
        onmouseenter="this.style.background='#fafafa';this.style.margin='0 -16px';this.style.padding='6px 16px';"
        onmouseleave="this.style.background='';this.style.margin='';this.style.padding='6px 0';">
        <div style="width:3px;height:24px;border-radius:1px;background:${colorHex};flex-shrink:0;"></div>
        <span style="font-size:8px;font-weight:700;color:#9ca3af;width:36px;flex-shrink:0;">${strain}</span>
        <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:4px;">${nameHtml}</div>
        <span style="font-size:11px;color:#ddd;">›</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    ${sectionHead('Orthologs')}
    <div style="padding:2px 16px 14px;">
      ${rows}
      <div style="margin-top:8px;font-size:9px;color:#bbb;font-style:italic;">Reciprocal BLAST · ${orthoRows.length}/3 strains</div>
    </div>`;

  // Wire ortholog row clicks — navigate to that gene's detail
  el.querySelectorAll('.orth-row-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.id;
      // Fetch that gene and show its detail panel
      sb.from('genes')
        .select(
          'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
          'start_bp,end_bp,strand,functional_category,is_characterized,' +
          'is_membrane_protein,is_hypothetical,is_dna_binding,is_t3_secreted,' +
          'strains!inner(common_name,color_hex)'
        )
        .eq('id', targetId)
        .single()
        .then(({ data }) => {
          if (data) {
            _geneCache.set(String(data.id), data);
            showGeneDetailDesktop(data, btn.closest('[id]').parentElement?.parentElement ?? document.body);
          }
        });
    })
  );
}
```

- [ ] **Step 3: Verify orthologs section**

Click incA (CTL0481). Orthologs section should show "No orthologs recorded" (orthologs table is empty). Click an unnamed gene — same result. No crashes or uncaught promises.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: async data loader + orthologs section"
```

---

## Task 6: Genomic Context — gene map SVG

Renders a two-row linear gene map showing up to ±6 flanking genes. Genes on the + strand appear above the backbone; genes on the − strand appear below. The current gene is visually emphasized. Arrow shapes are directional chevrons, color-coded by `CATEGORY_COLORS`.

**Files:**
- Modify: `web/js/views/genomes.js` — add `renderDetailGeneMap()`

- [ ] **Step 1: Implement `renderDetailGeneMap(detail, gene, neighbors)`**

```js
function renderDetailGeneMap(detail, gene, neighbors) {
  const el = detail.querySelector('#d-gene-map');
  if (!el) return;

  // Hide section if no sort_index data (gene map requires genomic order)
  if (!neighbors.length || gene.sort_index == null) {
    el.style.display = 'none';
    return;
  }

  // ── Layout constants ──────────────────────────────────────────
  const VB_W    = 620;   // SVG viewBox width
  const VB_H    = 62;    // SVG viewBox height
  const SPINE_Y = 31;    // Backbone y-coordinate
  // + strand arrow: y=18 to y=30 (height 12), tip at y=24
  const P_TOP   = 18; const P_BOT = 30; const P_MID = 24;
  // − strand arrow: y=32 to y=44 (height 12), tip at y=38
  const N_TOP   = 32; const N_BOT = 44; const N_MID = 38;
  // Current gene is taller: y=15 to y=33, tip at y=24 (still + strand)
  const CUR_TOP = 14; const CUR_BOT = 34;
  const TIP     = 10;   // Tip length in px
  const MIN_W   = 28;   // Minimum arrow width in px

  // ── Scale arrows to fit viewBox ───────────────────────────────
  const totalBp = neighbors.reduce((s, g) => s + Math.max(g.end_bp ?? 600, 1), 0);
  const scale   = (VB_W - 20) / Math.max(totalBp, 1);

  let x = 10;
  const arrowDefs = neighbors.map(g => {
    const w   = Math.max(Math.round((g.end_bp ?? 600) * scale), MIN_W);
    const def = { g, x, w };
    x += w + 2; // 2px gap between genes
    return def;
  });

  // ── Build SVG elements ────────────────────────────────────────
  const backbone = `<line x1="10" y1="${SPINE_Y}" x2="${VB_W - 10}" y2="${SPINE_Y}" stroke="#d9d9d9" stroke-width="1.2"/>`;
  const strandLbl = `
    <text x="5" y="${P_MID + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">+</text>
    <text x="5" y="${N_MID + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">−</text>`;

  const arrows = arrowDefs.map(({ g: ng, x: ax, w }) => {
    const isCurrent = String(ng.id) === String(gene.id);
    const color     = CATEGORY_COLORS[ng.functional_category] ?? CATEGORY_COLOR_DEFAULT;
    const isPlus    = ng.strand !== '-';
    const label     = ng.gene_name ?? ng.locus_tag;
    const isNamed   = !!ng.gene_name;

    let pts, labelY, locusY;

    if (isPlus) {
      const top = isCurrent ? CUR_TOP : P_TOP;
      const bot = isCurrent ? CUR_BOT : P_BOT;
      const mid = (top + bot) / 2;
      pts     = `${ax},${top} ${ax + w - TIP},${top} ${ax + w},${mid} ${ax + w - TIP},${bot} ${ax},${bot}`;
      labelY  = top - 3.5;
      locusY  = bot + 7;
    } else {
      // Left-pointing arrow for − strand
      pts     = `${ax + w},${N_TOP} ${ax + TIP},${N_TOP} ${ax},${N_MID} ${ax + TIP},${N_BOT} ${ax + w},${N_BOT}`;
      labelY  = N_BOT + 7;
      locusY  = null; // locus below label for − strand
    }

    const cx = ax + w / 2;
    const opacity   = isCurrent ? '1' : '0.82';
    const strokeEl  = isCurrent
      ? `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.9"/>`
      : '';

    // Label: named genes show gene name, unnamed show locus tag
    const labelEl = `
      <text x="${cx}" y="${labelY}" text-anchor="middle"
        font-family="${isNamed ? 'DM Sans,sans-serif' : 'DM Mono,monospace'}"
        font-size="${isCurrent ? '7.5' : '6'}"
        font-weight="${(isNamed || isCurrent) ? '600' : '400'}"
        fill="${isCurrent ? '#444' : '#999'}">${label}</text>`;

    // Locus tag below for + strand (only if gene has a name)
    const locusEl = (isNamed && locusY)
      ? `<text x="${cx}" y="${locusY}" text-anchor="middle" font-family="DM Mono,monospace" font-size="5.5" fill="#bbb">${ng.locus_tag}</text>`
      : ((!isNamed && isPlus && locusY)
        ? `<text x="${cx}" y="${locusY}" text-anchor="middle" font-family="DM Mono,monospace" font-size="5.5" fill="#bbb">${ng.locus_tag}</text>`
        : '');

    return `
      <g class="${isCurrent ? '' : 'ga'}" data-id="${ng.id}" style="cursor:${isCurrent ? 'default' : 'pointer'};" title="${ng.locus_tag}${ng.gene_name ? ' · ' + ng.gene_name : ''}">
        <polygon points="${pts}" fill="${color}" opacity="${opacity}"/>
        ${strokeEl}
        ${labelEl}
        ${locusEl}
      </g>`;
  }).join('');

  el.innerHTML = `
    ${sectionHead('Genomic Context', gene.strains?.common_name + ' chromosome')}
    <div style="padding:4px 16px 12px;">
      <div style="background:#fafafa;border:1px solid #efefef;border-radius:6px;padding:10px 10px 8px;">
        <svg viewBox="0 8 ${VB_W} ${VB_H - 8}" xmlns="http://www.w3.org/2000/svg"
             style="width:100%;height:auto;display:block;overflow:visible;">
          ${backbone}
          ${strandLbl}
          ${arrows}
        </svg>
      </div>
    </div>`;

  // Wire neighbor gene clicks
  el.querySelectorAll('.ga[data-id]').forEach(gEl =>
    gEl.addEventListener('click', () => {
      const targetId = gEl.dataset.id;
      const cached   = _geneCache.get(targetId);
      if (cached) {
        showGeneDetailDesktop(cached, el.closest('[style*="height"]') ?? document.body);
      }
    })
  );
}
```

- [ ] **Step 2: Add the `.ga` hover CSS via a `<style>` tag injection**

In `showGeneDetailDesktop`, before setting `detail.innerHTML`, inject a style rule once:

```js
// Inject gene-arrow hover style if not already present
if (!document.querySelector('#chlamatlas-detail-styles')) {
  const s = document.createElement('style');
  s.id = 'chlamatlas-detail-styles';
  s.textContent = '.ga { transition: opacity 0.12s; } .ga:hover { opacity: 0.65 !important; }';
  document.head.appendChild(s);
}
```

- [ ] **Step 3: Verify the gene map renders**

Click a CT-L2 gene that has sort_index set (after Task 1). The Genomic Context section should show the SVG strip with neighboring genes. The current gene should be slightly taller and outlined. Clicking a neighbor should load that gene's detail.

If sort_index is still null (Task 1 not yet complete), the section hides cleanly (`display:none`).

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: genomic context gene map SVG with two-row strand layout"
```

---

## Task 7: Protein Info section

Renders the full-width Protein section from the `proteins` row. Includes the product description at top (from `genes.product`), then key metrics and external links (UniProt, NCBI). The AlphaFold link lives in the Structure section.

**Files:**
- Modify: `web/js/views/genomes.js` — add `renderDetailProtein()`

- [ ] **Step 1: Implement `renderDetailProtein(detail, gene, protein)`**

```js
function renderDetailProtein(detail, gene, protein) {
  const el = detail.querySelector('#d-protein');
  if (!el) return;

  if (!protein) {
    el.innerHTML = `
      ${sectionHead('Protein')}
      <div style="padding:8px 16px 14px;font-size:10px;color:#bbb;font-style:italic;">No protein data imported yet</div>`;

    // Still fill Gene Info ext links with NCBI (always available)
    const extLinks = detail.querySelector('#d-ext-links');
    if (extLinks) {
      extLinks.innerHTML = ncbiLink(gene.locus_tag);
    }
    return;
  }

  const prop = (label, value) => {
    if (value == null || value === '' || value === false) return '';
    return `
      <div style="display:flex;flex-direction:column;gap:1px;">
        <span style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">${label}</span>
        <span style="font-size:11.5px;color:#222;font-weight:500;">${value}</span>
      </div>`;
  };

  const extLink = (label, href) => href
    ? `<a href="${href}" target="_blank" rel="noopener"
        style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;"
        onmouseenter="this.style.background='#dcfce7'" onmouseleave="this.style.background='#f0fdf4'">${label} ↗</a>`
    : '';

  const tmLabel  = protein.transmembrane_domains > 0 ? String(protein.transmembrane_domains) : 'None';
  const spLabel  = protein.signal_peptide ? 'Yes' : 'No';
  const descText = gene.product ?? protein.function_narrative ?? null;

  el.innerHTML = `
    ${sectionHead('Protein')}
    <div style="padding:2px 16px 14px;">
      ${descText ? `
        <div style="font-size:10.5px;color:#555;line-height:1.65;font-style:italic;margin-bottom:10px;
                    padding:7px 10px;background:#fafafa;border-radius:6px;border-left:3px solid #e5e7eb;">
          ${descText}
        </div>` : ''}
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Mass',           protein.mass_kd ? `${protein.mass_kd} kDa` : null)}
        ${prop('Length',         protein.length_aa ? `${protein.length_aa} aa` : null)}
        ${prop('TM Domains',     tmLabel)}
        ${prop('Signal Peptide', spLabel)}
        ${prop('Localization',   protein.localization)}
        ${prop('Family',         protein.protein_family)}
        ${prop('Oligomeric State', protein.oligomeric_state)}
      </div>
      ${protein.function_narrative && protein.function_narrative !== gene.product ? `
        <div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;padding:6px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:8px;">
          ${protein.function_narrative}
        </div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        ${extLink('UniProt', protein.uniprot_id ? `https://www.uniprot.org/uniprot/${protein.uniprot_id}` : null)}
        ${ncbiLink(gene.locus_tag)}
      </div>
    </div>`;

  // Fill Gene Info ext links now that we have UniProt/NCBI IDs
  const extLinksEl = detail.querySelector('#d-ext-links');
  if (extLinksEl) {
    extLinksEl.innerHTML = `
      ${extLink('UniProt', protein.uniprot_id ? `https://www.uniprot.org/uniprot/${protein.uniprot_id}` : null)}
      ${ncbiLink(gene.locus_tag)}`;
  }
}

// Helper: NCBI gene link (always available)
function ncbiLink(locusTag) {
  return `<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(locusTag)}" target="_blank" rel="noopener"
    style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;"
    onmouseenter="this.style.background='#dcfce7'" onmouseleave="this.style.background='#f0fdf4'">NCBI ↗</a>`;
}
```

- [ ] **Step 2: Verify protein section**

Click a CT-L2 gene. Protein section should show "No protein data imported yet" (proteins table is empty). When protein data is imported later, this section will auto-populate without code changes.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: protein info section with description, props, and ext links"
```

---

## Task 8: Transcriptomics + EB/RB Proteomics sections

Both sections draw from `expression_data` rows fetched in `loadDetailAsync`. CT-D has quantitative microarray data (bar chart); CT-L2 has a qualitative pattern label. EB/RB proteomics display spectral abundance bars.

**Files:**
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Implement `renderDetailTranscriptomics(detail, gene, exprRows)`**

```js
function renderDetailTranscriptomics(detail, gene, exprRows) {
  const el = detail.querySelector('#d-transcriptomics');
  if (!el) return;

  const microarrayRows = exprRows.filter(r => r.method === 'microarray');

  if (!microarrayRows.length) {
    el.innerHTML = `
      ${sectionHead('Transcriptomics')}
      <div style="padding:8px 16px 14px;font-size:9px;color:#bbb;font-style:italic;">No expression data imported yet</div>`;
    return;
  }

  // Sort by timepoint: T0–T5 maps to index 0–5
  const TP_ORDER = { T0:0, T1:1, T2:2, T3:3, T4:4, T5:5 };
  const TP_LABEL = { T0:'1h', T1:'3h', T2:'8h', T3:'16h', T4:'24h', T5:'40h' };

  const sorted = [...microarrayRows].sort((a, b) => (TP_ORDER[a.timepoint] ?? 99) - (TP_ORDER[b.timepoint] ?? 99));
  const values = sorted.map(r => r.value ?? 0);
  const maxVal = Math.max(...values, 1);

  // If all values are null — show pattern label instead
  if (values.every(v => v === 0) && sorted[0]?.eb_expression) {
    // CT-L2 qualitative case: use eb_expression as pattern label
    const pattern = String(sorted[0].eb_expression ?? 'Unknown').toUpperCase().replace('_', ' ');
    el.innerHTML = `
      ${sectionHead('Transcriptomics')}
      <div style="padding:8px 16px 14px;">
        <div style="font-size:9px;color:#555;margin-bottom:6px;">Expression pattern (CT-L2)</div>
        <span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;">${pattern}</span>
        <div style="font-size:8.5px;color:#bbb;margin-top:6px;font-style:italic;">Qualitative · quantitative timepoints not available for CT-L2</div>
      </div>`;
    return;
  }

  const bars = sorted.map(r => {
    const h   = Math.round(((r.value ?? 0) / maxVal) * 40);
    const pct = Math.max(h, 2);
    const lbl = TP_LABEL[r.timepoint] ?? r.timepoint;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;flex:1;">
        <div style="height:40px;display:flex;align-items:flex-end;width:100%;">
          <div title="${lbl}: ${r.value ?? 0}" style="background:#4ade80;border-radius:2px 2px 0 0;width:100%;height:${pct}px;cursor:pointer;"
            onmouseenter="this.style.background='#16a34a'" onmouseleave="this.style.background='#4ade80'"></div>
        </div>
        <div style="font-size:7.5px;color:#9ca3af;font-family:'DM Mono',monospace;margin-top:3px;">${lbl}</div>
      </div>`;
  }).join('');

  const peakTp = sorted.reduce((a, b) => ((a.value ?? 0) >= (b.value ?? 0) ? a : b), sorted[0]);

  el.innerHTML = `
    ${sectionHead('Transcriptomics')}
    <div style="padding:2px 16px 14px;">
      <div style="font-size:8px;color:#9ca3af;margin-bottom:6px;">CT-D microarray · 1h–40h</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:57px;padding-bottom:17px;position:relative;">
        <div style="position:absolute;bottom:17px;left:0;right:0;height:1px;background:#e5e7eb;"></div>
        ${bars}
      </div>
      <div style="font-size:8px;color:#9ca3af;margin-top:4px;display:flex;align-items:center;gap:4px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#16a34a;flex-shrink:0;"></div>
        Peak ${TP_LABEL[peakTp.timepoint] ?? peakTp.timepoint}
      </div>
    </div>`;
}
```

- [ ] **Step 2: Implement `renderDetailProteomics(detail, gene, exprRows)`**

```js
function renderDetailProteomics(detail, gene, exprRows) {
  const el = detail.querySelector('#d-proteomics');
  if (!el) return;

  // EB/RB values: use eb_expression / rb_expression columns
  // These are raw spectral counts; we display as percentile bars
  // For now use the first row that has eb/rb data regardless of method
  const protRow = exprRows.find(r => r.eb_expression != null || r.rb_expression != null);

  if (!protRow) {
    el.innerHTML = `
      ${sectionHead('EB / RB Proteomics')}
      <div style="padding:8px 16px 14px;font-size:9px;color:#bbb;font-style:italic;">No proteomic data imported yet</div>`;
    return;
  }

  // Treat values as percentile (0–100); if raw counts, show as-is with a note
  const ebVal = protRow.eb_expression ?? 0;
  const rbVal = protRow.rb_expression ?? 0;
  const maxVal = Math.max(ebVal, rbVal, 1);

  const bar = (label, val) => {
    const pct = Math.round((val / maxVal) * 100);
    return `
      <div style="margin-bottom:9px;">
        <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px;">${label}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="height:5px;background:#f3f4f6;border-radius:3px;flex:1;">
            <div style="height:5px;border-radius:3px;background:#4ade80;width:${pct}%;"></div>
          </div>
          <span style="font-size:9px;font-family:'DM Mono',monospace;color:#555;white-space:nowrap;">${val}</span>
        </div>
      </div>`;
  };

  el.innerHTML = `
    ${sectionHead('EB / RB Proteomics')}
    <div style="padding:2px 16px 14px;">
      ${bar('EB (elementary body)', ebVal)}
      ${bar('RB (reticulate body)', rbVal)}
      <div style="font-size:8.5px;color:#bbb;font-style:italic;">CT-L2 spectral counts</div>
    </div>`;
}
```

- [ ] **Step 3: Verify both sections show empty states correctly**

Both should show "No data imported yet" with existing data. No crashes.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: transcriptomics bar chart and EB/RB proteomics sections"
```

---

## Task 9: Structure section with source tabs + Mol* viewer

Three tabs: Crystal Structure (PDB) / AlphaFold v3 / AlphaFold v2. Only tabs with data are enabled. Default to the highest-version available. Thumbnail shown initially; Mol* loads lazily on click.

**Files:**
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Implement `renderDetailStructure(detail, gene, afRows)`**

```js
function renderDetailStructure(detail, gene, afRows) {
  const el = detail.querySelector('#d-structure');
  if (!el) return;

  // Find AF records by version
  const af3 = afRows.find(r => r.af_version === 'v3' || r.af_version === 'AF3');
  const af2 = afRows.find(r => r.af_version === 'v2' || r.af_version === 'AF2' || r.af_version === 'AFDB');

  // Active tab: prefer v3, fallback v2, fallback empty
  let activeTab = af3 ? 'af3' : af2 ? 'af2' : 'af2';
  let activeRecord = activeTab === 'af3' ? af3 : af2;

  function tabBtn(id, label, record) {
    const available = !!record;
    const isActive  = id === activeTab;
    return `
      <button class="struct-tab" data-tab="${id}"
        style="padding:6px 14px;font-size:10px;font-weight:600;border:none;background:none;cursor:${available ? 'pointer' : 'not-allowed'};
               color:${isActive ? '#1a6b4a' : available ? '#9ca3af' : '#d1d5db'};
               border-bottom:2px solid ${isActive ? '#1a6b4a' : 'transparent'};margin-bottom:-1px;
               font-family:inherit;white-space:nowrap;"
        ${!available ? 'disabled' : ''}>
        ${label}${!available ? ' —' : ''}
      </button>`;
  }

  function viewerHtml(record) {
    if (!record) {
      return `<div style="display:flex;align-items:center;justify-content:center;height:200px;background:#f9fafb;border-radius:8px;font-size:10px;color:#bbb;font-style:italic;">No structural data available for this source</div>`;
    }

    const thumbHtml = record.thumbnail_path
      ? `<img src="${record.thumbnail_path}" alt="Structure thumbnail"
            style="width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:pointer;"
            id="struct-thumb" title="Click to load interactive viewer" />`
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;color:#d1d5db;border-radius:8px;background:#f9fafb;">◻</div>`;

    const scoreHtml = record.homology_score != null
      ? `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
           <span style="font-size:28px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;line-height:1;">${record.homology_score}</span>
           <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">pLDDT · ${record.af_version ?? ''}</span>
         </div>`
      : '';

    const homologHtml = record.top_homolog_description
      ? `<div style="font-size:10.5px;color:#222;font-weight:600;margin-bottom:3px;">${record.top_homolog_description}</div>
         <div style="font-size:9.5px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
           ${record.top_homolog_pdb_id ? `RCSB PDB: ${record.top_homolog_pdb_id}` : ''}
           ${record.homology_method ? ` · Method: ${record.homology_method}` : ''}
         </div>`
      : '';

    const inferredHtml = record.inferred_function
      ? `<div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;padding:7px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:10px;">
           <strong style="color:#1a6b4a;">Inferred function:</strong> ${record.inferred_function}
         </div>`
      : '';

    const extLinksHtml = [
      record.af_version && gene.proteins?.alphafold_id
        ? `<a href="https://alphafold.ebi.ac.uk/entry/${gene.proteins?.alphafold_id}" target="_blank" rel="noopener" style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;">AlphaFold DB ↗</a>`
        : '',
      record.top_homolog_pdb_id
        ? `<a href="https://www.rcsb.org/structure/${record.top_homolog_pdb_id}" target="_blank" rel="noopener" style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;">RCSB ${record.top_homolog_pdb_id} ↗</a>`
        : '',
      record.mmcif_path
        ? `<a href="${record.mmcif_path}" download style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;">Download mmCIF ↗</a>`
        : '',
    ].filter(Boolean).join('');

    return `
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <!-- Square viewer (left) -->
        <div id="struct-viewer-wrap" style="width:260px;height:260px;flex-shrink:0;border-radius:8px;overflow:hidden;position:relative;background:#0a1628;cursor:pointer;" title="Click to load interactive 3D viewer">
          ${thumbHtml}
          ${record.mmcif_path ? `
            <button id="struct-load-3d" data-url="${record.mmcif_path}"
              style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
                     font-size:9px;font-weight:600;background:rgba(15,69,48,0.85);color:white;
                     border:none;border-radius:5px;padding:4px 10px;cursor:pointer;white-space:nowrap;font-family:inherit;">
              Load 3D viewer
            </button>` : ''}
        </div>
        <!-- Metadata (right) -->
        <div style="flex:1;min-width:0;padding-top:2px;">
          ${scoreHtml}
          ${homologHtml}
          ${inferredHtml}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${extLinksHtml}</div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${sectionHead('Structure')}
    <div style="border-bottom:1px solid #e5e7eb;margin:0 16px 12px;display:flex;">
      ${tabBtn('crystal', 'Crystal Structure', null)}
      ${tabBtn('af3',     'AlphaFold v3',      af3)}
      ${tabBtn('af2',     'AlphaFold v2',      af2)}
    </div>
    <div id="struct-viewer-body" style="padding:0 16px 16px;">
      ${viewerHtml(activeRecord)}
    </div>`;

  // Tab switching
  el.querySelectorAll('.struct-tab:not([disabled])').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab    = tab.dataset.tab;
      activeRecord = activeTab === 'af3' ? af3 : activeTab === 'af2' ? af2 : null;
      // Re-render tab styles
      el.querySelectorAll('.struct-tab').forEach(t => {
        const active = t.dataset.tab === activeTab;
        t.style.color       = active ? '#1a6b4a' : (t.disabled ? '#d1d5db' : '#9ca3af');
        t.style.borderBottomColor = active ? '#1a6b4a' : 'transparent';
      });
      el.querySelector('#struct-viewer-body').innerHTML = viewerHtml(activeRecord);
      wireStructureEvents(el, gene);
    });
  });

  wireStructureEvents(el, gene);
}

function wireStructureEvents(el, gene) {
  el.querySelector('#struct-thumb')?.addEventListener('click', () => {
    const btn = el.querySelector('#struct-load-3d');
    if (btn) loadMolstar(el.querySelector('#struct-viewer-wrap'), btn.dataset.url);
  });
  el.querySelector('#struct-load-3d')?.addEventListener('click', e => {
    loadMolstar(el.querySelector('#struct-viewer-wrap'), e.currentTarget.dataset.url);
  });
}
```

- [ ] **Step 2: Verify structure section**

With empty `alphafold_results`, the AF v3 and AF v2 tabs should both show "—" (unavailable). Crystal Structure tab also unavailable. No crashes.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: structure section with Crystal/AFv3/AFv2 tabs and lazy Mol* viewer"
```

---

## Task 10: Cell Localization placeholder + final wiring

Render the Cell Localization placeholder. Wire the detail favorite button. Remove the old `showGeneDetail` function. Add the `showGeneDetailMobile` stub.

**Files:**
- Modify: `web/js/views/genomes.js`

- [ ] **Step 1: Implement `renderDetailLocalizationPlaceholder(detail)`**

```js
function renderDetailLocalizationPlaceholder(detail) {
  const el = detail.querySelector('#d-localization');
  if (!el) return;
  el.innerHTML = `
    ${sectionHead('Cell Localization')}
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:18px 8px 14px;text-align:center;">
      <div style="font-size:20px;color:#d1d5db;">◎</div>
      <div style="font-size:9px;font-weight:600;color:#aaa;">Coming soon</div>
      <div style="font-size:8.5px;color:#ccc;max-width:130px;line-height:1.4;">SwissBioPics cell diagram with subcellular localization</div>
    </div>`;
}
```

- [ ] **Step 2: Remove the old `showGeneDetail` function**

Delete lines 423–556 (the old `showGeneDetail` implementation), `renderExpr` (lines 560–603), and the `row()`/`extRow()` helpers (lines 643–661) since they are now replaced. Keep `loadMolstar` and `_initMolstar`.

Verify `row()` and `extRow()` are not referenced anywhere else in the file:

```bash
grep -n '\brow(\|extRow(' web/js/views/genomes.js
```

Expected: 0 results.

- [ ] **Step 3: Update `showGeneDetailMobile` stub**

Replace the empty stub:

```js
function showGeneDetailMobile(gene, container) {
  // Full-screen mobile detail — shares section renderers with desktop.
  // Shows a tab bar at top: Gene | Protein | Expression | Structure.
  // TODO: implement in a follow-up session.
  // For now: fall back to desktop layout inside the full container.
  const isMobileWide = window.innerWidth >= 400;
  container.querySelector('#detail-panel').style.display = 'block';
  container.querySelector('#list-panel').style.display   = 'none';
  showGeneDetailDesktop(gene, container);
}
```

- [ ] **Step 4: Smoke test the full panel**

Load the Genomes tab. Click several genes:
- Named gene (e.g., incA): hero shows gene name large, locus tag small, product subtitle
- Unnamed gene (e.g., CTL0080): hero shows locus tag large in mono
- All sections render without JS errors
- Favorite star syncs between list and detail
- Mol* "Load 3D viewer" button visible (even if mmcif_path is null, it's hidden)

Check browser console — zero errors expected.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: cell localization placeholder, remove old detail code, mobile fallback"
```

---

## Task 11: Deploy + verify on Vercel

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

Vercel auto-deploys on push. Wait ~60 seconds.

- [ ] **Step 2: Verify on live URL**

Open `https://chlamatlas.vercel.app` (or the Vercel preview URL). Navigate to Genomes tab. Click a gene. Confirm:
- Hero renders immediately (no flash)
- Gene info section populates synchronously
- Skeleton loaders appear for async sections
- No JS errors in browser console
- The site is responsive on mobile viewport (375px)

---

## Self-Review: Spec Coverage

| Spec requirement | Task covering it |
|-----------------|------------------|
| Hero: gene name / locus / product / badges / star | Task 3 |
| Hero: no stat bar; unnamed gene → locus tag large | Task 3 |
| Gene Info: length, strand, position, flag pills, NCBI/UniProt links | Tasks 4, 7 |
| Orthologs: per-strain rows, clickable, strain color bar | Task 5 |
| Genomic Context: 2-row SVG gene map, clickable neighbors | Task 6 |
| Protein: description text (Column J), mass/length/TM/SP/localization/family | Task 7 |
| Transcriptomics: CT-D bar chart, CT-L2 pattern badge, empty state | Task 8 |
| EB/RB Proteomics: spectral count bars | Task 8 |
| Structure: Crystal/AFv3/AFv2 tabs, thumbnail, Mol* lazy load, metadata panel | Task 9 |
| AlphaFold link in Structure (not Gene Info) | Task 9 |
| Cell Localization: placeholder (SwissBioPics future) | Task 10 |
| Favorite star sync between list and detail | Tasks 3, 10 |
| Section headers: no emojis, accent bar + all-caps | Tasks 3–10 (via `sectionHead()`) |
| Category-color hero gradient | Task 3 |
| Mobile fallback | Task 10 |

**Data dependencies (external to this plan):**
- `genes.product` and `genes.sort_index` populated → Task 1
- `proteins` table populated → protein section shows data
- `alphafold_results` table populated → structure section shows data
- `expression_data` table populated → transcriptomics/proteomics show data
- `orthologs` table populated → orthologs section shows data
