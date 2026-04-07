# ChlamAtlas — Gene Detail Panel Design
**Spec date:** 2026-04-06
**Scope:** `web/js/views/genomes.js` (detail panel functions only)

---

## Overview

The gene detail panel is the primary information view for a single gene/protein. It loads when a gene row is selected in the Genomes list. On desktop it occupies the right half of the split-pane layout; on mobile it replaces the full screen.

The panel is organized into **conceptual sections** that map to distinct scientific audiences. Not every user will care about every section. On desktop all sections default to expanded but are individually collapsible. On mobile the sections are presented as **tabs** across the top of the panel.

---

## Layout

### Desktop (≥ 640px)

The detail panel is the right column of the existing split-pane layout. It scrolls independently.

```
┌─ Detail panel (fills remaining width) ──────────────────┐
│  Header: AF thumb | gene name | locus | product | badge  │
│  ─────────────────────────────────────────────────────── │
│  ▾ Gene Info          (expanded by default)              │
│  ▾ Protein Info       (expanded by default)              │
│  ▾ Structure          (expanded by default)              │
│  ▾ Transcriptomics    (expanded by default)              │
│  ▾ Proteomics         (expanded by default)              │
│  ▸ Localization       (placeholder — collapsed)          │
│  ▸ Protein Interactions (placeholder — collapsed)        │
└──────────────────────────────────────────────────────────┘
```

- Section toggle: chevron `▾`/`▸` at left of section header, full-width clickable
- Section header: `8px`, `700` weight, uppercase, letter-spacing `0.1em`, color `#1a6b4a`
- Section body: `padding: 12px 20px`
- `border-bottom: 1px solid #f5f5f5` between sections
- Placeholder sections (Localization, Protein Interactions): collapsed by default, clearly labeled as "Coming soon" when opened

### Mobile (< 640px)

Full-screen view replacing the list. Tabs at the top navigate between sections.

```
┌─────────────────────────────────────────┐
│  ‹ Gene list   [gene name]   [★]        │
│  ─────────────────────────────────────  │
│  [Gene] [Protein] [Structure] [Expr ▾]  │
│  ─────────────────────────────────────  │
│  (active tab content)                   │
└─────────────────────────────────────────┘
```

- Back button `‹ Gene list` restores list at previous scroll position
- Tab bar: scrollable horizontally if needed; active tab green underline
- "Expr" tab has a sub-dropdown for Transcriptomics vs. Proteomics (or two separate tabs — implement whichever is cleaner)
- Future placeholder tabs (Localization, Interactions) shown but grayed out with a "Soon" badge

---

## Panel Header

Displayed above sections on both desktop and mobile.

```
┌─ [52×52 AF thumb] ─┬─ gene_name (large)  ──── [CT-L2 badge] [★] ─┐
│                    │  locus_tag (mono)                              │
│                    │  product description (truncated to 2 lines)   │
└────────────────────┴────────────────────────────────────────────────┘
```

- AF thumbnail: `52×52px`, `border-radius: 10px`, `border: 1px solid #e5e7eb`. If no thumbnail: gray `⬡` placeholder. Clicking the thumb triggers the Mol* viewer (handled in Structure section).
- Gene name: `19px`, `700`, `#111`. Falls back to locus tag in monospace if no gene name.
- Locus tag: `10px`, `#9ca3af`, DM Mono
- Product: `11.5px`, `#555`, max 2 lines, ellipsis
- Strain badge: top-right, `#16a34a` on `#f0fdf4`, `8.5px`, uppercase (e.g. `CT-L2`)
- Favorite star: top-right beside badge, `#f59e0b` filled / `#e5e7eb` empty. `data-id` set for sync with list star.

---

## Section 1 — Gene Info

**Data source:** `genes` table + `orthologs` table

**Content:**

### Properties row
Compact horizontal key-value pairs:
- Length: `{end_bp} bp`
- Strand: `+` or `−`
- Functional category: colored dot + label (using `CATEGORY_COLORS`)
- Flags (only shown if true): `Inc` · `Membrane` · `T3 Secreted` · `DNA binding` — rendered as small green badge pills

### Orthologs
One row per ortholog, showing the counterpart gene in each other strain.
```
[CT-D color bar]  CT001  ─  Delta-aminolevulinic acid dehydratase   ›
[CM color bar]    TC0001 ─  Delta-aminolevulinic acid dehydratase   ›
```
- Each row is clickable — loads that gene's detail panel
- Left bar `3px` colored by strain color (from `strains.color_hex`)
- If no orthologs: show `No orthologs recorded` in muted text
- **Data currently empty** — renders empty state until orthologs are imported

### External links
Compact link row: `UniProt ↗` · `NCBI ↗` · `AlphaFold DB ↗`
- UniProt URL: `https://www.uniprot.org/uniprot/{uniprot_id}` (from `proteins` table)
- NCBI URL: `https://www.ncbi.nlm.nih.gov/gene/?term={locus_tag}`
- AlphaFold DB URL: `https://alphafold.ebi.ac.uk/entry/{alphafold_id}` (from `proteins` table)
- Links only shown if the relevant ID exists

---

## Section 2 — Protein Info

**Data source:** `proteins` table (joined via `gene_id`)

**Content:**
- Mass: `{mass_kd} kDa`
- Length: `{length_aa} aa`
- Protein family: text
- Oligomeric state (e.g. Homooctamer): text
- Signal peptide: Yes / No badge
- Transmembrane domains: count (or "None")
- Function narrative: free text paragraph if present
- Localization: text (e.g. "Inclusion membrane", "Cytoplasm")
- Subcellular location: text (from UniProt)
- Subunit structure: text (e.g. "Composed of six subunits")

**Empty state:** `No protein data imported yet` — muted, italic, 11px

---

## Section 3 — Structure

**Data source:** `alphafold_results` table (joined via `proteins.id`)

**Content:**

### Source toggle
Three-way toggle: `PDB` · `AlphaFold v2` · `AlphaFold v3`
- Active option highlighted green
- PDB: uses `top_homolog_pdb_id`; shows thumbnail if available, "No PDB homolog" if not
- AF v2 / AF v3: uses `af_version` field to distinguish records

### Viewer area
- Static thumbnail shown by default (`thumbnail_path` from `alphafold_results`)
- `"Load 3D viewer"` button below thumbnail → triggers Mol* embed loading `mmcif_path`
- Mol* loads inline (replaces thumbnail area) — lazy-loaded to avoid mobile performance impact
- Below viewer/thumbnail: `top_homolog_description` + `homology_score` + `homology_method`
- Inferred function text if present (`inferred_function`)
- Multimer note: pulled from `proteins.oligomeric_state` — shown as a callout if not monomer

**Empty state:** `No structural data imported yet` — with note that AF models are in the repo

---

## Section 4 — Transcriptomics

**Data source:** `expression_data` table (joined via `gene_id`, `method = 'microarray'`)

**Data availability by strain:**
- **CT-D:** quantitative — actual timepoint values `1h, 3h, 8h, 16h, 24h, 40h` → bar chart
- **CT-L2:** qualitative only — a pattern label (e.g. "Constitutive", "Mid_Late", "Early") with no individual timepoints → displayed as a badge/label, no chart
- **CM:** no transcriptomic data → show "No data" with a note that ortholog data from CT-D may apply *(v2 feature — placeholder for now)*

**Content (when viewing a CT-D gene):**
- Bar chart: timepoints `1h, 3h, 8h, 16h, 24h, 40h` on X axis, expression value on Y axis
- Hover tooltip showing exact value per timepoint

**Content (when viewing a CT-L2 gene):**
- Expression pattern badge: e.g. `MID_LATE`, `CONSTITUTIVE`, `EARLY` — styled as a colored pill
- Note: "Quantitative timepoint data not available for CT-L2"

**Visual:**
- Bars: `#4ade80` (green)
- Chart height: ~120px
- Font: DM Mono for axis labels

**Empty state:** `No expression data imported yet`

---

## Section 5 — Proteomics

**Data source:** `expression_data` table (`method = 'rnaseq'` or separate EB/RB columns — confirm on import)

**Content:**
- EB proteomics value (spectral counts or LFQ)
- RB proteomics value
- Enrichment ratio if present
- Source publication linked if available

**Data availability by strain:**
- **CT-L2 and CT-D:** raw spectral count values for EB and RB forms
- **CM:** no proteomic data

**Note:** `EB` and `RB` in the CSV are raw proteomic spectral counts (mass spectrometry). The split from Transcriptomics is intentional — different measurement method, different scientific interpretation.

**Empty state:** `No proteomic data imported yet`

---

## Section 6 — Localization *(placeholder)*

Collapsed by default. When opened:
```
🔬 Coming soon
Subcellular localization visualizer — will show a schematic
Chlamydia cell diagram with protein position annotated.
```
Muted italic, 11px. No interactive content yet.

---

## Section 7 — Protein Interactions *(placeholder)*

Collapsed by default. When opened:
```
🔗 Coming soon
Known protein-protein interactions — curated lab data,
not STRING predictions.
```
Muted italic, 11px. No interactive content yet.

---

## Data Fetch Strategy

Single detail load fires two parallel queries:

```js
// Q1: gene row (already in hand from list — passed directly, no re-fetch needed)

// Q2: protein + alphafold_results + expression
sb.from('proteins')
  .select(`*, alphafold_results(*), expression_data(*)`)
  .eq('gene_id', geneId)
  .maybeSingle()

// Q3: orthologs
sb.from('orthologs')
  .select(`*, gene_b:genes!gene_id_b(id, locus_tag, gene_name, strain_id, strains(common_name, color_hex))`)
  .eq('gene_id_a', geneId)
```

Q2 and Q3 fire in parallel. The header renders immediately from the gene row data passed in (no loading flash for name/locus). Sections render a skeleton loader then replace with data when queries resolve.

---

## Empty / Loading States

- **Loading:** each section body shows a subtle skeleton (2–3 gray bars, animated pulse) while queries are in-flight
- **No data:** muted italic text, no error — just "No [x] data yet" 
- **Query error:** small red inline note "Failed to load — tap to retry"
- Sections with no data and no loading state are **hidden entirely** once data resolves (not shown as empty blocks) — exception: placeholder sections 6 & 7 which always show

---

## Implementation Notes

- Gene row data is passed directly into `showGeneDetail(gene, container)` — avoids a redundant re-fetch of the genes row
- On desktop, `_selectedId` is tracked in module state; selected row gets green left border + `#f0fdf4` background
- On mobile, detail replaces `container.innerHTML`; back button calls `showGeneList(container)` restoring `_scrollPos`
- Collapsible state stored in a module-level object `_sectionOpen = { gene: true, protein: true, structure: true, transcriptomics: true, proteomics: true, localization: false, interactions: false }` — persists while the panel is open, resets on new gene selection
- Mol* viewer: lazy-loaded via dynamic `import()` — only loads the library when user clicks "Load 3D viewer"

---

## Out of Scope (this spec)

- Chromosome/genome context map (Gene Info section placeholder — future feature)
- Cross-strain expression comparison toggle in Transcriptomics (future)
- Mol* full implementation details (separate focused session)
- `user_favorites` DB table (localStorage stopgap remains)
- Edit mode / admin annotations
