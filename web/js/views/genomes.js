// ChlamAtlas — Genomes tab
import { sb, state } from '../app.js';

const STRAINS = [
  { id: 'CT-L2', label: 'CT L2/434' },
  { id: 'CT-D',  label: 'CT D/UW-3' },
  { id: 'CM',    label: 'CM'         },
];

const ORGANISM_FULL = {
  'CT-L2': '<em>Chlamydia trachomatis</em> L2/434',
  'CT-D':  '<em>Chlamydia trachomatis</em> D/UW-3',
  'CM':    '<em>Chlamydia muridarum</em> Nigg',
};

const STRAIN_TAXID = { 'CT-L2': 813, 'CT-D': 813, 'CM': 243161 };

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
  'Other':                      { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' },
  'Replication':                { bg:'#fefce8', text:'#713f12', border:'#fde68a' },
  'Secreted effector':          { bg:'#f0fdf4', text:'#14532d', border:'#86efac' },
  'Transcription':              { bg:'#fffbeb', text:'#78350f', border:'#fde68a' },
  'Translation':                { bg:'#f7fee7', text:'#365314', border:'#d9f99d' },
  'Type III secretion':         { bg:'#fdf4ef', text:'#5c3317', border:'#e8c9b3' },
  'Unknown':                    { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' },
};

const PAGE_SIZE = 50;
const FAVORITES_KEY = 'chlamatlas_favorites';

// ── Module-level state (reset on each renderGenomes call) ──
let _strain         = null;
let _search         = '';
let _searchTimer    = null;
let _sortField      = 'locus_tag';
let _sortAsc        = true;
let _filters        = { favorites: false, characterized: false, inc: false,
                        membrane: false, secreted: false, dnaBinding: false, hasStructure: false };
let _categoryFilter = null;
let _offset         = 0;
let _total       = 0;
let _hasMore     = false;
let _loading     = false;
let _selectedId  = null;
let _scrollPos   = 0;
let _container   = null;  // saved when detail panel is shown; used by async click handlers

// Maps geneId (string) → gene object from the last list fetch
const _geneCache = new Map();

// Which detail sections are expanded (resets on new gene selection)
let _sectionOpen = {
  gene: true, protein: true, structure: true,
  transcriptomics: true, proteomics: true,
  localization: false, interactions: false,
};

// HTML-escape helper for DB strings interpolated into innerHTML.
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const stripEvidenceTags = s => s ? s.replace(/\s*\{[^}]+\}/g, '').replace(/\s+\./g, '.').trim() : s;

export function renderGenomes(container) {
  // Pick up strain preference set by home page organisms section
  _strain = window.__preferredStrain ?? 'CT-L2';
  delete window.__preferredStrain;
  _search = ''; _offset = 0; _selectedId = null; _categoryFilter = null;
  _filters = { favorites: false, characterized: false, inc: false,
               membrane: false, secreted: false, dnaBinding: false, hasStructure: false };
  showGeneList(container);
}

// ─── Gene list ────────────────────────────────────────────

function showGeneList(container) {
  const isMobile = window.innerWidth < 640;

  container.style.padding = '0';

  container.innerHTML = `
    <div style="display:${isMobile ? 'block' : 'grid'};grid-template-columns:300px 1fr;height:calc(100vh - 56px${isMobile ? ' - 52px' : ''});">

      <!-- ── List panel ── -->
      <div id="list-panel" style="border-right:1px solid #ececec;display:flex;flex-direction:column;overflow:hidden;">

        <!-- Strain tabs -->
        <div id="strain-tabs" style="display:flex;border-bottom:1px solid #efefef;padding:10px 14px 0;flex-shrink:0;">
          ${STRAINS.map(s => `
            <button data-strain="${s.id}" aria-label="View ${s.label} genes"
              style="font-size:11.5px;font-weight:600;padding:5px 11px 8px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;margin-bottom:-1px;white-space:nowrap;color:${s.id === _strain ? '#16a34a' : '#9ca3af'};border-bottom-color:${s.id === _strain ? '#16a34a' : 'transparent'};">
              ${s.label}
            </button>`).join('')}
        </div>

        <!-- Search -->
        <div style="padding:7px 10px;border-bottom:1px solid #f3f3f3;flex-shrink:0;position:relative;">
          <input id="gene-search" type="search" autocomplete="off"
            placeholder="Search genes, locus tags, products…"
            aria-label="Search genes, locus tags, products"
            style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;padding:5px 10px;font-size:10.5px;outline:none;font-family:inherit;" />
          <div id="search-suggestions"
            style="display:none;position:absolute;left:10px;right:10px;top:calc(100% - 7px);background:white;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;box-shadow:0 6px 16px rgba(0,0,0,0.08);z-index:100;overflow:hidden;"></div>
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
      _search = ''; _offset = 0; _selectedId = null; _categoryFilter = null;
      _filters = { favorites: false, characterized: false, inc: false,
                   membrane: false, secreted: false, dnaBinding: false, hasStructure: false };
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
  const suggestEl = container.querySelector('#search-suggestions');
  searchEl.value = _search;
  searchEl.addEventListener('input', e => {
    clearTimeout(_searchTimer);
    const q = e.target.value.trim();
    _search = q;
    showSearchSuggestions(container, q);
    _searchTimer = setTimeout(() => { _offset = 0; fetchGenes(container, true); }, 280);
  });
  searchEl.addEventListener('blur', () => {
    setTimeout(() => { if (suggestEl) suggestEl.style.display = 'none'; }, 180);
  });
  searchEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { suggestEl.style.display = 'none'; searchEl.blur(); }
  });

  // Dismiss sort dropdown on any outside click
  document.addEventListener('click', () => {
    container.querySelector('#sort-dropdown')?.style.setProperty('display', 'none');
  });

  renderFilterBar(container);
  fetchGenes(container, true);

  // Star button delegation (handles all .fav-btn clicks within the scrollable list)
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
}

const SORT_OPTIONS = [
  { field: 'locus_tag',  asc: true,  label: 'Locus tag' },
  { field: 'gene_name',  asc: true,  label: 'Gene name' },
];

function renderFilterBar(container) {
  const bar = container.querySelector('#filter-bar');
  if (!bar) return;

  const sortLabel = SORT_OPTIONS.find(o => o.field === _sortField)?.label ?? 'Locus tag';

  const chip = (id, label, active) => `
    <button data-filter="${id}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#bbf7d0' : '#e5e7eb'};
             background:${active ? '#f0fdf4' : 'white'};color:${active ? '#16a34a' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${label}${active ? ' ×' : ''}
    </button>`;

  const ALL_SECONDARY = [
    { id: 'characterized', label: 'Characterized' },
    { id: 'inc',           label: 'Inc Protein'   },
    { id: 'membrane',      label: 'Membrane'      },
    { id: 'secreted',      label: 'T3 Secreted'   },
    { id: 'dnaBinding',    label: 'DNA Binding'   },
    { id: 'hasStructure',  label: 'Has Structure' },
  ];

  const activeSecondary   = ALL_SECONDARY.filter(f => _filters[f.id]);
  const inactiveSecondary = ALL_SECONDARY.filter(f => !_filters[f.id]);

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;">
      <!-- Sort -->
      <div style="position:relative;">
        <button id="sort-btn"
          style="font-size:11px;font-weight:500;color:#555;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit;">
          ⇅ ${sortLabel}
        </button>
        <div id="sort-dropdown" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:120px;overflow:hidden;">
          ${SORT_OPTIONS.map(o => `
            <button data-sort-field="${o.field}" data-sort-asc="${o.asc}"
              style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:11.5px;font-weight:${o.field === _sortField ? '600' : '400'};
                     color:${o.field === _sortField ? '#16a34a' : '#333'};background:${o.field === _sortField ? '#f0fdf4' : 'none'};border:none;cursor:pointer;font-family:inherit;">
              ${o.label}
            </button>`).join('')}
        </div>
      </div>
      <!-- Favorites always visible -->
      ${chip('favorites', '★ Favorites', _filters.favorites)}
      <!-- Active secondary filters promoted to main bar -->
      ${activeSecondary.map(f => chip(f.id, f.label, true)).join('')}
      <!-- Active category filter -->
      ${_categoryFilter ? `<button data-clear-category style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-family:inherit;">${esc(_categoryFilter)} ×</button>` : ''}
      <!-- More button — hidden when all secondary filters are already active -->
      ${inactiveSecondary.length ? `<button id="more-filters-btn"
        style="font-size:10.5px;font-weight:600;color:#9ca3af;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:3px 9px;cursor:pointer;margin-left:auto;font-family:inherit;">
        + More
      </button>` : ''}
    </div>
    <!-- More panel: only inactive secondary filters -->
    ${inactiveSecondary.length ? `
    <div id="more-panel" style="display:none;padding:8px 10px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:5px;">
      ${inactiveSecondary.map(f => chip(f.id, f.label, false)).join('')}
    </div>` : ''}
  `;

  // Sort dropdown toggle
  const sortBtn = bar.querySelector('#sort-btn');
  const sortDrop = bar.querySelector('#sort-dropdown');
  sortBtn.addEventListener('click', e => {
    e.stopPropagation();
    sortDrop.style.display = sortDrop.style.display === 'none' ? 'block' : 'none';
  });

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

  // Clear category filter
  const clearCatBtn = bar.querySelector('[data-clear-category]');
  if (clearCatBtn) {
    clearCatBtn.addEventListener('click', () => {
      _categoryFilter = null;
      _offset = 0;
      renderFilterBar(container);
      fetchGenes(container, true);
    });
  }

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

  // Build query — strain filtered via embedded join (strain_id is UUID, _strain is common_name)
  let q = sb.from('genes')
    .select(
      'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
      'start_bp,end_bp,strand,' +
      'functional_category,is_characterized,is_membrane_protein,' +
      'is_hypothetical,is_dna_binding,is_t3_secreted,' +
      'strains!inner(common_name,color_hex),' +
      'proteins(alphafold_results(thumbnail_path))',
      { count: 'exact' }
    )
    .eq('strains.common_name', _strain)
    .order(_sortField, { ascending: _sortAsc, nullsFirst: false })
    .range(_offset, _offset + PAGE_SIZE - 1);

  if (_search) {
    q = q.or(`locus_tag.ilike.%${_search}%,gene_name.ilike.%${_search}%,product.ilike.%${_search}%`);
  }
  if (_filters.characterized) q = q.eq('is_characterized', true);
  if (_filters.inc)            q = q.eq('functional_category', 'Inclusion membrane protein');
  if (_filters.membrane)       q = q.eq('is_membrane_protein', true);
  if (_filters.secreted)       q = q.eq('is_t3_secreted', true);
  if (_filters.dnaBinding)     q = q.eq('is_dna_binding', true);
  if (_categoryFilter)         q = q.eq('functional_category', _categoryFilter);
  // hasStructure filter deferred — af_image_url lives in alphafold_results, not genes

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

  // Cache all fetched gene objects for detail panel use
  genes.forEach(g => _geneCache.set(String(g.id), g));

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
      const geneId   = row.dataset.id;
      const gene     = _geneCache.get(geneId);
      if (!gene) return;

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

function geneRow(g) {
  const color = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
  const favs  = loadFavorites();
  const isFav = favs.has(String(g.id));

  const thumbUrl = g.proteins?.alphafold_results?.find(r => r.thumbnail_path)?.thumbnail_path ?? null;
  const thumb = thumbUrl
    ? `<img src="${thumbUrl}" alt="Structure" loading="lazy"
         style="width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;">`
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
          <div style="font-size:9.5px;color:#9ca3af;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.functional_category ?? 'Hypothetical protein'}</div>
        </div>
        ${starEl}
        <span style="font-size:12px;color:#ddd;flex-shrink:0;margin-left:2px;">›</span>
      </div>
    </div>`;
}

// ─── Mol* loader ──────────────────────────────────────────

async function loadMolstar(wrapEl, url) {
  wrapEl.innerHTML = `<div id="molstar-vp" style="width:100%;height:100%;position:relative;border-radius:8px;overflow:hidden;"></div>`;

  if (!window.molstar) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js';
    s.onload = () => _initMolstar(url);
    document.head.appendChild(s);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.css';
    document.head.appendChild(l);
  } else {
    _initMolstar(url);
  }
}

async function _initMolstar(url) {
  const { Viewer } = molstar.Viewer;
  const v = await Viewer.create('molstar-vp', {
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowRemoteState: false,
    layoutShowSequence: true,
    layoutShowLog: false,
    layoutShowLeftPanel: false,
    viewportShowExpand: true,
    viewportShowSelectionMode: false,
    viewportShowAnimation: false,
  });
  await v.loadStructureFromUrl(url, 'mmcif');
}

// ─── Helpers ──────────────────────────────────────────────

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

// Returns a section header div: green accent bar + all-caps label.
// rightContent: optional HTML string rendered right-aligned in the header.
function sectionHead(label, rightContent = '') {
  return `
    <div style="display:flex;align-items:center;padding:10px 16px 8px;">
      <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#1a6b4a;">${label}</span>
      ${rightContent ? `<span style="margin-left:auto;font-size:8.5px;color:#bbb;font-family:'DM Mono',monospace;">${rightContent}</span>` : ''}
    </div>`;
}

// Generic loading skeleton for a detail section body.
function detailSkeleton(lines = 3) {
  const bar = (w) =>
    `<div style="height:10px;width:${w};background:#f3f4f6;border-radius:4px;margin-bottom:7px;animation:pulse 1.5s ease-in-out infinite;"></div>`;
  return `<div style="padding:10px 16px 14px;">${Array.from({length: lines}, (_, i) =>
    bar(['60%','80%','45%'][i % 3])
  ).join('')}</div>`;
}

function renderDetailGeneInfo(detail, gene) {
  const prop = (label, value) => value == null ? '' : `
    <div style="display:flex;flex-direction:column;gap:1px;">
      <span style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">${label}</span>
      <span style="font-size:11.5px;color:#222;font-weight:500;">${value}</span>
    </div>`;

  const strandRaw   = gene.strand === '+' ? '+ (sense)' : gene.strand === '-' ? '− (antisense)' : '—';
  const strandLabel = esc(strandRaw);
  const lengthLabel = gene.end_bp ? `${gene.end_bp.toLocaleString()} bp` : '—';
  const posLabel    = (gene.start_bp && gene.end_bp)
    ? `${gene.start_bp.toLocaleString()}–${gene.end_bp.toLocaleString()}`
    : null;

  const el = detail.querySelector('#d-gene-info');
  if (!el) return;
  el.innerHTML = `
    ${sectionHead('Gene Info')}
    <div style="padding:2px 16px 14px;">
      <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Length', lengthLabel)}
        ${prop('Strand', strandLabel)}
        ${posLabel ? prop('Position', posLabel) : ''}
        ${prop('Organism', ORGANISM_FULL[gene.strains?.common_name] ?? null)}
      </div>
    </div>`;

  // Seed hero ext links with NCBI immediately (UniProt added when protein loads)
  const heroLinks = detail.querySelector('#d-hero-ext-links');
  if (heroLinks) heroLinks.innerHTML = ncbiLink(gene.locus_tag);
}

async function loadDetailAsync(detail, gene) {
  const [protResult, orthoFwdResult, orthoRevResult, neighborResult] = await Promise.all([
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

    sb.from('orthologs')
      .select(`
        id,
        gene_a:genes!gene_id_a(
          id, locus_tag, gene_name, strand, functional_category,
          strains(common_name, color_hex)
        )
      `)
      .eq('gene_id_b', gene.id),

    gene.sort_index != null
      ? sb.from('genes')
          .select('id,locus_tag,gene_name,functional_category,strand,end_bp,sort_index')
          .eq('strain_id', gene.strain_id)
          .gte('sort_index', gene.sort_index - 4)
          .lte('sort_index', gene.sort_index + 4)
          .order('sort_index', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const { data: exprRows } = await sb.from('expression_data')
    .select('*')
    .eq('gene_id', gene.id);

  // Normalize reverse-direction rows to the same {gene_b} shape, then merge + deduplicate
  const fwdRows = orthoFwdResult.data ?? [];
  const revRows = (orthoRevResult.data ?? []).map(o => ({ id: o.id, gene_b: o.gene_a }));
  const seenIds = new Set(fwdRows.map(o => o.id));
  const orthoRows = [...fwdRows, ...revRows.filter(o => !seenIds.has(o.id))];

  renderDetailOrthologs(detail, orthoRows, gene);
  renderDetailGeneMap(detail, gene, neighborResult.data ?? []);
  renderDetailProtein(detail, gene, protResult.data);
  renderDetailTranscriptomics(detail, gene, exprRows ?? []);
  renderDetailProteomics(detail, gene, exprRows ?? []);
  renderDetailStructure(detail, gene, protResult.data?.alphafold_results ?? []);
  renderDetailLocalization(detail, gene, protResult.data);
}

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
      ? `<span style="font-size:9.5px;color:#222;font-weight:600;">${esc(g.locus_tag)}</span>
         <span style="font-size:9.5px;color:#9ca3af;margin-left:4px;overflow:hidden;text-overflow:ellipsis;">${esc(g.gene_name)}</span>`
      : `<span style="font-size:9.5px;color:#9ca3af;">${esc(g.locus_tag)}</span>`;

    return `
      <div class="orth-row-btn" data-id="${g.id}"
        style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #f0f0f0;border-radius:6px;cursor:pointer;background:white;"
        onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='white'">
        <div style="width:3px;min-height:22px;border-radius:1px;background:${colorHex};flex-shrink:0;align-self:stretch;"></div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:7.5px;font-weight:700;color:#9ca3af;margin-bottom:1px;">${esc(strain)}</div>
          <div style="display:flex;align-items:baseline;gap:4px;">${nameHtml}</div>
        </div>
        <span style="font-size:11px;color:#ddd;flex-shrink:0;">›</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    ${sectionHead('Orthologs')}
    <div style="padding:8px 16px 12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        ${rows}
      </div>
      <div style="font-size:9px;color:#bbb;font-style:italic;">Reciprocal BLAST · ${orthoRows.length}/3 strains</div>
    </div>`;

  el.querySelectorAll('.orth-row-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.id;
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
            showGeneDetailDesktop(data, _container);
          }
        });
    })
  );
}

function renderDetailGeneMap(detail, gene, neighbors) {
  const el = detail.querySelector('#d-gene-map');
  if (!el) return;

  // Hide section if no sort_index data
  if (!neighbors.length || gene.sort_index == null) {
    el.style.display = 'none';
    return;
  }

  // ── Layout constants ──────────────────────────────────────────
  const VB_W    = 620;
  const VB_H    = 74;
  const SPINE_Y = 41;
  const P_TOP   = 28; const P_BOT = 40; const P_MID = 34;
  const N_TOP   = 42; const N_BOT = 54; const N_MID = 48;
  const CUR_TOP = 24; const CUR_BOT = 44;
  const TIP     = 10;
  const MIN_W   = 28;

  // ── Scale arrows to fit viewBox ───────────────────────────────
  const totalBp = neighbors.reduce((s, g) => s + Math.max(g.end_bp ?? 600, 1), 0);
  const scale   = (VB_W - 20) / Math.max(totalBp, 1);

  let x = 10;
  const arrowDefs = neighbors.map(g => {
    const w   = Math.max(Math.round((g.end_bp ?? 600) * scale), MIN_W);
    const def = { g, x, w };
    x += w + 2;
    return def;
  });
  // Actual content right edge + right padding — may exceed VB_W if MIN_W bumps genes
  const actualVbW = x + 8;

  // ── Build SVG elements ────────────────────────────────────────
  const backbone = `<line x1="10" y1="${SPINE_Y}" x2="${actualVbW - 10}" y2="${SPINE_Y}" stroke="#d9d9d9" stroke-width="1.2"/>`;
  const strandLbl = `
    <text x="5" y="${P_MID + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">+</text>
    <text x="5" y="${N_MID + 1}" font-family="DM Sans,sans-serif" font-size="7" fill="#c0c0c0" text-anchor="middle">−</text>`;

  const arrows = arrowDefs.map(({ g: ng, x: ax, w }, idx) => {
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
      // Stagger odd-indexed neighbors to a higher row to reduce label crowding
      const stagger = (!isCurrent && idx % 2 !== 0) ? -10 : 0;
      labelY  = top - 4 + stagger;
      locusY  = bot + 8;
    } else {
      pts     = `${ax + w},${N_TOP} ${ax + TIP},${N_TOP} ${ax},${N_MID} ${ax + TIP},${N_BOT} ${ax + w},${N_BOT}`;
      // Stagger - strand labels below
      const stagger = (idx % 2 !== 0) ? 9 : 0;
      labelY  = N_BOT + 8 + stagger;
      locusY  = null;
    }

    const cx = ax + w / 2;
    const opacity   = isCurrent ? '1' : '0.82';
    const strokeEl  = isCurrent
      ? `<polygon points="${pts}" fill="none" stroke="#333" stroke-width="1"/>`
      : '';

    const labelEl = `
      <text x="${cx}" y="${labelY}" text-anchor="middle"
        font-family="${isNamed ? 'DM Sans,sans-serif' : 'DM Mono,monospace'}"
        font-size="${isCurrent ? '9' : '7.5'}"
        font-weight="${(isNamed || isCurrent) ? '600' : '400'}"
        fill="${isCurrent ? '#444' : '#999'}">${esc(label)}</text>`;

    const locusEl = (isNamed && locusY)
      ? `<text x="${cx}" y="${locusY}" text-anchor="middle" font-family="DM Mono,monospace" font-size="7" fill="#bbb">${esc(ng.locus_tag)}</text>`
      : ((!isNamed && isPlus && locusY)
        ? `<text x="${cx}" y="${locusY}" text-anchor="middle" font-family="DM Mono,monospace" font-size="7" fill="#bbb">${esc(ng.locus_tag)}</text>`
        : '');

    return `
      <g class="${isCurrent ? '' : 'ga'}" data-id="${ng.id}" style="cursor:${isCurrent ? 'default' : 'pointer'};" title="${esc(ng.locus_tag)}${ng.gene_name ? ' · ' + esc(ng.gene_name) : ''}">
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
        <svg viewBox="0 0 ${actualVbW} ${VB_H}" xmlns="http://www.w3.org/2000/svg"
             style="width:100%;height:auto;display:block;overflow:visible;">
          ${backbone}
          ${strandLbl}
          ${arrows}
        </svg>
      </div>
    </div>`;

  // Wire neighbor gene clicks — use cache or fetch from DB
  el.querySelectorAll('.ga[data-id]').forEach(gEl =>
    gEl.addEventListener('click', () => {
      const targetId = gEl.dataset.id;
      const cached   = _geneCache.get(targetId);
      if (cached) {
        showGeneDetailDesktop(cached, _container);
        return;
      }
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
            showGeneDetailDesktop(data, _container);
          }
        });
    })
  );
}

function renderDetailProtein(detail, gene, protein) {
  const el = detail.querySelector('#d-protein');
  if (!el) return;

  if (!protein) {
    el.innerHTML = `
      ${sectionHead('Protein')}
      <div style="padding:8px 16px 14px;font-size:10px;color:#bbb;font-style:italic;">No protein data imported yet</div>`;
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
        style="font-size:9.5px;font-weight:500;color:#6b7280;text-decoration:none;padding:2px 7px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;"
        onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='#f9fafb'">${label} ↗</a>`
    : '';

  const tmLabel  = protein.transmembrane_domains > 0 ? String(protein.transmembrane_domains) : 'None';
  const spLabel  = protein.signal_peptide ? 'Yes' : 'No';

  const propBlock = (label, value) => !value ? '' : `
    <div style="margin-top:10px;">
      <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:3px;">${label}</div>
      <div style="font-size:10.5px;color:#444;line-height:1.55;">${value}</div>
    </div>`;

  el.innerHTML = `
    ${sectionHead('Protein')}
    <div style="padding:2px 16px 14px;">
      <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Mass',           protein.mass_kd ? `${protein.mass_kd} kDa` : null)}
        ${prop('Length',         protein.length_aa ? `${protein.length_aa} aa` : null)}
        ${prop('TM Domains',     tmLabel)}
        ${prop('Signal Peptide', spLabel)}
        ${prop('Family',         protein.protein_family != null ? esc(protein.protein_family) : null)}
      </div>
      ${propBlock('Product', gene.product ? esc(gene.product) : null)}
      ${propBlock('Subunit Structure', protein.oligomeric_state ? esc(stripEvidenceTags(protein.oligomeric_state)) : null)}
    </div>`;

  // Update hero ext links now that we have the UniProt ID
  const heroLinks = detail.querySelector('#d-hero-ext-links');
  if (heroLinks) heroLinks.innerHTML = `
    ${extLink('UniProt', protein.uniprot_id ? `https://www.uniprot.org/uniprot/${protein.uniprot_id}` : null)}
    ${ncbiLink(gene.locus_tag)}`;
}

// Helper: NCBI gene link (always available from locus tag)
function ncbiLink(locusTag) {
  return `<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(locusTag)}" target="_blank" rel="noopener"
    style="font-size:9.5px;font-weight:500;color:#6b7280;text-decoration:none;padding:2px 7px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;"
    onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='#f9fafb'">NCBI ↗</a>`;
}

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

  const TP_ORDER = { T0:0, T1:1, T2:2, T3:3, T4:4, T5:5 };
  const TP_LABEL = { T0:'1h', T1:'3h', T2:'8h', T3:'16h', T4:'24h', T5:'40h' };

  const sorted = [...microarrayRows].sort((a, b) => (TP_ORDER[a.timepoint] ?? 99) - (TP_ORDER[b.timepoint] ?? 99));
  const values = sorted.map(r => r.value ?? 0);
  const maxVal = Math.max(...values, 1);

  // CT-L2 qualitative case: pattern_label column holds the expression pattern string
  if (values.every(v => v === 0) && sorted[0]?.pattern_label) {
    const pattern = String(sorted[0].pattern_label ?? 'Unknown').toUpperCase().replace(/_/g, ' ');
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

function renderDetailProteomics(detail, gene, exprRows) {
  const el = detail.querySelector('#d-proteomics');
  if (!el) return;

  const protRow = exprRows.find(r => r.eb_expression != null || r.rb_expression != null);

  if (!protRow) {
    el.innerHTML = `
      ${sectionHead('EB / RB Proteomics')}
      <div style="padding:8px 16px 14px;font-size:9px;color:#bbb;font-style:italic;">No proteomic data imported yet</div>`;
    return;
  }

  const ebVal = protRow.eb_expression ?? 0;
  const rbVal = protRow.rb_expression ?? 0;
  const maxVal = Math.max(ebVal, rbVal, 1);

  const bar = (label, val, iconSrc) => {
    const pct = Math.round((val / maxVal) * 100);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <img src="${iconSrc}" alt="${label}" style="width:22px;height:22px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;margin-bottom:3px;">${label}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="height:5px;background:#f3f4f6;border-radius:3px;flex:1;">
              <div style="height:5px;border-radius:3px;background:#4ade80;width:${pct}%;"></div>
            </div>
            <span style="font-size:9px;font-family:'DM Mono',monospace;color:#555;white-space:nowrap;">${val}</span>
          </div>
        </div>
      </div>`;
  };

  el.innerHTML = `
    ${sectionHead('EB / RB Proteomics')}
    <div style="padding:2px 16px 14px;">
      ${bar('EB (elementary body)', ebVal, '/web/images/eb.png')}
      ${bar('RB (reticulate body)', rbVal, '/web/images/rb.png')}
      <div style="font-size:8.5px;color:#bbb;font-style:italic;">CT-L2 spectral counts</div>
    </div>`;
}

function renderDetailStructure(detail, gene, afRows) {
  const el = detail.querySelector('#d-structure');
  if (!el) return;

  const af3 = afRows.find(r => r.af_version === 'v3' || r.af_version === 'AF3');
  const af2 = afRows.find(r => r.af_version === 'v2' || r.af_version === 'AF2' || r.af_version === 'AFDB');

  let activeTab    = af3 ? 'af3' : 'af2';
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
           <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">pLDDT · ${esc(record.af_version ?? '')}</span>
         </div>`
      : '';

    const homologHtml = record.top_homolog_description
      ? `<div style="font-size:10.5px;color:#222;font-weight:600;margin-bottom:3px;">${esc(record.top_homolog_description)}</div>
         <div style="font-size:9.5px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
           ${record.top_homolog_pdb_id ? `RCSB PDB: ${esc(record.top_homolog_pdb_id)}` : ''}
           ${record.homology_method ? ` · Method: ${esc(record.homology_method)}` : ''}
         </div>`
      : '';

    const inferredHtml = record.inferred_function
      ? `<div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;padding:7px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:10px;">
           <strong style="color:#1a6b4a;">Inferred function:</strong> ${esc(record.inferred_function)}
         </div>`
      : '';

    const extLinksHtml = [
      record.top_homolog_pdb_id
        ? `<a href="https://www.rcsb.org/structure/${encodeURIComponent(record.top_homolog_pdb_id)}" target="_blank" rel="noopener" style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;">RCSB ${esc(record.top_homolog_pdb_id)} ↗</a>`
        : '',
      record.mmcif_path
        ? `<a href="${record.mmcif_path}" download style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;">Download mmCIF ↗</a>`
        : '',
    ].filter(Boolean).join('');

    return `
      <div style="display:flex;gap:16px;align-items:flex-start;">
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

  el.querySelectorAll('.struct-tab:not([disabled])').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab    = tab.dataset.tab;
      activeRecord = activeTab === 'af3' ? af3 : activeTab === 'af2' ? af2 : null;
      el.querySelectorAll('.struct-tab').forEach(t => {
        const active = t.dataset.tab === activeTab;
        t.style.color             = active ? '#1a6b4a' : (t.disabled ? '#d1d5db' : '#9ca3af');
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

function renderDetailLocalization(detail, gene, protein) {
  const el = detail.querySelector('#d-localization');
  if (!el) return;

  const slTerms = protein?.subcellular_location_sl ?? [];
  const curated = protein?.localization_curated ?? false;
  const isHypo  = gene.is_hypothetical ?? false;
  const taxid   = Number(STRAIN_TAXID[gene.strains?.common_name]) || 813;

  if (slTerms.length) {
    const sls = slTerms.map(t => t.replace(/^SL-/, '')).join(',');
    const pillsHtml = buildLocPills(protein?.localization ?? '');
    const sourceLabel = curated ? 'Curated' : 'UniProt';
    const sourceBg    = curated ? '#fef3c7' : '#f3f4f6';
    const sourceColor = curated ? '#92400e' : '#6b7280';
    el.innerHTML = `
      ${sectionHead('Cell Localization',
        `<span style="font-size:7.5px;font-weight:600;padding:1px 6px;border-radius:8px;background:${sourceBg};color:${sourceColor};">${sourceLabel}</span>`)}
      <div style="padding:6px 12px 12px;">
        <div id="swissbiopics-svg" style="max-width:100%;min-height:80px;display:flex;align-items:center;justify-content:center;">
          <div style="font-size:9px;color:#aaa;">Loading diagram…</div>
        </div>
        ${pillsHtml}
      </div>`;
    const svgContainer = el.querySelector('#swissbiopics-svg');
    fetch(`https://www.swissbiopics.org/api/${taxid}/sl/${sls}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
      .then(svg => {
        const responsive = svg
          .replace(/\s(?:width|height)="[^"]*"/g, '')
          .replace('<svg', '<svg style="width:100%;height:auto;display:block;"');
        svgContainer.innerHTML = responsive;
      })
      .catch(() => {
        svgContainer.innerHTML = '<div style="font-size:9px;color:#aaa;font-style:italic;padding:8px 0;">Diagram unavailable</div>';
      });
    return;
  }

  if (isHypo || !protein?.localization) {
    el.innerHTML = `
      ${sectionHead('Cell Localization')}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:18px 8px 14px;text-align:center;">
        <div style="font-size:20px;color:#d1d5db;">◎</div>
        <div style="font-size:9px;font-weight:600;color:#aaa;">Location unknown</div>
      </div>`;
    return;
  }

  const pillsHtml = buildLocPills(protein.localization);
  el.innerHTML = `
    ${sectionHead('Cell Localization')}
    <div style="padding:6px 12px 12px;">
      ${pillsHtml || '<div style="font-size:10px;color:#bbb;font-style:italic;padding:8px 0;">No diagram available</div>'}
    </div>`;
}

function buildLocPills(localization) {
  if (!localization) return '';
  const tags = localization
    .replace(/\s*\{[^}]+\}/g, '')
    .split(/[;.]+/)
    .map(s => s.trim())
    .filter(s => s && s.length > 1
      && !/note=/i.test(s) && !/prorule/i.test(s)
      && !/hamap/i.test(s) && !/pubmed/i.test(s)
      && s.length < 60);
  if (!tags.length) return '';
  return `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">
      ${tags.map(t => `<span style="font-size:9px;font-weight:500;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;">${esc(t)}</span>`).join('')}
    </div>`;
}

// Stubs — implemented in Tasks 3 and 10
async function showSearchSuggestions(container, query) {
  const suggestEl = container.querySelector('#search-suggestions');
  if (!suggestEl) return;
  if (!query || query.length < 2) { suggestEl.style.display = 'none'; return; }

  const { data } = await sb.from('genes')
    .select('id,locus_tag,gene_name,product,functional_category,strains!inner(common_name)')
    .eq('strains.common_name', _strain)
    .or(`locus_tag.ilike.%${query}%,gene_name.ilike.%${query}%,product.ilike.%${query}%`)
    .order('locus_tag', { ascending: true })
    .limit(7);

  if (!data?.length) { suggestEl.style.display = 'none'; return; }

  suggestEl.innerHTML = data.map(g => {
    const color = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
    const name  = g.gene_name ? `<span style="font-weight:600;color:#111;">${esc(g.gene_name)}</span> ` : '';
    const locus = `<span style="font-family:'DM Mono',monospace;font-size:9px;color:#9ca3af;">${esc(g.locus_tag)}</span>`;
    const prod  = g.product ? `<div style="font-size:9px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(g.product)}</div>` : '';
    return `
      <div class="sg-item" data-id="${g.id}" data-locus="${esc(g.locus_tag)}"
        style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f5f5f5;display:flex;align-items:center;gap:8px;background:white;"
        onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='white'">
        <div style="width:3px;min-height:28px;background:${color};border-radius:2px;flex-shrink:0;align-self:stretch;"></div>
        <div style="flex:1;min-width:0;font-size:10.5px;">${name}${locus}${prod}</div>
      </div>`;
  }).join('');

  suggestEl.style.display = 'block';

  suggestEl.querySelectorAll('.sg-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      const locus = item.dataset.locus;
      const searchEl = container.querySelector('#gene-search');
      if (searchEl) searchEl.value = locus;
      _search = locus;
      _offset = 0;
      suggestEl.style.display = 'none';
      fetchGenes(container, true);
    });
  });
}

function wireHeroBadgeClicks(detail) {
  detail.querySelectorAll('[data-hero-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const filterType = el.dataset.heroFilter;
      _offset = 0;
      if (filterType === 'category') {
        _categoryFilter = el.dataset.value;
      } else {
        _filters[filterType] = true;
      }
      renderFilterBar(_container);
      fetchGenes(_container, true);
    });
  });
}

function showGeneDetailDesktop(gene, container) {
  const detail = container.querySelector('#detail-panel');
  if (!detail) return;
  _container = container;

  _sectionOpen = { gene: true, protein: true, structure: true,
                   transcriptomics: true, proteomics: true,
                   localization: false, interactions: false };

  // Sync gene list selection + scroll the active row into view
  _selectedId = String(gene.id);
  const geneScroll = container.querySelector('#gene-scroll');
  if (geneScroll) {
    geneScroll.querySelectorAll('.gene-row').forEach(r => {
      const sel = r.dataset.id === _selectedId;
      r.style.background  = sel ? '#f0fdf4' : '';
      r.style.borderLeft  = sel ? '2px solid #16a34a' : '';
      r.style.paddingLeft = sel ? '10px' : '';
      if (sel) r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  const favs   = loadFavorites();
  const isFav  = favs.has(String(gene.id));
  const strain = gene.strains?.common_name ?? _strain;

  // Category color + badge style
  const catColor = CATEGORY_COLORS[gene.functional_category] ?? CATEGORY_COLOR_DEFAULT;
  const catBadge = CATEGORY_BADGE[gene.functional_category] ?? { bg:'#f9fafb', text:'#6b7280', border:'#e5e7eb' };
  const catLabel = gene.functional_category ?? '';

  // Hero background: very light tint derived from category color
  const heroBg = `color-mix(in srgb, ${catColor} 12%, white)`;

  const heroThumbUrl = gene.proteins?.alphafold_results?.find(r => r.thumbnail_path)?.thumbnail_path ?? null;
  const heroThumb = heroThumbUrl
    ? `<img src="${heroThumbUrl}" alt="Structure" loading="lazy"
         style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.08);">`
    : `<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,0.85);border:2px solid rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;font-size:18px;color:#d1d5db;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.08);">⬡</div>`;

  const heroHtml = `
    <div style="padding:16px 20px 14px;border-bottom:3px solid ${catColor};background:linear-gradient(150deg,${heroBg} 0%,#ffffff 65%);">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;">
        ${heroThumb}
        <div style="flex:1;min-width:0;">
          ${gene.gene_name
            ? `<div style="font-size:24px;font-weight:700;color:#111;line-height:1.1;">${esc(gene.gene_name)}</div>
               <div style="font-size:9.5px;font-family:'DM Mono',monospace;color:#888;margin-top:2px;">${esc(gene.locus_tag)}</div>`
            : `<div style="font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:#333;line-height:1.1;">${esc(gene.locus_tag)}</div>`
          }
        </div>
        <button id="detail-fav-btn" data-id="${gene.id}"
          style="font-size:16px;background:none;border:none;cursor:pointer;color:${isFav ? '#f59e0b' : '#d1d5db'};padding:0;flex-shrink:0;padding-top:2px;"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#16a34a;border:1px solid rgba(22,163,74,0.3);">${esc(strain)}</span>
        ${catLabel ? `<span data-hero-filter="category" data-value="${esc(gene.functional_category)}" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:${catBadge.bg};color:${catBadge.text};border:1px solid ${catBadge.border};cursor:pointer;" title="Filter list by ${esc(catLabel)}">${esc(catLabel)}</span>` : ''}
        ${gene.is_characterized   ? `<span data-hero-filter="characterized" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#059669;border:1px solid rgba(5,150,105,0.3);cursor:pointer;" title="Filter list: Characterized">Characterized</span>` : ''}
        ${gene.is_membrane_protein ? `<span data-hero-filter="membrane" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#0369a1;border:1px solid rgba(3,105,161,0.3);cursor:pointer;" title="Filter list: Membrane proteins">Membrane</span>` : ''}
        ${gene.is_t3_secreted      ? `<span data-hero-filter="secreted" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#7c3aed;border:1px solid rgba(124,58,237,0.3);cursor:pointer;" title="Filter list: T3 Secreted">T3 Secreted</span>` : ''}
        ${gene.is_dna_binding      ? `<span data-hero-filter="dnaBinding" style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#b45309;border:1px solid rgba(180,83,9,0.3);cursor:pointer;" title="Filter list: DNA Binding">DNA Binding</span>` : ''}
        <span id="d-hero-ext-links" style="margin-left:auto;display:flex;gap:4px;align-items:center;"></span>
      </div>
    </div>`;

  // Inject gene-arrow hover style if not already present
  if (!document.querySelector('#chlamatlas-detail-styles')) {
    const s = document.createElement('style');
    s.id = 'chlamatlas-detail-styles';
    s.textContent = '.ga { transition: opacity 0.12s; } .ga:hover { opacity: 0.65 !important; }';
    document.head.appendChild(s);
  }

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
      <!-- Protein + Transcriptomics + EB/RB (left 2/3) + Cell Localization (right 1/3, full height) -->
      <div style="display:grid;grid-template-columns:2fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div style="display:flex;flex-direction:column;border-right:1px solid #f0f0f0;">
          <div id="d-protein" style="border-bottom:1px solid #f0f0f0;">${detailSkeleton(4)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;flex:1;">
            <div id="d-transcriptomics" style="border-right:1px solid #f0f0f0;">${detailSkeleton(3)}</div>
            <div id="d-proteomics">${detailSkeleton(2)}</div>
          </div>
        </div>
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
  wireHeroBadgeClicks(detail);
  renderDetailGeneInfo(detail, gene);
  const locEl = detail.querySelector('#d-localization');
  if (locEl) locEl.innerHTML = `
    ${sectionHead('Cell Localization')}
    <div style="padding:18px 8px 14px;text-align:center;">
      <div style="font-size:20px;color:#e5e7eb;">◎</div>
    </div>`;

  // Fire async queries in parallel
  loadDetailAsync(detail, gene);
}
function showGeneDetailMobile(gene, container) {
  // Full-screen mobile detail — shares section renderers with desktop.
  // TODO: implement tab bar in a follow-up session.
  // For now: fall back to desktop layout inside the full container.
  container.querySelector('#detail-panel').style.display = 'block';
  container.querySelector('#list-panel').style.display   = 'none';
  showGeneDetailDesktop(gene, container);
}
