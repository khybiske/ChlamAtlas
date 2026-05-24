# Per-Gene Locus Maps for Multi-Gene Mutants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the zoomed-out genomic map on multi-gene mutants by fetching independent ±4 neighborhoods per gene and embedding each map inside its gene card (1-gene unchanged; 2-gene: map inside each card; 3+: no maps).

**Architecture:** All changes are in `mutants.js`. The neighborhood fetch becomes per-gene for the 2-gene case. A new `singleGeneMapSVG(gene, neighborhood, mutationType)` helper extracts SVG-only output from `geneLociMapHTML`. `geneCardsHTML` gains `neighborhoods` and `mutationType` parameters and appends the map strip to each card in the 2-gene case. The call site passes `neighborhoods` and skips `geneLociMapHTML` for multi-gene mutants.

**Tech Stack:** Vanilla JS, Supabase JS client, inline SVG.

---

## File Map

| File | Action |
|---|---|
| `web/js/views/mutants.js` | Modify neighborhood fetch, add `singleGeneMapSVG`, update `geneCardsHTML`, update call site |

---

## Task 1: Change neighborhood fetch to per-gene for 2-gene case

**Files:**
- Modify: `web/js/views/mutants.js:643–663`

- [ ] **Step 1: Replace the neighborhood fetch block**

Find the existing block (lines 643–663):
```js
    // Fetch genomic neighborhood (±6 flanking) for the locus map
    if (genes.length) {
      const strainId  = genes[0].strain_id;
      const validIdx  = genes.map(g => g.sort_index).filter(i => i != null);
      if (validIdx.length && strainId) {
        const minIdx = Math.min(...validIdx);
        const maxIdx = Math.max(...validIdx);
        // Plasmid genes cluster at high sort_index — show all 8; chromosome: ±6
        const isPlasmid  = minIdx >= 871;
        const lo = isPlasmid ? 871 : Math.max(0, minIdx - 4);
        const hi = isPlasmid ? 878 : maxIdx + 4;
        const { data: nbData } = await sb
          .from('genes')
          .select('id,locus_tag,gene_name,functional_category,start_bp,end_bp,strand,sort_index')
          .eq('strain_id', strainId)
          .gte('sort_index', lo)
          .lte('sort_index', hi)
          .order('sort_index');
        neighborhood = nbData ?? [];
      }
    }
```

Replace with:
```js
    // Fetch genomic neighborhood for locus map.
    // 1 gene: single fetch ±4 around that gene.
    // 2 genes: two parallel fetches, one per gene (independent ±4 each).
    // 3+ genes: no fetch (list layout, no maps).
    if (genes.length === 1 || genes.length === 2) {
      const fetchNb = async (g) => {
        if (g.sort_index == null || !g.strain_id) return [];
        const isPlasmid = g.sort_index >= 871;
        const lo = isPlasmid ? 871 : Math.max(0, g.sort_index - 4);
        const hi = isPlasmid ? 878 : g.sort_index + 4;
        const { data } = await sb
          .from('genes')
          .select('id,locus_tag,gene_name,functional_category,start_bp,end_bp,strand,sort_index')
          .eq('strain_id', g.strain_id)
          .gte('sort_index', lo)
          .lte('sort_index', hi)
          .order('sort_index');
        return data ?? [];
      };
      neighborhoods = await Promise.all(genes.map(fetchNb));
      neighborhood  = neighborhoods[0] ?? [];  // keep for 1-gene geneLociMapHTML call
    }
```

Note: `neighborhoods` and `neighborhood` must be declared before this block. Find the existing `let neighborhood = [];` declaration (around line 632) and add `let neighborhoods = [];` on the line after it.

- [ ] **Step 2: Add `neighborhoods` declaration**

Find:
```js
  let neighborhood = [];
```

Replace with:
```js
  let neighborhood  = [];
  let neighborhoods = [];
```

- [ ] **Step 3: Verify the call site still passes `neighborhood` to `geneLociMapHTML`**

Line 673 should read:
```js
    ${geneLociMapHTML(genes, neighborhood, m.mutation_type)}
```
This is unchanged — `neighborhood` is still assigned from `neighborhoods[0]` in the new fetch block, so the 1-gene case works identically.

---

## Task 2: Add `singleGeneMapSVG` helper

**Files:**
- Modify: `web/js/views/mutants.js` — add new function just before `geneLociMapHTML` (~line 848)

- [ ] **Step 1: Insert `singleGeneMapSVG` immediately before the `// ─── Genomic locus map` comment**

```js
// Returns just the SVG markup for a single gene's neighborhood — used inside
// 2-gene card strips. Shares all layout logic with geneLociMapHTML.
function singleGeneMapSVG(gene, neighborhood, mutationType) {
  if (!neighborhood.length) return '';

  const targetIds = new Set([gene.id]);

  const typeStroke = {
    transposon: '#047857',
    deletion:   '#b91c1c',
    chemical:   '#6d28d9',
    chimera:    '#0e7490',
  };
  const hitStroke = typeStroke[mutationType] ?? typeStroke.deletion;

  const VB_W    = 600;
  const VB_H    = 94;
  const SPINE_Y = 46;
  const P_TOP   = 34; const P_BOT = 46;
  const N_TOP   = 48; const N_BOT = 60;
  const TGT_PAD = 3;
  const TIP     = 9;
  const MIN_W   = 26;

  const hasStrand = neighborhood.some(g => g.strand);

  const gLen = g => (g.start_bp != null && g.end_bp != null)
    ? g.end_bp - g.start_bp
    : (g.end_bp ?? 600) * 3;

  const totalBp = neighborhood.reduce((s, g) => s + Math.max(gLen(g), 1), 0);
  const scale   = (VB_W - 20) / Math.max(totalBp, 1);

  let cx = 10;
  const defs = neighborhood.map(g => {
    const w   = Math.max(Math.round(gLen(g) * scale), MIN_W);
    const def = { g, x: cx, w };
    cx += w + 2;
    return def;
  });
  const actualVbW = cx + 8;

  const backbone = `<line x1="10" y1="${SPINE_Y}" x2="${actualVbW - 10}" y2="${SPINE_Y}" stroke="#d9d9d9" stroke-width="1.2"/>`;

  const strandLabels = hasStrand ? `
    <text x="5" y="${(P_TOP + P_BOT) / 2 + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">+</text>
    <text x="5" y="${(N_TOP + N_BOT) / 2 + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">−</text>` : '';

  const arrows = defs.map(({ g, x, w }, idx) => {
    const isTarget  = targetIds.has(g.id);
    const isPlus    = !hasStrand || g.strand !== '-';
    const top       = isPlus ? P_TOP : N_TOP;
    const bot       = isPlus ? P_BOT : N_BOT;
    const ktop      = isTarget ? top - TGT_PAD : top;
    const kbot      = isTarget ? bot + TGT_PAD : bot;
    const mid       = (ktop + kbot) / 2;
    const fill      = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
    const opacity   = isTarget ? '1' : '0.82';

    const pts = isPlus
      ? `${x},${ktop} ${x + w - TIP},${ktop} ${x + w},${mid} ${x + w - TIP},${kbot} ${x},${kbot}`
      : `${x + w},${ktop} ${x + TIP},${ktop} ${x},${mid} ${x + TIP},${kbot} ${x + w},${kbot}`;

    const strokeEl = isTarget
      ? `<polygon points="${pts}" fill="none" stroke="${hitStroke}" stroke-width="1.5"/>`
      : '';

    const midX = x + w / 2;
    const isNamed = g.gene_name && g.gene_name !== g.locus_tag;
    const staggerLevels = w < 35 ? 4 : 2;
    const level         = idx % staggerLevels;
    const aboveStagger  = -(level * 8);
    const belowStagger  =   level * 8;
    const nameY  = isPlus ? ktop - 4 + aboveStagger : kbot + 9 + belowStagger;
    const locusY = isPlus ? kbot + 9 + belowStagger  : ktop - 4 + aboveStagger;

    const nameEl = isNamed
      ? `<text x="${midX}" y="${nameY}" text-anchor="middle"
               font-family="DM Sans,sans-serif" font-size="${isTarget ? 9 : 7.5}"
               font-weight="600" fill="${isTarget ? '#222' : '#888'}">${g.gene_name}</text>`
      : '';

    const locusEl = `<text x="${midX}" y="${locusY}" text-anchor="middle"
                          font-family="DM Mono,monospace" font-size="${isTarget ? 8 : 7}"
                          font-weight="${isTarget ? '700' : '400'}"
                          fill="${isTarget ? '#111' : '#bbb'}">${g.locus_tag}</text>`;

    const tip = `${g.locus_tag}${isNamed ? ' · ' + g.gene_name : ''}${g.strand ? ' (' + g.strand + ')' : ''}`;

    return `
      <g style="cursor:default;">
        <title>${tip}</title>
        <polygon points="${pts}" fill="${fill}" opacity="${opacity}"/>
        ${strokeEl}
        ${nameEl}
        ${locusEl}
      </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${actualVbW} ${VB_H}" xmlns="http://www.w3.org/2000/svg"
               style="width:100%;height:auto;display:block;overflow:visible;">
    ${backbone}
    ${strandLabels}
    ${arrows}
  </svg>`;
}

```

---

## Task 3: Update `geneCardsHTML` to embed maps in 2-gene cards

**Files:**
- Modify: `web/js/views/mutants.js:792–826` (the `geneCardsHTML` function)

- [ ] **Step 1: Update the function signature**

Find:
```js
function geneCardsHTML(genes) {
```

Replace with:
```js
function geneCardsHTML(genes, neighborhoods = [], mutationType = '') {
```

- [ ] **Step 2: Update the 2-gene card rendering to embed a map strip**

Find the section that builds individual cards (inside `if (genes.length <= 2)`):
```js
    const cards = genes.map(g => {
      const af = g.proteins?.alphafold_results?.[0];
      const thumb = af?.thumbnail_path
        ? `<img class="mut-gene-thumb" src="${af.thumbnail_path}" alt="">`
        : `<div class="mut-gene-thumb-placeholder">${(g.locus_tag || '?').slice(-2)}</div>`;
      return `
        <div class="mut-gene-card" style="flex:1;min-width:0;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div class="mut-gene-tag">${g.locus_tag}</div>
            ${g.product ? `<div class="mut-gene-desc">${g.product}</div>` : ''}
            ${funcCategoryPill(g.functional_category)}
          </div>
          <button class="mut-gene-link" data-gene-nav="${g.id}"
            style="align-self:center;flex-shrink:0;margin-left:8px;white-space:nowrap;
                   padding:3px 8px;border-radius:5px;border:1px solid #c7ddd3;
                   font-size:0.6875rem;">View in Genomes →</button>
        </div>`;
    }).join('');
```

Replace with:
```js
    const cards = genes.map((g, i) => {
      const af = g.proteins?.alphafold_results?.[0];
      const thumb = af?.thumbnail_path
        ? `<img class="mut-gene-thumb" src="${af.thumbnail_path}" alt="">`
        : `<div class="mut-gene-thumb-placeholder">${(g.locus_tag || '?').slice(-2)}</div>`;
      const nb = neighborhoods[i] ?? [];
      const mapStrip = genes.length === 2 && nb.length
        ? `<div style="border-top:1px solid #f3f4f6;padding:6px 10px 4px;background:#fafafa;">
             ${singleGeneMapSVG(g, nb, mutationType)}
           </div>`
        : '';
      return `
        <div class="mut-gene-card" style="flex:1;min-width:0;flex-direction:column;align-items:stretch;padding:0;overflow:hidden;">
          <div style="display:flex;align-items:flex-start;padding:10px 12px;">
            ${thumb}
            <div style="flex:1;min-width:0;">
              <div class="mut-gene-tag">${g.locus_tag}</div>
              ${g.product ? `<div class="mut-gene-desc">${g.product}</div>` : ''}
              ${funcCategoryPill(g.functional_category)}
            </div>
            <button class="mut-gene-link" data-gene-nav="${g.id}"
              style="align-self:center;flex-shrink:0;margin-left:8px;white-space:nowrap;
                     padding:3px 8px;border-radius:5px;border:1px solid #c7ddd3;
                     font-size:0.6875rem;">View in Genomes →</button>
          </div>
          ${mapStrip}
        </div>`;
    }).join('');
```

---

## Task 4: Update the call site

**Files:**
- Modify: `web/js/views/mutants.js:672–673`

- [ ] **Step 1: Update `geneCardsHTML` call to pass neighborhoods and mutationType**

Find:
```js
    ${geneCardsHTML(genes)}
    ${geneLociMapHTML(genes, neighborhood, m.mutation_type)}
```

Replace with:
```js
    ${geneCardsHTML(genes, neighborhoods, m.mutation_type)}
    ${genes.length === 1 ? geneLociMapHTML(genes, neighborhood, m.mutation_type) : ''}
```

- [ ] **Step 2: Bump the cache version for mutants.js**

In `web/js/app.js`, find:
```js
import { renderMutants } from './views/mutants.js?v=82';
```

Replace with:
```js
import { renderMutants } from './views/mutants.js?v=85';
```

- [ ] **Step 3: Commit**

```bash
git add web/js/views/mutants.js web/js/app.js docs/superpowers/specs/2026-05-24-multigene-locus-maps.md docs/superpowers/plans/2026-05-24-multigene-locus-maps.md
git commit -m "feat: per-gene locus maps for 2-gene mutants; no map for 3+"
```

---

## Task 5: Verify

- [ ] **Step 1: Open UWCM035 (Tn::ompBsucD) in the mutant detail panel**

Navigate to Mutants → find UWCM035. Confirm:
- Two gene cards render side by side
- Each card has a map strip at the bottom, centered on its own gene with ±4 flanking neighbors
- The two maps are independent (not a zoomed-out single map)
- The target gene in each map is highlighted with the transposon stroke color (#047857)

- [ ] **Step 2: Open any single-gene mutant**

Confirm single-gene behavior is unchanged: card on top, standalone "Chromosome Context" section below with its map.

- [ ] **Step 3: Open a 3-gene mutant (if one exists)**

Confirm the list layout renders with no map section.

- [ ] **Step 4: Push**

```bash
git push origin main
```
