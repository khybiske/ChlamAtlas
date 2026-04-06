# ChlamAtlas — Genomes Tab Design
**Spec date:** 2026-04-05
**Scope:** `web/js/views/genomes.js`, `web/css/app.css` (minor), `web/index.html` (no changes required)

---

## Overview

Redesign the Genomes tab to match the Bold Editorial aesthetic established by the home page, and establish the list→detail pattern that the Mutants tab will mirror. The tab provides a power-user gene browser: strain switching, smart search, filter/sort, and a split-pane detail view on desktop.

This spec covers the **list view** and **detail view shell** only. The detail view content sections (gene context map, expression charts, Mol* viewer, etc.) will be designed carefully in a future dedicated brainstorm session — they are placeholders here.

---

## Shared Pattern: Genomes and Mutants

Both Genomes and Mutants follow the identical structural pattern:

```
Strain/collection switcher
  └─ Search bar
       └─ Filter + sort toolbar
            └─ Infinite scroll list
                 └─ Detail view (right panel desktop / full-page mobile)
```

Implementing this pattern cleanly in Genomes means Mutants is a near-reskin.

---

## Functional Category Color System

Gene rows are colored by functional category using a 3px left bar (same visual language as the organism rows on the home page). Colors sourced directly from `ChlamDB - L2.csv` (Annot Color column).

```js
const CATEGORY_COLORS = {
  'Amino acid metabolism':    '#E66729',
  'Cell envelope':            '#00A69D',
  'Cell processes':           '#0052A3',
  'Cofactor metabolism':      '#838FC7',
  'Energy metabolism':        '#EC1C24',
  'Inclusion membrane protein': '#E4B47E',
  'Inermediary metabolism':   '#9D270E',  // note: typo preserved from source data
  'Lipid metabolism':         '#6F2D90',
  'Membrane transport':       '#6DCFF5',
  'Nucleotide metabolism':    '#F497AE',
  'Other':                    '#EBEBEB',
  'Replication':              '#FFF100',
  'Secreted effector':        '#00A551',
  'Transcription':            '#FCB814',
  'Translation':              '#BED630',
  'Type III secretion':       '#8A5D3B',
  'Unknown':                  '#AAAAAA',
};
const CATEGORY_COLOR_DEFAULT = '#E5E7EB';
```

These are hardcoded constants in `genomes.js`. Future: move to a `gene_categories` Supabase table if admin-editability is needed.

---

## Layout

### Desktop (≥ 640px)

Split pane: fixed-width list panel on the left, detail panel fills the rest.

```
┌─────────────────────────────────────────────────────┐
│  Nav (56px dark green)                              │
├──────────────────┬──────────────────────────────────┤
│  Strain tabs     │                                  │
│  Search bar      │   Gene detail panel              │
│  Filter toolbar  │   (empty state or gene content)  │
│  ─────────────   │                                  │
│  Gene list       │                                  │
│  (scrollable)    │                                  │
└──────────────────┴──────────────────────────────────┘
```

- List panel width: `300px` fixed
- List panel: `border-right: 1px solid #ececec`
- Detail panel: fills remaining width, `overflow-y: auto`
- Overall min-height: fills viewport below nav (`calc(100vh - 56px)`)

### Mobile (< 640px)

Full-width list. Tapping a gene navigates to a full-page detail view (the list is replaced; a back button returns).

```
┌─────────────────┐
│  Nav (top bar)  │
│  Strain tabs    │
│  Search         │
│  Filter toolbar │
│  ─────────────  │
│  Gene list      │
│  (scrollable)   │
│                 │
│  Bottom nav     │
└─────────────────┘
```

---

## Strain Switcher

Tab row directly below the nav (desktop) or at top of content (mobile).

- Tabs: `CT L2/434` · `CT D/UW-3` · `CM`
- Font: 9.5px, 600 weight, **not italic**
- Active tab: `color: #16a34a`, `border-bottom: 2px solid #16a34a`
- Inactive: `color: #9ca3af`
- Switching strain resets search, active filters, and reloads the gene list
- `border-bottom: 1px solid #efefef` below the tab row

Strain ID mapping (used for Supabase queries):
```js
const STRAINS = [
  { id: 'CT-L2', label: 'CT L2/434',  supabaseId: 'CT-L2' },
  { id: 'CT-D',  label: 'CT D/UW-3',  supabaseId: 'CT-D'  },
  { id: 'CM',    label: 'CM',          supabaseId: 'CM'    },
];
```

---

## Search

- Placeholder: `Search genes, locus tags, products…`
- Background: `#f9fafb`, border: `1px solid #e5e7eb`, border-radius: `7px`
- Padding: `5px 10px`, font-size: `10.5px`
- **Smart matching:** searches `locus_tag`, `gene_name`, `product`, and `aliases[]` fields
- 280ms debounce before firing query
- Resets to page 0 on each new search

---

## Filter & Sort Toolbar (Option A — always visible)

A compact bar between search and the gene list. Always visible; no expand/collapse.

```
[ ⇅ Locus tag ▾ ]  [ ★ Favorites ]  [ Characterized ]  [ Inc ]  [ + More ]
```

- Background: `#fafafa`, `border-bottom: 1px solid #f0f0f0`
- Padding: `5px 10px`, gap `5px`, `flex-wrap: wrap`

### Sort button
- Shows current sort field + chevron
- Tapping opens a small dropdown below the button
- Sort options:
  - Locus tag (default, ascending)
  - Gene name (A→Z, nulls last)
  - Protein size (kDa, ascending)
  - Expression level (EB value, descending)

### Filter chips
Always-visible chips (most common):
| Chip | Behavior |
|------|----------|
| ★ Favorites | Filter to favorited genes for current user (localStorage for now) |
| Characterized | Filter to `is_hypothetical = false` |
| Inc | Filter to `is_inc = true` |

`+ More` button opens a small inline-expand panel below the toolbar with additional options:
| Filter | Field |
|--------|-------|
| Membrane | `is_membrane = true` |
| Secreted | `is_secreted = true` |
| Has structure | `af_image_url IS NOT NULL` |
| Has mutant | join to `mutants` table (future — placeholder chip, disabled for now) |
| Category | Multi-select from `CATEGORY_COLORS` keys |

Active chips: `background: #f0fdf4`, `color: #16a34a`, `border-color: #bbf7d0`
Inactive chips: white background, `color: #9ca3af`, `border: 1px solid #e5e7eb`

### Result count
Below the toolbar, a single line: `895 genes` (or `247 genes` when filtered).
Font: 9px, `#bbb`, DM Mono. Updates reactively with filter/search state.

---

## Gene List

### Infinite scroll
- Fixed-height scrollable container (`flex: 1`, `overflow-y: auto`)
- Load 50 rows on initial render
- Append next 50 when user scrolls within ~100px of bottom (IntersectionObserver on a sentinel element)
- No prev/next pagination buttons

### Gene row anatomy
```
┌─ 3px bar ─┬─ AF thumb ─┬─ name + locus ──────────────── star ─ › ─┐
│  (color)  │  (28×28)   │  gene_name  CTL0001                ☆      │
│           │            │  product description                       │
└───────────┴────────────┴───────────────────────────────────────────┘
```

- Row height: ~44px (auto)
- `border-bottom: 1px solid #f7f7f7`
- Hover: `background: #fafafa`
- Selected (desktop): `background: #f0fdf4`, `border-left: 2px solid #16a34a`

**Left bar:** `width: 3px`, `height: 100%` (full row height), `border-radius: 0`, color from `CATEGORY_COLORS[gene.function] ?? CATEGORY_COLOR_DEFAULT`

**AF thumbnail:** `28×28px`, `border-radius: 6px`. If `af_image_url` is null: gray placeholder with `⬡` icon.

**Gene name:** If `gene_name` is present: `font-size: 10.5px`, `font-weight: 600`, `color: #111`. Locus tag beside it: `font-size: 9px`, `color: #9ca3af`, DM Mono.
If no `gene_name`: locus tag only, `font-size: 10px`, `font-weight: 500`, `color: #9ca3af`, DM Mono.

**Product:** `font-size: 9.5px`, `color: #9ca3af`, single line, truncated with ellipsis.

**Star:** `font-size: 11px`. Filled `★` in `#f59e0b` if favorited; empty `☆` in `#e5e7eb` if not. Tapping toggles favorite state (requires auth; guest sees no star). Stored in `user_favorites` table (future table — placeholder UI for now, non-functional).

**Chevron:** `›` in `#ddd`.

---

## Gene Detail View

### Desktop behavior
Clicking a gene row loads the detail into the right panel. The list remains visible and the selected row highlights. No page navigation.

### Mobile behavior
Tapping a gene row replaces the full content area with the detail view. A back button (`‹ Gene list`) at the top returns to the list, restoring scroll position.

### Detail panel — header
```
┌─ AF thumb (52×52) ─┬─ gene name (large) ──── [CT-L2 badge]  [★] ─┐
│                    │  locus tag (mono)                              │
│                    │  product description                           │
└────────────────────┴────────────────────────────────────────────────┘
```

- AF thumb: `52×52px`, `border-radius: 10px`, `border: 1px solid #e5e7eb`. Clicking loads Mol* viewer.
- Gene name: 19px, 700 weight, `#111`
- Locus tag: 10px, `#9ca3af`, DM Mono
- Product: 11.5px, `#555`
- Strain badge: top-right, `#16a34a` on `#f0fdf4`, 8.5px, uppercase
- Star/favorite: top-right beside badge, `#f59e0b` filled or `#e5e7eb` empty

### Detail panel — content sections (placeholders)

Each section: `padding: 11px 20px`, `border-bottom: 1px solid #f5f5f5`
Section label: 8px, 700 weight, uppercase, letter-spacing 0.1em, `#1a6b4a`

Sections (order):
1. **Gene properties** — Length (bp + kDa), Function, Subcellular location, Inc/Membrane/Secreted flags
2. **Orthologs** — one row per ortholog, colored left bar by strain color, clickable (loads that gene's detail)
3. **Expression data** — T0–T5 bar chart (blue bars), EB/RB values. *(Full design: future session)*
4. **AlphaFold structure** — static thumbnail + "Load 3D viewer" trigger → Mol* viewer. *(Full design: future session)*
5. **Gene context map** — placeholder section; will show neighboring genes on the chromosome. *(Future feature)*
6. **External databases** — UniProt, AlphaFold DB, PDB, NCBI links
7. **GO annotations** — Biological process, Molecular function, Cellular component (if present)

Sections with no data are omitted entirely (not shown as empty).

---

## Empty State (desktop, no gene selected)

Right panel shows a centered placeholder:
```
🧬
Select a gene to view details
```
Icon: 28px, `color: #d1d5db`
Text: 12px, `color: #d1d5db`

---

## Favorites (User-defined)

- Star icon rendered on every gene row and in the detail header
- For guests: star is not rendered (favorites require auth)
- For authenticated users: tapping star toggles favorite state
- Stored in `user_favorites` table: `(user_id, gene_id)` — **table does not exist yet; this is a data model placeholder**
- Filter chip `★ Favorites` filters list to favorited genes for current user
- Implementation note: for Phase 1, store favorites in `localStorage` keyed by `user_id + gene_id` as a stopgap until the DB table is created

---

## Supabase Query Shape

### Gene list query
```js
sb.from('genes')
  .select('id, locus_tag, gene_name, product, "function", af_image_url, is_hypothetical, is_inc, is_membrane, is_secreted, mass_kd, microarray_category')
  // note: "function" is quoted because it is a reserved SQL word
  .eq('strain_id', strainId)
  // + search filter if active (ilike on locus_tag, gene_name, product)
  // + boolean filters if active
  .order(sortField, { ascending: sortAsc, nullsFirst: false })
  .range(from, from + PAGE_SIZE - 1)
```

### Gene detail query
```js
sb.from('genes').select('*').eq('id', geneId).single()
// + orthologs join (existing pattern)
```

---

## Implementation Files

| File | Change |
|------|--------|
| `web/js/views/genomes.js` | Full rewrite: `renderGenomes`, `showGeneList`, `showGeneDetail`, filter/sort state, infinite scroll |
| `web/css/app.css` | No changes expected — inline styles used throughout |
| `web/index.html` | No changes |

---

## Out of Scope (this spec)

- Full gene detail panel design (future brainstorm session)
- Gene context map / chromosome browser
- `user_favorites` Supabase table and RLS policies
- Cross-strain expression comparison
- Downloadable FASTA sequences
- Mutants tab (separate spec — mirrors this pattern)
