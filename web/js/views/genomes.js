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
let _strain      = null;
let _search      = '';
let _searchTimer = null;
let _sortField   = 'locus_tag';
let _sortAsc     = true;
let _filters     = { favorites: false, characterized: false, inc: false,
                     membrane: false, secreted: false, hasStructure: false };
let _offset      = 0;
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

export function renderGenomes(container) {
  // Pick up strain preference set by home page organisms section
  _strain = window.__preferredStrain ?? 'CT-L2';
  delete window.__preferredStrain;
  _search = ''; _offset = 0; _selectedId = null;
  _filters = { favorites: false, characterized: false, inc: false,
               membrane: false, secreted: false, hasStructure: false };
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
        <div style="padding:7px 10px;border-bottom:1px solid #f3f3f3;flex-shrink:0;">
          <input id="gene-search" type="search"
            placeholder="Search genes, locus tags, products…"
            aria-label="Search genes, locus tags, products"
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

  // Wire search (value set via JS to avoid XSS from user input interpolated into HTML)
  const searchEl = container.querySelector('#gene-search');
  searchEl.value = _search;
  searchEl.addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _search = e.target.value.trim();
    _searchTimer = setTimeout(() => {
      _offset = 0;
      fetchGenes(container, true);
    }, 280);
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
      ${label}
    </button>`;

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
      <!-- Always-visible chips -->
      ${chip('favorites',    '★ Favorites',  _filters.favorites)}
      ${chip('characterized','Characterized', _filters.characterized)}
      ${chip('inc',          'Inc',           _filters.inc)}
      <!-- More button -->
      <button id="more-filters-btn"
        style="font-size:10.5px;font-weight:600;color:#9ca3af;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:3px 9px;cursor:pointer;margin-left:auto;font-family:inherit;">
        + More
      </button>
    </div>
    <!-- Expanded "more" panel -->
    <div id="more-panel" style="display:none;padding:8px 10px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:5px;">
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
    q = q.or(`locus_tag.ilike.%${_search}%,gene_name.ilike.%${_search}%`);
  }
  if (_filters.characterized) q = q.eq('is_characterized', true);
  if (_filters.inc)            q = q.eq('functional_category', 'Inclusion membrane protein');
  if (_filters.membrane)       q = q.eq('is_membrane_protein', true);
  if (_filters.secreted)       q = q.eq('is_t3_secreted', true);
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
    <div style="display:flex;align-items:center;gap:8px;padding:10px 16px 7px;">
      <div style="width:2px;height:12px;background:#1a6b4a;border-radius:1px;flex-shrink:0;"></div>
      <span style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#1a6b4a;">${label}</span>
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
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Length', lengthLabel)}
        ${prop('Strand', strandLabel)}
        ${posLabel ? prop('Position', posLabel) : ''}
      </div>
      ${flags.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${flags.map(flagPill).join('')}</div>` : ''}
      <div id="d-ext-links" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        <!-- Populated in Task 7 when protein data arrives (UniProt/NCBI IDs) -->
      </div>
    </div>`;
}

async function loadDetailAsync(detail, gene) {
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
          .gte('sort_index', gene.sort_index - 4)
          .lte('sort_index', gene.sort_index + 4)
          .order('sort_index', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ]);

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
      ? `<span style="font-size:9.5px;font-family:'DM Mono',monospace;color:#222;font-weight:600;">${esc(g.locus_tag)}</span>
         <span style="font-size:9.5px;color:#9ca3af;margin-left:4px;overflow:hidden;text-overflow:ellipsis;">${esc(g.gene_name)}</span>`
      : `<span style="font-size:9.5px;font-family:'DM Mono',monospace;color:#9ca3af;">${esc(g.locus_tag)}</span>`;

    return `
      <div class="orth-row-btn" data-id="${g.id}" style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid #f7f7f7;cursor:pointer;"
        onmouseenter="this.style.background='#fafafa';this.style.margin='0 -16px';this.style.padding='6px 16px';"
        onmouseleave="this.style.background='';this.style.margin='';this.style.padding='6px 0';">
        <div style="width:3px;height:24px;border-radius:1px;background:${colorHex};flex-shrink:0;"></div>
        <span style="font-size:8px;font-weight:700;color:#9ca3af;width:36px;flex-shrink:0;">${esc(strain)}</span>
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
  const VB_H    = 62;
  const SPINE_Y = 31;
  const P_TOP   = 18; const P_BOT = 30; const P_MID = 24;
  const N_TOP   = 32; const N_BOT = 44; const N_MID = 38;
  const CUR_TOP = 14; const CUR_BOT = 34;
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
      pts     = `${ax + w},${N_TOP} ${ax + TIP},${N_TOP} ${ax},${N_MID} ${ax + TIP},${N_BOT} ${ax + w},${N_BOT}`;
      labelY  = N_BOT + 7;
      locusY  = null;
    }

    const cx = ax + w / 2;
    const opacity   = isCurrent ? '1' : '0.82';
    const strokeEl  = isCurrent
      ? `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.9"/>`
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
        <svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg"
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
        showGeneDetailDesktop(cached, _container);
      }
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
          ${esc(descText)}
        </div>` : ''}
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Mass',           protein.mass_kd ? `${protein.mass_kd} kDa` : null)}
        ${prop('Length',         protein.length_aa ? `${protein.length_aa} aa` : null)}
        ${prop('TM Domains',     tmLabel)}
        ${prop('Signal Peptide', spLabel)}
        ${prop('Localization',   protein.localization   != null ? esc(protein.localization)   : null)}
        ${prop('Family',         protein.protein_family != null ? esc(protein.protein_family) : null)}
      </div>
      ${protein.function_narrative && protein.function_narrative !== gene.product ? `
        <div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;padding:6px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:8px;">
          ${esc(protein.function_narrative)}
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

// Helper: NCBI gene link (always available from locus tag)
function ncbiLink(locusTag) {
  return `<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(locusTag)}" target="_blank" rel="noopener"
    style="font-size:9.5px;font-weight:500;color:#16a34a;text-decoration:none;padding:2px 7px;border:1px solid #bbf7d0;border-radius:5px;background:#f0fdf4;"
    onmouseenter="this.style.background='#dcfce7'" onmouseleave="this.style.background='#f0fdf4'">NCBI ↗</a>`;
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

// Stubs — implemented in Tasks 3 and 10
function showGeneDetailDesktop(gene, container) {
  const detail = container.querySelector('#detail-panel');
  if (!detail) return;
  _container = container;

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
          <div style="font-size:11px;color:#555;margin-top:4px;line-height:1.45;">${esc(gene.product ?? (gene.functional_category ?? 'Hypothetical protein'))}</div>
        </div>
        <button id="detail-fav-btn" data-id="${gene.id}"
          style="font-size:16px;background:none;border:none;cursor:pointer;color:${isFav ? '#f59e0b' : '#d1d5db'};padding:0;flex-shrink:0;padding-top:2px;"
          title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          ${isFav ? '★' : '☆'}
        </button>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        <span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#16a34a;border:1px solid rgba(22,163,74,0.3);">${esc(strain)}</span>
        ${catLabel ? `<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:${catBadge.bg};color:${catBadge.text};border:1px solid ${catBadge.border};">${esc(catLabel)}</span>` : ''}
        ${gene.is_characterized ? `<span style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.7);color:#059669;border:1px solid rgba(5,150,105,0.3);">Characterized</span>` : ''}
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
function showGeneDetailMobile(gene, container) {
  // Full-screen mobile detail — shares section renderers with desktop.
  // TODO: implement tab bar in a follow-up session.
  // For now: fall back to desktop layout inside the full container.
  container.querySelector('#detail-panel').style.display = 'block';
  container.querySelector('#list-panel').style.display   = 'none';
  showGeneDetailDesktop(gene, container);
}
