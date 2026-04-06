# Genomes Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Genomes tab as a Bold Editorial split-pane browser (list left, detail right on desktop; full-page detail on mobile) with functional-category color coding, smart search, filter/sort toolbar, infinite scroll, and localStorage-based favorites.

**Architecture:** `genomes.js` is a full rewrite — same export (`renderGenomes`), same split between list and detail, but new layout engine, new state model, and new query shape. `index.html` and `app.js` are untouched. The split-pane works within the existing `max-w-5xl mx-auto px-4` container on `#genomes-content`.

**Tech Stack:** Vanilla JS, Tailwind CSS (CDN), Supabase JS client, IntersectionObserver API, localStorage.

**Spec:** `docs/superpowers/specs/2026-04-05-genomes-tab-design.md`

---

## File Map

| File | What changes |
|------|-------------|
| `web/js/views/genomes.js` | Full rewrite — all functions replaced |

No other files change.

---

## Task 1: Constants and module-level state

**Files:**
- Modify: `web/js/views/genomes.js` (lines 1–18)

Replace the top of the file (everything before `export function renderGenomes`) with new constants and state.

- [ ] **Step 1: Replace the top of `genomes.js`**

Replace lines 1–18 (the old `STRAINS`, `PAGE_SIZE`, and module-level `let` declarations) with:

```js
// ChlamAtlas — Genomes tab
import { sb, state } from '../app.js';

const STRAINS = [
  { id: 'CT-L2', label: 'CT L2/434' },
  { id: 'CT-D',  label: 'CT D/UW-3' },
  { id: 'CM',    label: 'CM'         },
];

const CATEGORY_COLORS = {
  'Amino acid metabolism':      '#E66729',
  'Cell envelope':              '#00A69D',
  'Cell processes':             '#0052A3',
  'Cofactor metabolism':        '#838FC7',
  'Energy metabolism':          '#EC1C24',
  'Inclusion membrane protein': '#E4B47E',
  'Inermediary metabolism':     '#9D270E',
  'Lipid metabolism':           '#6F2D90',
  'Membrane transport':         '#6DCFF5',
  'Nucleotide metabolism':      '#F497AE',
  'Other':                      '#EBEBEB',
  'Replication':                '#FFF100',
  'Secreted effector':          '#00A551',
  'Transcription':              '#FCB814',
  'Translation':                '#BED630',
  'Type III secretion':         '#8A5D3B',
  'Unknown':                    '#AAAAAA',
};
const CATEGORY_COLOR_DEFAULT = '#E5E7EB';

const PAGE_SIZE = 50;
const FAVORITES_KEY = 'chlamatlas_favorites';

// ── Module-level state (reset on each renderGenomes call) ──
let _strain      = null;
let _search      = '';
let _searchTimer = null;
let _sortField   = 'sort_index';
let _sortAsc     = true;
let _filters     = { favorites: false, characterized: false, inc: false,
                     membrane: false, secreted: false, hasStructure: false };
let _offset      = 0;
let _total       = 0;
let _hasMore     = false;
let _loading     = false;
let _selectedId  = null;
let _scrollPos   = 0;
```

- [ ] **Step 2: Verify no syntax errors**

Open `http://localhost:3000` (or however the app is served locally). The Genomes tab may show nothing yet — that's expected. Confirm no JS console errors about imports or syntax.

- [ ] **Step 3: Commit**

```bash
cd /Users/khybiske/Developer/web/ChlamAtlas
git add web/js/views/genomes.js
git commit -m "refactor: replace genomes constants and module state"
```

---

## Task 2: Page skeleton, renderGenomes, and strain switcher

**Files:**
- Modify: `web/js/views/genomes.js` — replace `renderGenomes`, `showStrainSelector`, add `showGeneList` skeleton

- [ ] **Step 1: Replace `renderGenomes` and `showStrainSelector`, add `showGeneList` skeleton**

Replace the existing `renderGenomes` and `showStrainSelector` functions entirely. Add the `showGeneList` function stub. Keep all existing functions below (`fetchGenes`, `geneRow`, etc.) — they will be replaced in later tasks.

```js
export function renderGenomes(container) {
  // Pick up strain preference set by home page organisms section
  _strain = window.__preferredStrain ?? 'CT-L2';
  delete window.__preferredStrain;
  _search = ''; _offset = 0; _selectedId = null;
  _filters = { favorites: false, characterized: false, inc: false,
               membrane: false, secreted: false, hasStructure: false };
  showGeneList(container);
}

function showGeneList(container) {
  const isMobile = window.innerWidth < 640;

  container.style.padding = '0';

  container.innerHTML = `
    <div style="display:${isMobile ? 'block' : 'grid'};grid-template-columns:300px 1fr;height:calc(100vh - 56px${isMobile ? ' - 52px' : ''});">

      <!-- ── List panel ── -->
      <div id="list-panel" style="border-right:1px solid #ececec;display:flex;flex-direction:column;overflow:hidden;${isMobile ? '' : ''}">

        <!-- Strain tabs -->
        <div id="strain-tabs" style="display:flex;border-bottom:1px solid #efefef;padding:8px 12px 0;flex-shrink:0;">
          ${STRAINS.map(s => `
            <button data-strain="${s.id}"
              style="font-size:9.5px;font-weight:600;padding:4px 8px 7px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;margin-bottom:-1px;white-space:nowrap;color:${s.id === _strain ? '#16a34a' : '#9ca3af'};border-bottom-color:${s.id === _strain ? '#16a34a' : 'transparent'};">
              ${s.label}
            </button>`).join('')}
        </div>

        <!-- Search -->
        <div style="padding:7px 10px;border-bottom:1px solid #f3f3f3;flex-shrink:0;">
          <input id="gene-search" type="search"
            placeholder="Search genes, locus tags, products…"
            value="${_search}"
            style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;padding:5px 10px;font-size:10.5px;outline:none;font-family:inherit;" />
        </div>

        <!-- Filter/sort toolbar -->
        <div id="filter-bar" style="flex-shrink:0;"></div>

        <!-- Result count -->
        <div id="result-count" style="font-size:9px;color:#bbb;font-family:'DM Mono',monospace;padding:3px 12px 3px;border-bottom:1px solid #f5f5f5;flex-shrink:0;"></div>

        <!-- Gene list (scrollable) -->
        <div id="gene-scroll" style="overflow-y:auto;flex:1;">
          <div id="gene-list"></div>
          <div id="scroll-sentinel" style="height:1px;"></div>
        </div>
      </div>

      <!-- ── Detail panel ── -->
      <div id="detail-panel" style="overflow-y:auto;display:${isMobile ? 'none' : 'flex'};flex-direction:column;">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#d1d5db;gap:8px;">
          <span style="font-size:28px;opacity:0.4;">🧬</span>
          <span style="font-size:12px;">Select a gene to view details</span>
        </div>
      </div>

    </div>
  `;

  // Wire strain tabs
  container.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      _strain = btn.dataset.strain;
      _search = ''; _offset = 0; _selectedId = null;
      _filters = { favorites: false, characterized: false, inc: false,
                   membrane: false, secreted: false, hasStructure: false };
      // Update tab styles
      container.querySelectorAll('[data-strain]').forEach(b => {
        const active = b.dataset.strain === _strain;
        b.style.color = active ? '#16a34a' : '#9ca3af';
        b.style.borderBottomColor = active ? '#16a34a' : 'transparent';
      });
      container.querySelector('#gene-search').value = '';
      renderFilterBar(container);
      fetchGenes(container, true);
    });
  });

  // Wire search
  const searchEl = container.querySelector('#gene-search');
  searchEl.addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _search = e.target.value.trim();
    _searchTimer = setTimeout(() => {
      _offset = 0;
      fetchGenes(container, true);
    }, 280);
  });

  renderFilterBar(container);
  fetchGenes(container, true);
}
```

- [ ] **Step 2: Verify strain tabs render**

Open the Genomes tab. You should see three tabs (CT L2/434, CT D/UW-3, CM), a search bar, and an empty gene list area. Switching tabs should change which tab is green. Console should show no errors.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: genomes page skeleton with strain tabs and search"
```

---

## Task 3: Filter/sort toolbar

**Files:**
- Modify: `web/js/views/genomes.js` — add `renderFilterBar()`

- [ ] **Step 1: Add `renderFilterBar()` after `showGeneList`**

```js
const SORT_OPTIONS = [
  { field: 'sort_index',  asc: true,  label: 'Locus tag' },
  { field: 'gene_name',   asc: true,  label: 'Gene name' },
  { field: 'mass_kd',     asc: true,  label: 'Protein size' },
  { field: 'expr_eb',     asc: false, label: 'Expression (EB)' },
];

function renderFilterBar(container) {
  const bar = container.querySelector('#filter-bar');
  if (!bar) return;

  const sortLabel = SORT_OPTIONS.find(o => o.field === _sortField)?.label ?? 'Locus tag';

  const chip = (id, label, active) => `
    <button data-filter="${id}"
      style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:20px;border:1px solid ${active ? '#bbf7d0' : '#e5e7eb'};
             background:${active ? '#f0fdf4' : 'white'};color:${active ? '#16a34a' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${label}
    </button>`;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;">
      <!-- Sort -->
      <div style="position:relative;">
        <button id="sort-btn"
          style="font-size:9.5px;font-weight:500;color:#555;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:3px 7px;cursor:pointer;font-family:inherit;">
          ⇅ ${sortLabel}
        </button>
        <div id="sort-dropdown" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:120px;overflow:hidden;">
          ${SORT_OPTIONS.map(o => `
            <button data-sort-field="${o.field}" data-sort-asc="${o.asc}"
              style="display:block;width:100%;text-align:left;padding:7px 12px;font-size:10px;font-weight:${o.field === _sortField ? '600' : '400'};
                     color:${o.field === _sortField ? '#16a34a' : '#333'};background:${o.field === _sortField ? '#f0fdf4' : 'none'};border:none;cursor:pointer;font-family:inherit;">
              ${o.label}
            </button>`).join('')}
        </div>
      </div>
      <!-- Always-visible chips -->
      ${chip('favorites',    '★ Favorites',  _filters.favorites)}
      ${chip('characterized','Characterized', _filters.characterized)}
      ${chip('inc',          'Inc',           _filters.inc)}
      <!-- More button -->
      <button id="more-filters-btn"
        style="font-size:9px;font-weight:600;color:#9ca3af;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:2px 7px;cursor:pointer;margin-left:auto;font-family:inherit;">
        + More
      </button>
    </div>
    <!-- Expanded "more" panel -->
    <div id="more-panel" style="display:none;padding:8px 10px;background:#fafafa;border-bottom:1px solid #f0f0f0;display:none;flex-wrap:wrap;gap:5px;">
      ${chip('membrane',    'Membrane',     _filters.membrane)}
      ${chip('secreted',    'Secreted',     _filters.secreted)}
      ${chip('hasStructure','Has structure', _filters.hasStructure)}
    </div>
  `;

  // Sort dropdown toggle
  const sortBtn = bar.querySelector('#sort-btn');
  const sortDrop = bar.querySelector('#sort-dropdown');
  sortBtn.addEventListener('click', e => {
    e.stopPropagation();
    sortDrop.style.display = sortDrop.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { sortDrop.style.display = 'none'; }, { once: true });

  bar.querySelectorAll('[data-sort-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      _sortField = btn.dataset.sortField;
      _sortAsc   = btn.dataset.sortAsc === 'true';
      _offset = 0;
      renderFilterBar(container);
      fetchGenes(container, true);
    });
  });

  // Filter chip toggles
  bar.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      _filters[key] = !_filters[key];
      _offset = 0;
      renderFilterBar(container);
      fetchGenes(container, true);
    });
  });

  // More filters toggle
  const moreBtn = bar.querySelector('#more-filters-btn');
  const morePanel = bar.querySelector('#more-panel');
  if (moreBtn && morePanel) {
    moreBtn.addEventListener('click', () => {
      const open = morePanel.style.display === 'flex';
      morePanel.style.display = open ? 'none' : 'flex';
      moreBtn.textContent = open ? '+ More' : '− Less';
    });
  }
}
```

- [ ] **Step 2: Verify toolbar renders**

Open the Genomes tab. You should see the filter bar with the sort button, Favorites/Characterized/Inc chips, and a "+ More" button. Clicking "+ More" should expand the secondary filters. Clicking a sort option should update the sort button label. Console: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: genomes filter and sort toolbar"
```

---

## Task 4: Gene list fetch, gene row rendering, and infinite scroll

**Files:**
- Modify: `web/js/views/genomes.js` — replace `fetchGenes`, `geneRow`, `renderPg`, `skeletonRows`; add `appendGeneRows`, `setupInfiniteScroll`

- [ ] **Step 1: Replace `fetchGenes`**

Delete the existing `fetchGenes` function and replace with:

```js
async function fetchGenes(container, reset = false) {
  if (_loading) return;
  if (reset) { _offset = 0; _hasMore = false; }

  _loading = true;
  const list = container.querySelector('#gene-list');
  if (!list) { _loading = false; return; }

  if (reset) {
    list.innerHTML = skeletonRows(8);
    _selectedId = null;
  }

  // Build query
  let q = sb.from('genes')
    .select('id,locus_tag,gene_name,product,function,af_image_url,is_hypothetical,is_inc,is_membrane,is_secreted,mass_kd,expr_eb', { count: 'exact' })
    .eq('strain_id', _strain)
    .order(_sortField, { ascending: _sortAsc, nullsFirst: false })
    .range(_offset, _offset + PAGE_SIZE - 1);

  if (_search) {
    q = q.or(`locus_tag.ilike.%${_search}%,gene_name.ilike.%${_search}%,product.ilike.%${_search}%`);
  }
  if (_filters.characterized) q = q.eq('is_hypothetical', false);
  if (_filters.inc)            q = q.eq('is_inc', true);
  if (_filters.membrane)       q = q.eq('is_membrane', true);
  if (_filters.secreted)       q = q.eq('is_secreted', true);
  if (_filters.hasStructure)   q = q.not('af_image_url', 'is', null);

  const { data: genes, count, error } = await q;
  _loading = false;

  if (error) {
    if (reset) list.innerHTML = `<div style="padding:1.5rem;font-size:0.75rem;color:#ef4444;">${error.message}</div>`;
    return;
  }

  _total   = count ?? 0;
  _hasMore = (_offset + PAGE_SIZE) < _total;

  // Update result count
  const countEl = container.querySelector('#result-count');
  if (countEl) countEl.textContent = `${_total.toLocaleString()} gene${_total !== 1 ? 's' : ''}`;

  if (!genes?.length) {
    if (reset) list.innerHTML = `<div style="padding:2rem;text-align:center;font-size:0.75rem;color:#9ca3af;">No genes found.</div>`;
    return;
  }

  // Apply favorites filter client-side (localStorage)
  let rows = genes;
  if (_filters.favorites) {
    const favs = loadFavorites();
    rows = genes.filter(g => favs.has(String(g.id)));
  }

  if (reset) {
    list.innerHTML = rows.map(g => geneRow(g)).join('');
  } else {
    list.insertAdjacentHTML('beforeend', rows.map(g => geneRow(g)).join(''));
  }

  _offset += PAGE_SIZE;

  // Wire row click handlers for newly added rows
  const newRows = list.querySelectorAll('.gene-row:not([data-wired])');
  newRows.forEach(row => {
    row.dataset.wired = '1';
    row.addEventListener('click', () => {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        showGeneDetailMobile(Number(row.dataset.id), container);
      } else {
        _selectedId = Number(row.dataset.id);
        list.querySelectorAll('.gene-row').forEach(r => {
          const sel = Number(r.dataset.id) === _selectedId;
          r.style.background = sel ? '#f0fdf4' : '';
          r.style.borderLeft = sel ? '2px solid #16a34a' : '';
          r.style.paddingLeft = sel ? '10px' : '';
        });
        showGeneDetailDesktop(Number(row.dataset.id), container);
      }
    });
  });

  setupInfiniteScroll(container);
}

function setupInfiniteScroll(container) {
  const sentinel = container.querySelector('#scroll-sentinel');
  const scroll   = container.querySelector('#gene-scroll');
  if (!sentinel || !scroll) return;

  // Disconnect any existing observer
  if (scroll._observer) scroll._observer.disconnect();

  if (!_hasMore) return;

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !_loading && _hasMore) {
      fetchGenes(container, false);
    }
  }, { root: scroll, threshold: 0 });

  observer.observe(sentinel);
  scroll._observer = observer;
}
```

- [ ] **Step 2: Replace `geneRow` function**

Delete the existing `geneRow` function and replace with:

```js
function geneRow(g) {
  const color = CATEGORY_COLORS[g.function] ?? CATEGORY_COLOR_DEFAULT;
  const favs  = loadFavorites();
  const isFav = favs.has(String(g.id));

  const thumb = g.af_image_url
    ? `<img src="${g.af_image_url}" loading="lazy"
           style="width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;"
           onerror="this.style.display='none'" />`
    : `<div style="width:28px;height:28px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:12px;color:#d1d5db;flex-shrink:0;">⬡</div>`;

  const nameEl = g.gene_name
    ? `<span style="font-size:10.5px;font-weight:600;color:#111;">${g.gene_name}</span>
       <span style="font-size:9px;color:#9ca3af;font-family:'DM Mono',monospace;margin-left:3px;">${g.locus_tag}</span>`
    : `<span style="font-size:10px;font-weight:500;color:#9ca3af;font-family:'DM Mono',monospace;">${g.locus_tag}</span>`;

  const starEl = state.user
    ? `<button class="fav-btn" data-id="${g.id}"
         style="font-size:11px;color:${isFav ? '#f59e0b' : '#e5e7eb'};background:none;border:none;cursor:pointer;flex-shrink:0;padding:0;"
         title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
         ${isFav ? '★' : '☆'}
       </button>`
    : '';

  return `
    <div class="gene-row" data-id="${g.id}"
      style="display:flex;align-items:center;gap:0;border-bottom:1px solid #f7f7f7;cursor:pointer;transition:background 0.1s;"
      onmouseenter="this.style.background='#fafafa'" onmouseleave="this.style.background=this.dataset.sel?'#f0fdf4':''">
      <div style="width:3px;align-self:stretch;background:${color};flex-shrink:0;"></div>
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px 7px 9px;flex:1;min-width:0;">
        ${thumb}
        <div style="flex:1;min-width:0;">
          <div>${nameEl}</div>
          <div style="font-size:9.5px;color:#9ca3af;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.product ?? 'Hypothetical protein'}</div>
        </div>
        ${starEl}
        <span style="font-size:12px;color:#ddd;flex-shrink:0;margin-left:2px;">›</span>
      </div>
    </div>`;
}
```

- [ ] **Step 3: Replace `skeletonRows` helper**

Delete the existing `skeletonRows` and replace with:

```js
function skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f7f7f7;">
      <div style="width:3px;align-self:stretch;background:#f3f3f3;flex-shrink:0;"></div>
      <div style="width:28px;height:28px;border-radius:6px;background:#f3f4f6;flex-shrink:0;animation:pulse 1.5s ease-in-out infinite;"></div>
      <div style="flex:1;">
        <div style="height:10px;width:5rem;background:#f3f4f6;border-radius:4px;margin-bottom:4px;animation:pulse 1.5s ease-in-out infinite;"></div>
        <div style="height:9px;width:9rem;background:#f3f4f6;border-radius:4px;animation:pulse 1.5s ease-in-out infinite;"></div>
      </div>
    </div>`).join('');
}
```

- [ ] **Step 4: Delete `renderPg`**

Delete the entire `renderPg` function — pagination is replaced by infinite scroll.

- [ ] **Step 5: Verify gene list loads**

Open the Genomes tab. The gene list should load CT L2/434 genes by default, with:
- Colored left bars per functional category
- AlphaFold thumbnails where available
- Gray ⬡ placeholder for genes without a structure
- Search should filter the list (280ms debounce)
- Scrolling to the bottom of the list should trigger loading more genes

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: genomes gene list with category colors and infinite scroll"
```

---

## Task 5: Favorites (localStorage)

**Files:**
- Modify: `web/js/views/genomes.js` — add `loadFavorites`, `toggleFavorite`; wire star buttons

- [ ] **Step 1: Add favorites helpers after `skeletonRows`**

```js
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function toggleFavorite(geneId) {
  const favs = loadFavorites();
  const key  = String(geneId);
  if (favs.has(key)) { favs.delete(key); } else { favs.add(key); }
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs])); } catch {}
  return favs.has(key);
}
```

- [ ] **Step 2: Wire star button clicks via event delegation**

In `showGeneList`, add an event listener on `#gene-scroll` (after the `fetchGenes(container, true)` call) to handle star button clicks without re-wiring on every infinite-scroll append:

```js
  container.querySelector('#gene-scroll').addEventListener('click', e => {
    const favBtn = e.target.closest('.fav-btn');
    if (!favBtn) return;
    e.stopPropagation(); // prevent triggering the row click
    const geneId = favBtn.dataset.id;
    const nowFav = toggleFavorite(geneId);
    favBtn.textContent = nowFav ? '★' : '☆';
    favBtn.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
    // If filtering by favorites, remove unfavorited row from view
    if (_filters.favorites && !nowFav) {
      favBtn.closest('.gene-row')?.remove();
      _total = Math.max(0, _total - 1);
      const countEl = container.querySelector('#result-count');
      if (countEl) countEl.textContent = `${_total.toLocaleString()} gene${_total !== 1 ? 's' : ''}`;
    }
    // Also update the star in the detail panel if this gene is selected
    const detailFav = container.querySelector('#detail-fav-btn');
    if (detailFav && String(detailFav.dataset.id) === String(geneId)) {
      detailFav.textContent = nowFav ? '★' : '☆';
      detailFav.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
    }
  });
```

- [ ] **Step 3: Verify favorites work**

1. Sign in as a lab member (favorites require auth — the star only renders for `state.user`)
2. Click a star — it should turn gold (★) and stay gold on page scroll/re-render
3. Reload the page — the star should still be gold (localStorage persistence)
4. Toggle the Favorites chip — list should filter to only favorited genes
5. Unfavoriting a gene while in Favorites filter should remove it from the list instantly

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene favorites with localStorage persistence"
```

---

## Task 6: Gene detail — desktop split-pane

**Files:**
- Modify: `web/js/views/genomes.js` — replace `showGeneDetail`, add `showGeneDetailDesktop`, add detail helper functions

- [ ] **Step 1: Add `showGeneDetailDesktop` after `setupInfiniteScroll`**

```js
async function showGeneDetailDesktop(geneId, container) {
  const panel = container.querySelector('#detail-panel');
  if (!panel) return;
  panel.innerHTML = detailSkeleton();

  const [{ data: g }, { data: orthoRows }] = await Promise.all([
    sb.from('genes').select('*').eq('id', geneId).single(),
    sb.from('orthologs')
      .select('gene_id,ortholog_gene_id')
      .or(`gene_id.eq.${geneId},ortholog_gene_id.eq.${geneId}`),
  ]);

  if (!g) { panel.innerHTML = '<p style="padding:1rem;font-size:0.75rem;color:#ef4444;">Gene not found.</p>'; return; }

  const orthoIds = (orthoRows || []).map(r => r.gene_id === geneId ? r.ortholog_gene_id : r.gene_id);
  let orthoGenes = [];
  if (orthoIds.length) {
    const { data } = await sb.from('genes').select('id,locus_tag,gene_name,strain_id').in('id', orthoIds);
    orthoGenes = data || [];
  }

  panel.innerHTML = detailHTML(g, orthoGenes);
  wireDetailPanel(panel, container, geneId);
}
```

- [ ] **Step 2: Add `detailSkeleton`, `detailHTML`, `wireDetailPanel` helpers**

```js
function detailSkeleton() {
  return `<div style="padding:1.25rem;">
    ${[80, 60, 90, 50].map(w => `
      <div style="height:10px;width:${w}%;background:#f3f4f6;border-radius:4px;margin-bottom:10px;animation:pulse 1.5s ease-in-out infinite;"></div>`).join('')}
  </div>`;
}

const STRAIN_COLORS = { 'CT-L2': '#16a34a', 'CT-D': '#4b2e83', 'CM': '#2563eb' };

function detailHTML(g, orthoGenes) {
  const favs  = loadFavorites();
  const isFav = favs.has(String(g.id));

  const afThumb = g.af_image_url
    ? `<img id="af-thumb" src="${g.af_image_url}" alt="AlphaFold model"
         style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid #e5e7eb;flex-shrink:0;cursor:pointer;"
         title="Click to load 3D viewer" />`
    : `<div style="width:52px;height:52px;border-radius:10px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:20px;color:#d1d5db;flex-shrink:0;">⬡</div>`;

  const strainColor = STRAIN_COLORS[g.strain_id] ?? '#6b7280';

  const starBtn = state.user
    ? `<button id="detail-fav-btn" data-id="${g.id}"
         style="font-size:16px;color:${isFav ? '#f59e0b' : '#e5e7eb'};background:none;border:none;cursor:pointer;align-self:flex-start;margin-left:6px;padding:0;">
         ${isFav ? '★' : '☆'}
       </button>`
    : '';

  const drow = (label, value) => {
    if (value === null || value === undefined || value === '') return '';
    return `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #fafafa;">
      <div style="font-size:10px;color:#9ca3af;width:110px;flex-shrink:0;">${label}</div>
      <div style="font-size:10px;color:#333;">${value}</div>
    </div>`;
  };

  const extRow = (label, text, href) => {
    if (!text) return '';
    const inner = href
      ? `<a href="${href}" target="_blank" rel="noopener" style="font-size:10px;color:#1a6b4a;">${text} ↗</a>`
      : `<span style="font-size:10px;color:#333;">${text}</span>`;
    return `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #fafafa;">
      <div style="font-size:10px;color:#9ca3af;width:110px;flex-shrink:0;">${label}</div>
      <div>${inner}</div>
    </div>`;
  };

  const section = (label, content) => content
    ? `<div style="padding:11px 20px;border-bottom:1px solid #f5f5f5;">
         <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:8px;">${label}</div>
         ${content}
       </div>`
    : '';

  // Orthologs section
  const orthoHTML = orthoGenes.length
    ? orthoGenes.map(o => {
        const c = STRAIN_COLORS[o.strain_id] ?? '#6b7280';
        return `<button class="ortholog-btn" data-id="${o.id}"
          style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid #fafafa;width:100%;background:none;border-left:none;border-right:none;border-top:none;cursor:pointer;text-align:left;">
          <div style="width:3px;height:18px;border-radius:2px;background:${c};flex-shrink:0;"></div>
          <span style="font-size:10px;font-weight:600;color:${c};">${o.gene_name ?? o.locus_tag}</span>
          <span style="font-size:9px;color:#9ca3af;font-family:'DM Mono',monospace;margin-left:2px;">${o.gene_name ? o.locus_tag : ''}</span>
          <span style="font-size:10px;color:#9ca3af;margin-left:auto;font-size:8.5px;">${o.strain_id}</span>
          <span style="color:#ddd;font-size:11px;">›</span>
        </button>`;
      }).join('')
    : null;

  // Expression chart
  const exprPoints = [
    { label: 'T0', val: g.expr_eb  },
    { label: 'T1', val: g.expr_1h  },
    { label: 'T2', val: g.expr_3h  },
    { label: 'T3', val: g.expr_8h  },
    { label: 'T4', val: g.expr_16h },
    { label: 'T5', val: g.expr_24h },
  ].filter(t => t.val != null);

  const exprHTML = exprPoints.length
    ? `<div style="display:flex;align-items:flex-end;gap:4px;height:44px;margin-top:6px;">
        ${(() => {
          const max = Math.max(...exprPoints.map(t => t.val), 1);
          return exprPoints.map(t => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;">
              <div style="width:100%;background:#93c5fd;border-radius:2px 2px 0 0;height:${Math.max((t.val/max)*40, 3)}px;"></div>
              <span style="font-size:7.5px;color:#9ca3af;">${t.label}</span>
            </div>`).join('');
        })()}
       </div>
       ${drow('EB', g.expr_eb ?? 'NQ')}
       ${g.expr_rb != null ? drow('RB', g.expr_rb) : ''}`
    : null;

  // Structure section
  const structHTML = g.af_image_url
    ? `<div style="display:flex;gap:10px;align-items:center;">
        <img src="${g.af_image_url}" style="width:60px;height:60px;border-radius:8px;border:1px solid #e5e7eb;object-fit:cover;" />
        <div>
          <div style="font-size:10px;color:#555;">AlphaFold ${g.af_version ?? 'v3'} prediction</div>
          ${g.structural_homology_function ? `<div style="font-size:9.5px;color:#9ca3af;margin-top:2px;">${g.structural_homology_function}</div>` : ''}
          ${g.mmcif_path ? `<button id="btn-load-3d" data-url="${g.mmcif_path}"
            style="font-size:9.5px;color:#1a6b4a;background:none;border:none;cursor:pointer;padding:0;margin-top:4px;">▶ Load 3D viewer</button>` : ''}
        </div>
       </div>
       ${g.mmcif_path ? '<div id="molstar-wrap"></div>' : ''}`
    : null;

  return `
    <!-- Header -->
    <div style="padding:18px 20px 14px;border-bottom:1px solid #f3f3f3;display:flex;gap:12px;align-items:flex-start;">
      ${afThumb}
      <div style="flex:1;">
        <div style="font-size:19px;font-weight:700;color:#111;line-height:1.15;">${g.gene_name ?? g.locus_tag}</div>
        ${g.gene_name ? `<div style="font-size:10px;color:#9ca3af;font-family:'DM Mono',monospace;margin-top:2px;">${g.locus_tag}</div>` : ''}
        <div style="font-size:11.5px;color:#555;margin-top:4px;line-height:1.4;">${g.product ?? 'Hypothetical protein'}</div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:4px;flex-shrink:0;">
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
                    color:${strainColor};background:${strainColor}18;border:1px solid ${strainColor}40;
                    border-radius:20px;padding:2px 7px;white-space:nowrap;">${g.strain_id}</div>
        ${starBtn}
      </div>
    </div>

    ${section('Gene properties',
      drow('Length', g.length_bp ? `${g.length_bp.toLocaleString()} bp` : null) +
      drow('Mass', g.mass_kd ? `${g.mass_kd} kDa` : null) +
      drow('Function', g.function) +
      drow('Protein family', g.protein_family) +
      drow('Location', g.subcellular_location) +
      (g.is_inc      ? drow('Inc protein', 'Yes') : '') +
      (g.is_membrane ? drow('Membrane',    'Yes') : '') +
      (g.is_secreted ? drow('Secreted',    'Yes') : '')
    )}

    ${orthoHTML ? section('Orthologs', orthoHTML) : ''}

    ${exprHTML ? section('Expression data', exprHTML) : ''}

    ${structHTML ? section('AlphaFold structure', structHTML) : ''}

    ${section('External databases',
      extRow('UniProt',    g.uniprot_id,   g.uniprot_id   ? `https://www.uniprot.org/uniprot/${g.uniprot_id}` : null) +
      extRow('AlphaFold DB', g.alphafold_id, g.alphafold_id ? `https://alphafold.ebi.ac.uk/entry/${g.alphafold_id}` : null) +
      extRow('PDB',        g.pdb_id,       g.pdb_id       ? `https://www.rcsb.org/structure/${g.pdb_id}` : null) +
      `<div style="display:flex;gap:8px;padding:3px 0;">
         <div style="font-size:10px;color:#9ca3af;width:110px;flex-shrink:0;">NCBI</div>
         <a href="https://www.ncbi.nlm.nih.gov/protein/?term=${g.locus_tag}" target="_blank" rel="noopener" style="font-size:10px;color:#1a6b4a;">${g.locus_tag} ↗</a>
       </div>`
    )}

    ${(g.biological_process || g.molecular_function || g.cellular_component)
      ? section('GO annotations',
          drow('Biological process', g.biological_process) +
          drow('Molecular function',  g.molecular_function) +
          drow('Cellular component',  g.cellular_component))
      : ''}

    <div style="height:24px;"></div>
  `;
}

function wireDetailPanel(panel, container, geneId) {
  // Ortholog clicks
  panel.querySelectorAll('.ortholog-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isMobile = window.innerWidth < 640;
      const id = Number(btn.dataset.id);
      if (isMobile) { showGeneDetailMobile(id, container); }
      else           { _selectedId = id; showGeneDetailDesktop(id, container); }
    });
  });

  // AlphaFold thumb click → Mol* viewer
  panel.querySelector('#af-thumb')?.addEventListener('click', () => {
    const g = panel.querySelector('#btn-load-3d');
    if (g) loadMolstar(panel, g.dataset.url);
  });
  panel.querySelector('#btn-load-3d')?.addEventListener('click', e => {
    loadMolstar(panel, e.currentTarget.dataset.url);
  });

  // Favorite star in detail header
  panel.querySelector('#detail-fav-btn')?.addEventListener('click', () => {
    const btn = panel.querySelector('#detail-fav-btn');
    const nowFav = toggleFavorite(geneId);
    btn.textContent = nowFav ? '★' : '☆';
    btn.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
    // Sync the star in the gene list row
    const listRow = container.querySelector(`.gene-row[data-id="${geneId}"] .fav-btn`);
    if (listRow) { listRow.textContent = nowFav ? '★' : '☆'; listRow.style.color = nowFav ? '#f59e0b' : '#e5e7eb'; }
  });
}
```

- [ ] **Step 3: Verify desktop detail panel**

1. Click a gene in the list — the right panel should populate with the gene detail
2. The selected row should have a green left border and light green background
3. Ortholog rows should show colored left bars in strain colors and be clickable (loads that gene's detail)
4. "Load 3D viewer" (if mmcif_path exists) should trigger Mol*
5. Sections with no data (e.g. GO annotations if empty) should not appear

- [ ] **Step 4: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: gene detail panel for desktop split-pane view"
```

---

## Task 7: Gene detail — mobile full-page + dead code removal

**Files:**
- Modify: `web/js/views/genomes.js` — add `showGeneDetailMobile`, delete old functions

- [ ] **Step 1: Add `showGeneDetailMobile` after `wireDetailPanel`**

```js
async function showGeneDetailMobile(geneId, container) {
  // Save scroll position so we can restore it on back
  const scroll = container.querySelector('#gene-scroll');
  _scrollPos = scroll ? scroll.scrollTop : 0;

  // Hide list panel, show detail panel full-width
  const listPanel   = container.querySelector('#list-panel');
  const detailPanel = container.querySelector('#detail-panel');
  if (listPanel)   listPanel.style.display   = 'none';
  if (detailPanel) detailPanel.style.display = 'flex';

  detailPanel.innerHTML = `
    <button id="back-btn"
      style="display:flex;align-items:center;gap:4px;padding:10px 14px;font-size:11px;font-weight:600;
             color:#1a6b4a;background:none;border:none;border-bottom:1px solid #f3f3f3;cursor:pointer;width:100%;font-family:inherit;">
      ‹ Gene list
    </button>
    ${detailSkeleton()}
  `;

  detailPanel.querySelector('#back-btn').addEventListener('click', () => {
    detailPanel.style.display = 'none';
    if (listPanel) listPanel.style.display = 'flex';
    // Restore scroll position
    const scroll = container.querySelector('#gene-scroll');
    if (scroll) scroll.scrollTop = _scrollPos;
  });

  const [{ data: g }, { data: orthoRows }] = await Promise.all([
    sb.from('genes').select('*').eq('id', geneId).single(),
    sb.from('orthologs')
      .select('gene_id,ortholog_gene_id')
      .or(`gene_id.eq.${geneId},ortholog_gene_id.eq.${geneId}`),
  ]);

  if (!g) { detailPanel.innerHTML += '<p style="padding:1rem;font-size:0.75rem;color:#ef4444;">Gene not found.</p>'; return; }

  const orthoIds = (orthoRows || []).map(r => r.gene_id === geneId ? r.ortholog_gene_id : r.gene_id);
  let orthoGenes = [];
  if (orthoIds.length) {
    const { data } = await sb.from('genes').select('id,locus_tag,gene_name,strain_id').in('id', orthoIds);
    orthoGenes = data || [];
  }

  // Replace skeleton (keep back button)
  const backBtn = detailPanel.querySelector('#back-btn');
  backBtn.insertAdjacentHTML('afterend', detailHTML(g, orthoGenes));
  wireDetailPanel(detailPanel, container, geneId);
}
```

- [ ] **Step 2: Delete old dead code**

Delete the following functions that are no longer used:
- `showStrainSelector` (replaced by inline tabs in `showGeneList`)
- `renderPg` (replaced by infinite scroll)
- The old `showGeneDetail` function (replaced by `showGeneDetailDesktop` and `showGeneDetailMobile`)

Verify that `loadMolstar` and `_initMolstar` are still present — they are reused unchanged.

The `row`, `extRow` helpers in the old code are also removed — they are reimplemented inline inside `detailHTML` as closures.

- [ ] **Step 3: Verify mobile detail flow**

Resize browser to < 640px width (or use DevTools mobile viewport).

1. Gene list should be full-width with strain tabs and filter bar
2. Tapping a gene should hide the list and show the detail full-page with a "‹ Gene list" back button at the top
3. Tapping "‹ Gene list" should restore the list at the same scroll position
4. Ortholog links in the detail should load a new gene's detail (mobile full-page, no return to list)

- [ ] **Step 4: Smoke test — guest flow**

1. Open Genomes as a guest (not signed in)
2. Stars should not appear on gene rows
3. Favorites chip should still appear but toggling it should show empty (no favorites stored for guest scope)
4. All three strain tabs should work
5. Search, filter chips, sort all function correctly

- [ ] **Step 5: Smoke test — authenticated flow**

1. Sign in as lab member
2. Stars appear on gene rows
3. Toggle a star — it turns gold, persists on reload
4. Enable Favorites filter — only starred genes shown
5. Desktop: click gene → detail in right panel, list stays visible
6. Mobile (resize to < 640px): tap gene → full-page detail, back button works

- [ ] **Step 6: Commit**

```bash
git add web/js/views/genomes.js
git commit -m "feat: mobile gene detail full-page view; remove old pagination and selector"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| STRAINS constant with non-italic labels | Task 1 |
| CATEGORY_COLORS from source data | Task 1 |
| Split-pane desktop layout | Task 2 |
| Mobile full-width layout | Task 2 |
| Strain switcher — 3 tabs, non-italic, green active state | Task 2 |
| Switching strain resets search/filters | Task 2 |
| `window.__preferredStrain` entry point | Task 2 |
| Search bar with 280ms debounce | Task 2 |
| Smart matching: locus_tag, gene_name, product | Task 4 |
| Filter toolbar always visible (Option A) | Task 3 |
| Sort button with dropdown | Task 3 |
| Sort options: locus tag, gene name, protein size, expression | Task 3 |
| Filter chips: Favorites, Characterized, Inc | Task 3 |
| "+ More" panel with Membrane, Secreted, Has structure | Task 3 |
| Active chip styling | Task 3 |
| Result count below toolbar | Task 4 |
| Infinite scroll (IntersectionObserver, 50 rows at a time) | Task 4 |
| Gene row: 3px left bar colored by category | Task 4 |
| Gene row: AF thumbnail with ⬡ fallback | Task 4 |
| Gene row: named (bold #111) vs unnamed (mono gray) | Task 4 |
| Gene row: star (auth only) | Task 4 |
| Favorites in localStorage, star toggle | Task 5 |
| Favorites filter chip | Task 5 |
| Star sync between list and detail | Task 5 |
| Empty state desktop ("Select a gene to view details") | Task 2 |
| Detail header: AF thumb, gene name, locus, product, strain badge, star | Task 6 |
| Detail sections: properties, orthologs, expression, structure, ext DBs, GO | Task 6 |
| Orthologs with strain color bars, clickable | Task 6 |
| Mobile full-page detail with back button + scroll restore | Task 7 |
| Dead code removed (old strain selector, renderPg, showGeneDetail) | Task 7 |
