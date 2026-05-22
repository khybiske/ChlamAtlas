// ChlamAtlas — Genomes tab
import { sb, state, loadFavorites, toggleFavorite, GENE_FAVORITES_KEY } from '../client.js?v=66';

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

// Short display labels for functional categories used in filter chips
const FUNC_LABELS = {
  'Amino acid metabolism':      'Amino acid',
  'Cell envelope':              'Cell envelope',
  'Cell processes':             'Cell processes',
  'Cofactor metabolism':        'Cofactor',
  'Energy metabolism':          'Energy',
  'Inclusion membrane protein': 'Inc',
  'Inermediary metabolism':     'Intermediary',
  'Lipid metabolism':           'Lipid',
  'Membrane transport':         'Transport',
  'Nucleotide metabolism':      'Nucleotide',
  'Other':                      'Other',
  'Replication':                'Replication',
  'Secreted effector':          'Secreted effector',
  'Transcription':              'Transcription',
  'Translation':                'Translation',
  'Type III secretion':         'T3SS',
  'Unknown':                    'Unknown',
};
const funcLabel = cat => FUNC_LABELS[cat] ?? cat;

// Hardcoded popular filter combos (replace with analytics-backed list later)
const POPULAR_FILTERS = [
  { type: 'cat',   value: 'Inclusion membrane protein', label: 'Inc'         },
  { type: 'cat',   value: 'Secreted effector',          label: 'Secreted'    },
  { type: 'char',  value: 'characterized',              label: 'Characterized'},
  { type: 'cat',   value: 'Replication',                label: 'Replication' },
  { type: 'char',  value: 'secreted',                   label: 'T3 Secreted' },
];

const PAGE_SIZE = 50;

// ── Module-level state (reset on each renderGenomes call) ──
let _strain         = null;
let _search         = '';
let _searchTimer    = null;
let _sortField      = 'locus_tag';
let _sortAsc        = true;
let _filters        = { favorites: false, characterized: false, hypothetical: false,
                        inc: false, membrane: false, secreted: false, dnaBinding: false,
                        hasAf3: false, hasCrystal: false };
let _categoryFilter    = null;
let _locationFilter    = null;  // SL or GO term id set by clicking a localization pill
let _expressionFilter  = null;  // 'Early' | 'Mid' | 'Late' | 'Constitutive'
let _ebRbFilter        = null;  // 'eb' | 'rb'
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

// Which More-panel sections are expanded (persists across filter bar re-renders)
let _expandedSections = { characterization: false, function: false, location: false, structure: false, expression: false };

// HTML-escape helper for DB strings interpolated into innerHTML.
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const stripEvidenceTags = s => s ? s.replace(/\s*\{[^}]+\}/g, '').replace(/\s+\./g, '.').trim() : s;

export function renderGenomes(container) {
  // Pick up strain preference set by home page organisms section
  _strain = window.__preferredStrain ?? 'CT-L2';
  delete window.__preferredStrain;
  _search = ''; _offset = 0; _selectedId = null; _categoryFilter = null; _locationFilter = null;
  _expressionFilter = null; _ebRbFilter = null;
  _filters = { favorites: false, characterized: false, hypothetical: false, inc: false,
               membrane: false, secreted: false, dnaBinding: false,
               hasAf3: false, hasCrystal: false };
  _expandedSections = { characterization: false, function: false, location: false, structure: false, expression: false };
  showGeneList(container);
}

// ─── Gene list ────────────────────────────────────────────

function showGeneList(container) {
  const isMobile = window.innerWidth < 640;

  // Prevent browser scroll restoration from repositioning the gene list on initial load.
  // This is a SPA — we own all scroll state.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  container.style.padding = '0';
  container.innerHTML = `
    <div style="display:${isMobile ? 'block' : 'grid'};grid-template-columns:260px 1fr;height:calc(100vh - 56px${isMobile ? ' - 52px' : ''});width:100%;overflow:hidden;padding:0 12px;box-sizing:border-box;">

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
      <div id="detail-panel" style="overflow-y:auto;overflow-x:clip;min-width:0;display:${isMobile ? 'none' : 'flex'};flex-direction:column;">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#d1d5db;gap:8px;">
          <span style="font-size:28px;opacity:0.4;">🧬</span>
          <span style="font-size:12px;">Select a gene to view details</span>
        </div>
      </div>

    </div>
  `;

  // Ensure gene list scroll starts at top regardless of browser scroll restoration.
  const geneScrollEl = container.querySelector('#gene-scroll');
  if (geneScrollEl) geneScrollEl.scrollTop = 0;

  // Wire strain tabs
  container.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      _strain = btn.dataset.strain;
      _search = ''; _offset = 0; _selectedId = null; _categoryFilter = null; _locationFilter = null;
      _expressionFilter = null;
      _filters = { favorites: false, characterized: false, hypothetical: false, inc: false,
                   membrane: false, secreted: false, dnaBinding: false,
                   hasAf3: false, hasCrystal: false };
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
    const nowFav = toggleFavorite(geneId, GENE_FAVORITES_KEY);
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

function renderFilterBar(container, expandMore = false) {
  const bar = container.querySelector('#filter-bar');
  if (!bar) return;

  const sortLabel = SORT_OPTIONS.find(o => o.field === _sortField)?.label ?? 'Locus tag';

  const chip = (id, label, active, title = '') => `
    <button data-filter="${id}" ${title ? `title="${title}"` : ''}
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#bbf7d0' : '#e5e7eb'};
             background:${active ? '#f0fdf4' : 'white'};color:${active ? '#16a34a' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${label}${active ? ' ×' : ''}
    </button>`;

  const catChip = (value, label) => {
    const active = _categoryFilter === value;
    return `<button data-cat-filter="${esc(value)}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#fde68a' : '#e5e7eb'};
             background:${active ? '#fefce8' : 'white'};color:${active ? '#92400e' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${active ? '⚙️ ' : ''}${label}${active ? ' ×' : ''}
    </button>`;
  };

  // Redundancies removed: Inc Protein, T3 Secreted, Membrane covered by Function/Location sections
  const CHAR_FILTERS = [
    { id: 'characterized', label: 'Characterized' },
    { id: 'hypothetical',  label: 'Hypothetical'  },
    { id: 'dnaBinding',    label: 'DNA Binding'   },
  ];
  // Unknown excluded — covered by Hypothetical in Characterization
  const FUNC_FILTERS = Object.keys(FUNC_LABELS)
    .filter(cat => cat !== 'Unknown')
    .map(cat => ({ value: cat, label: FUNC_LABELS[cat] }));
  const STRUCT_FILTERS = [
    { id: 'hasAf3',     label: 'AlphaFold3',       title: 'Filter to genes with an AlphaFold3 structure prediction' },
    { id: 'hasCrystal', label: 'Crystal structure', title: 'Filter to genes with an experimentally resolved structure' },
  ];

  const EXPR_FILTERS = [
    { value: 'Early',        label: 'Early'        },
    { value: 'Mid',          label: 'Mid'          },
    { value: 'Late',         label: 'Late'         },
    { value: 'Constitutive', label: 'Constitutive' },
  ];

  const exprChip = (value, label) => {
    const active = _expressionFilter === value;
    return `<button data-expr-filter="${esc(value)}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#a5f3fc' : '#e5e7eb'};
             background:${active ? '#ecfeff' : 'white'};color:${active ? '#164e63' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${active ? '📈 ' : ''}${label}${active ? ' ×' : ''}
    </button>`;
  };
  const ebRbChip = (value, label) => {
    const active = _ebRbFilter === value;
    return `<button data-ebrb-filter="${esc(value)}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid ${active ? '#a5f3fc' : '#e5e7eb'};
             background:${active ? '#ecfeff' : 'white'};color:${active ? '#164e63' : '#9ca3af'};cursor:pointer;white-space:nowrap;font-family:inherit;">
      ${active ? '📈 ' : ''}${label}${active ? ' ×' : ''}
    </button>`;
  };

  const activeChar   = CHAR_FILTERS.filter(f => _filters[f.id]);
  const activeStruct = STRUCT_FILTERS.filter(f => _filters[f.id]);
  const anyActive    = activeChar.length || activeStruct.length || _locationFilter || _categoryFilter || _expressionFilter || _ebRbFilter;

  // Section open state is purely user-controlled — no forced-open based on active filters
  const secOpen = {
    characterization: _expandedSections.characterization,
    function:         _expandedSections.function,
    location:         _expandedSections.location,
    structure:        _expandedSections.structure,
    expression:       _expandedSections.expression,
  };

  const groupHead = (id, icon, label, isOpen, hint = '') => `
    <button data-section="${id}"
      style="display:flex;align-items:center;gap:4px;font-size:8.5px;font-weight:700;text-transform:uppercase;
             letter-spacing:0.07em;color:#888;width:100%;margin-top:6px;border-top:1px solid #efefef;
             padding-top:7px;padding-bottom:${isOpen ? '4px' : '2px'};background:none;border-left:none;
             border-right:none;border-bottom:none;cursor:pointer;text-align:left;font-family:inherit;">
      <span>${icon}</span><span>${label}</span>
      <span style="margin-left:auto;font-size:9px;color:#ccc;">${isOpen ? '▾' : '▸'}</span>
      ${!isOpen && hint ? `<span style="font-size:8px;color:#bbb;font-weight:400;margin-left:2px;">${hint}</span>` : ''}
    </button>`;

  const startOpen = expandMore || anyActive || false;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;">
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
      ${chip('favorites', '★ Favorites', _filters.favorites)}
      ${activeChar.map(f => chip(f.id, f.label, true)).join('')}
      ${activeStruct.map(f => chip(f.id, f.label, true, f.title)).join('')}
      ${_categoryFilter   ? `<button data-clear-category   style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #fde68a;background:#fefce8;color:#92400e;cursor:pointer;white-space:nowrap;font-family:inherit;">⚙️ ${esc(funcLabel(_categoryFilter))} ×</button>` : ''}
      ${_locationFilter   ? `<button data-clear-location   style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;font-family:inherit;">📍 ${esc(locTermLabel(_locationFilter))} ×</button>` : ''}
      ${_expressionFilter ? `<button data-clear-expression style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #a5f3fc;background:#ecfeff;color:#164e63;cursor:pointer;white-space:nowrap;font-family:inherit;">📈 ${esc(_expressionFilter)} ×</button>` : ''}
      ${_ebRbFilter ? `<button data-clear-ebrb style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #a5f3fc;background:#ecfeff;color:#164e63;cursor:pointer;white-space:nowrap;font-family:inherit;">📈 ${_ebRbFilter === 'eb' ? 'EB enriched' : 'RB enriched'} ×</button>` : ''}
      <button id="more-filters-btn"
        style="font-size:10.5px;font-weight:600;color:${startOpen ? '#16a34a' : '#9ca3af'};background:white;border:1px solid ${startOpen ? '#bbf7d0' : '#e5e7eb'};border-radius:6px;padding:3px 9px;cursor:pointer;margin-left:auto;font-family:inherit;">
        ${startOpen ? '− Less' : '+ More'}
      </button>
    </div>
    <div id="more-panel" style="display:${startOpen ? 'block' : 'none'};padding:4px 12px 8px;background:#fafafa;border-bottom:1px solid #f0f0f0;overflow-y:auto;max-height:calc(100vh - 200px);">
      ${groupHead('characterization', '', 'Characterization', secOpen.characterization)}
      <div style="display:${secOpen.characterization ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${CHAR_FILTERS.map(f => chip(f.id, f.label, _filters[f.id])).join('')}
      </div>
      ${groupHead('function', '⚙️', 'Function', secOpen.function, '— filter by role')}
      <div style="display:${secOpen.function ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${FUNC_FILTERS.map(f => catChip(f.value, f.label)).join('')}
      </div>
      ${groupHead('location', '📍', 'Location', secOpen.location, '— click a pill on any gene')}
      <div style="display:${secOpen.location ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${_locationFilter
          ? `<button data-clear-location style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;font-family:inherit;">📍 ${esc(locTermLabel(_locationFilter))} ×</button>`
          : `<span style="font-size:9px;color:#bbb;padding:2px 0;">Click a location pill on any gene to filter</span>`}
      </div>
      ${groupHead('structure', '🧊', 'Structure', secOpen.structure)}
      <div style="display:${secOpen.structure ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${STRUCT_FILTERS.map(f => chip(f.id, f.label, _filters[f.id], f.title)).join('')}
      </div>
      ${groupHead('expression', '📈', 'Expression', secOpen.expression, '— click chart or peak label on any gene')}
      <div style="display:${secOpen.expression ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${EXPR_FILTERS.map(f => exprChip(f.value, f.label)).join('')}
        ${_strain === 'CT-L2' ? ebRbChip('eb', 'EB enriched') + ebRbChip('rb', 'RB enriched') : ''}
      </div>
    </div>
  `;

  // Sort dropdown
  const sortBtn  = bar.querySelector('#sort-btn');
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

  // Section header collapse/expand
  bar.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.section;
      _expandedSections[id] = !secOpen[id];
      renderFilterBar(container, true);
    });
  });

  // Boolean filter chip toggles
  bar.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      _filters[key] = !_filters[key];
      _offset = 0;
      renderFilterBar(container, startOpen);
      fetchGenes(container, true);
    });
  });

  // Function / category filter chips
  bar.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.catFilter;
      _categoryFilter = _categoryFilter === val ? null : val;
      _offset = 0;
      renderFilterBar(container, true);
      fetchGenes(container, true);
    });
  });

  // Clear category filter
  bar.querySelector('[data-clear-category]')?.addEventListener('click', () => {
    _categoryFilter = null;
    _offset = 0;
    renderFilterBar(container);
    fetchGenes(container, true);
  });

  // Clear location filter (appears in both main bar and More panel)
  bar.querySelectorAll('[data-clear-location]').forEach(btn => {
    btn.addEventListener('click', () => {
      _locationFilter = null;
      _offset = 0;
      renderFilterBar(container);
      fetchGenes(container, true);
    });
  });

  // Expression filter chips
  bar.querySelectorAll('[data-expr-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.exprFilter;
      _expressionFilter = _expressionFilter === val ? null : val;
      _offset = 0;
      renderFilterBar(container, true);
      fetchGenes(container, true);
    });
  });

  // Clear expression filter
  bar.querySelector('[data-clear-expression]')?.addEventListener('click', () => {
    _expressionFilter = null;
    _offset = 0;
    renderFilterBar(container);
    fetchGenes(container, true);
  });

  // EB/RB proteomics filter chips
  bar.querySelectorAll('[data-ebrb-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.ebrbFilter;
      _ebRbFilter = _ebRbFilter === val ? null : val;
      _offset = 0;
      renderFilterBar(container, true);
      fetchGenes(container, true);
    });
  });

  // Clear EB/RB filter
  bar.querySelector('[data-clear-ebrb]')?.addEventListener('click', () => {
    _ebRbFilter = null;
    _offset = 0;
    renderFilterBar(container);
    fetchGenes(container, true);
  });

  // More panel toggle
  const moreBtn   = bar.querySelector('#more-filters-btn');
  const morePanel = bar.querySelector('#more-panel');
  if (moreBtn && morePanel) {
    moreBtn.addEventListener('click', () => {
      const open = morePanel.style.display !== 'none';
      morePanel.style.display = open ? 'none' : 'block';
      moreBtn.textContent     = open ? '+ More' : '− Less';
      moreBtn.style.color     = open ? '#9ca3af' : '#16a34a';
      moreBtn.style.borderColor = open ? '#e5e7eb' : '#bbf7d0';
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

  // Use !inner on proteins only when a structure filter is active — that's what makes
  // .eq('proteins.has_*', true) filter parent rows. Without structure filters, use a
  // LEFT JOIN so genes without a proteins row (e.g. CTL0001–CTL0050) are still shown.
  const structFilterActive = _filters.hasAf3 || _filters.hasCrystal;
  const proteinsJoin = structFilterActive
    ? 'proteins!inner(has_af3_structure,has_crystal_structure,' +
      'subcellular_location_sl,subcellular_location_go,localization_source,' +
      'alphafold_results(thumbnail_path))'
    : 'proteins(has_af3_structure,has_crystal_structure,' +
      'subcellular_location_sl,subcellular_location_go,localization_source,' +
      'alphafold_results(thumbnail_path))';

  // Build query — strain filtered via embedded join (strain_id is UUID, _strain is common_name)
  let q = sb.from('genes')
    .select(
      'id,strain_id,locus_tag,gene_name,gene_symbol,product,sort_index,' +
      'start_bp,end_bp,strand,expression_pattern,eb_enriched,rb_enriched,' +
      'functional_category,is_characterized,is_membrane_protein,' +
      'is_hypothetical,is_dna_binding,is_t3_secreted,updated_at,updated_by,' +
      'dna_sequence,' +
      'strains!inner(common_name,color_hex),' +
      proteinsJoin,
      { count: 'exact' }
    )
    .eq('strains.common_name', _strain)
    .order(_sortField, { ascending: _sortAsc, nullsFirst: false })
    .range(_offset, _offset + PAGE_SIZE - 1);

  if (_search) {
    q = q.or(`locus_tag.ilike.%${_search}%,gene_name.ilike.%${_search}%,product.ilike.%${_search}%`);
  }
  if (_filters.characterized)  q = q.eq('is_characterized', true);
  if (_filters.hypothetical)   q = q.eq('is_hypothetical', true);
  if (_filters.inc)            q = q.eq('functional_category', 'Inclusion membrane protein');
  if (_filters.membrane)       q = q.eq('is_membrane_protein', true);
  if (_filters.secreted)       q = q.eq('is_t3_secreted', true);
  if (_filters.dnaBinding)     q = q.eq('is_dna_binding', true);
  if (_filters.hasAf3)         q = q.eq('proteins.has_af3_structure', true);
  if (_filters.hasCrystal)     q = q.eq('proteins.has_crystal_structure', true);
  if (_categoryFilter)         q = q.eq('functional_category', _categoryFilter);
  if (_expressionFilter)       q = q.eq('expression_pattern', _expressionFilter);
  if (_ebRbFilter === 'eb')    q = q.eq('eb_enriched', true);
  if (_ebRbFilter === 'rb')    q = q.eq('rb_enriched', true);
  if (_locationFilter) {
    // Try SL term first; if it starts with GO: use the go column
    if (_locationFilter.startsWith('GO:')) {
      q = q.filter('proteins.subcellular_location_go', 'cs', `{${_locationFilter}}`);
    } else {
      q = q.filter('proteins.subcellular_location_sl', 'cs', `{${_locationFilter}}`);
    }
  }

  const { data: genes, count, error } = await q;
  _loading = false;

  // Re-query after await — the DOM may have been rebuilt while the fetch was in flight
  // (e.g. a second renderGenomes call). Using the pre-await reference would write to a
  // detached element.
  const liveList = container.querySelector('#gene-list');
  if (!liveList) return;

  if (error) {
    if (reset) liveList.innerHTML = `<div style="padding:1.5rem;font-size:0.75rem;color:#ef4444;">${error.message}</div>`;
    return;
  }

  _total   = count ?? 0;
  _hasMore = (_offset + PAGE_SIZE) < _total;

  // Update result count
  const countEl = container.querySelector('#result-count');
  if (countEl) countEl.textContent = `${_total.toLocaleString()} gene${_total !== 1 ? 's' : ''}`;

  if (!genes?.length) {
    if (reset) liveList.innerHTML = `<div style="padding:2rem;text-align:center;font-size:0.75rem;color:#9ca3af;">No genes found.</div>`;
    return;
  }

  // Cache all fetched gene objects for detail panel use
  genes.forEach(g => _geneCache.set(String(g.id), g));

  // Apply favorites filter client-side (localStorage)
  let rows = genes;
  if (_filters.favorites) {
    const favs = loadFavorites(GENE_FAVORITES_KEY);
    rows = genes.filter(g => favs.has(String(g.id)));
  }

  if (reset) {
    liveList.innerHTML = rows.map(g => geneRow(g)).join('');
    const scroll = container.querySelector('#gene-scroll');
    if (scroll) scroll.scrollTop = 0;
  } else {
    liveList.insertAdjacentHTML('beforeend', rows.map(g => geneRow(g)).join(''));
  }

  _offset += PAGE_SIZE;

  // Wire row click handlers for newly added rows
  const newRows = liveList.querySelectorAll('.gene-row:not([data-wired])');
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
        liveList.querySelectorAll('.gene-row').forEach(r => {
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
  const favs  = loadFavorites(GENE_FAVORITES_KEY);
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

// ─── Mol* loader (IntersectionObserver-driven) ────────────

async function loadMolstar(wrapEl, url) {
  if (!url) return;

  const vpId  = 'molstar-vp-' + Date.now();
  const vpDiv = document.createElement('div');
  vpDiv.id    = vpId;
  vpDiv.style.cssText =
    'position:absolute;inset:0;border-radius:8px;overflow:hidden;opacity:0;transition:opacity 0.4s;';
  wrapEl.style.position = 'relative';
  wrapEl.appendChild(vpDiv);

  if (!window.molstar) {
    try {
      await _loadMolstarBundle();
    } catch (err) {
      console.warn('[Molstar] bundle load failed:', err);
      vpDiv.remove();
      _showStructureFallback(wrapEl, url);
      return;
    }
  }

  try {
    const v = await molstar.Viewer.create(vpId, {
      layoutIsExpanded:          false,
      layoutShowControls:        false,
      layoutShowRemoteState:     false,
      layoutShowSequence:        true,
      layoutShowLog:             false,
      layoutShowLeftPanel:       false,
      viewportShowExpand:        true,
      viewportShowSelectionMode: false,
      viewportShowAnimation:     false,
    });
    await v.loadStructureFromUrl(url, 'mmcif');
    vpDiv.style.opacity = '1';
    const thumb = wrapEl.querySelector('#struct-thumb');
    if (thumb) { thumb.style.transition = 'opacity 0.4s'; thumb.style.opacity = '0'; }

    // Hide Molstar toolbar buttons that open large panels (overflow the small viewer)
    const suppress = document.createElement('style');
    suppress.textContent = `
      #${vpId} button[title="Screenshot / State Snapshot"],
      #${vpId} button[title="Toggle Controls Panel"],
      #${vpId} button[title="Settings / Controls Info"] { display:none !important; }`;
    document.head.appendChild(suppress);
  } catch (err) {
    console.warn('[Molstar] viewer init failed:', err);
    vpDiv.remove();
    _showStructureFallback(wrapEl, url);
  }
}

let _bundlePromise = null;
function _loadMolstarBundle() {
  if (_bundlePromise) return _bundlePromise;
  _bundlePromise = new Promise((resolve, reject) => {
    const s   = document.createElement('script');
    s.src     = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
    const l  = document.createElement('link');
    l.rel    = 'stylesheet';
    l.href   = 'https://cdn.jsdelivr.net/npm/molstar@3.45.0/build/viewer/molstar.css';
    document.head.appendChild(l);
  });
  return _bundlePromise;
}

function _showStructureFallback(wrapEl, url) {
  const a = document.createElement('a');
  a.href   = url;
  a.target = '_blank';
  a.rel    = 'noopener';
  a.style.cssText =
    'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);' +
    'font-size:9px;font-weight:600;background:rgba(15,69,48,0.85);color:white;' +
    'border-radius:5px;padding:4px 10px;text-decoration:none;white-space:nowrap;';
  a.textContent = 'View / Download ↗';
  wrapEl.style.position = 'relative';
  wrapEl.appendChild(a);
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
  const geneLen     = (gene.start_bp != null && gene.end_bp != null)
    ? gene.end_bp - gene.start_bp
    : null;
  const lengthLabel = geneLen != null ? `${geneLen.toLocaleString()} bp` : '—';
  const posLabel    = (gene.start_bp != null && gene.end_bp != null)
    ? `${gene.start_bp.toLocaleString()}–${gene.end_bp.toLocaleString()}`
    : null;

  const el = detail.querySelector('#d-gene-info');
  if (!el) return;
  el.innerHTML = `
    ${sectionHead('Gene Info', seqCopyBtn('Copy DNA', gene.dna_sequence))}
    <div style="padding:2px 16px 14px;">
      <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:8px;">
        ${prop('Length', lengthLabel)}
        ${prop('Strand', strandLabel)}
        ${posLabel ? prop('Position', posLabel) : ''}
        ${prop('Organism', ORGANISM_FULL[gene.strains?.common_name] ?? null)}
      </div>
    </div>`;
  attachCopyBtns(el);

  // Seed hero ext links with NCBI immediately (UniProt added when protein loads)
  const heroLinks = detail.querySelector('#d-hero-ext-links');
  if (heroLinks) {
    const updatedStamp = gene.updated_at
      ? `<span style="font-size:8px;color:#bbb;line-height:1;white-space:nowrap;margin-right:4px;">
           Last updated ${new Date(gene.updated_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}${gene.updated_by ? ` · ${esc(gene.updated_by)}` : ''}
         </span>`
      : '';
    heroLinks.innerHTML = updatedStamp + ncbiLink(gene.locus_tag);
  }
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
          .select('id,locus_tag,gene_name,functional_category,strand,start_bp,end_bp,sort_index')
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

  // For non-CT-L2 genes, fetch CT-L2 ortholog proteomics for the proteomics panel
  let orthoProtRow = null;
  if ((gene.strains?.common_name ?? _strain) !== 'CT-L2') {
    const l2Orth = orthoRows.find(o => o.gene_b?.strains?.common_name === 'CT-L2');
    if (l2Orth?.gene_b?.id) {
      const { data: od } = await sb.from('expression_data')
        .select('eb_expression,rb_expression')
        .eq('gene_id', l2Orth.gene_b.id);
      const protOd = od?.find(r => r.eb_expression != null || r.rb_expression != null) ?? null;
      if (protOd) orthoProtRow = { ...protOd, _orthoTag: l2Orth.gene_b.locus_tag };
    }
  }

  renderDetailOrthologs(detail, orthoRows, gene);
  renderDetailGeneMap(detail, gene, neighborResult.data ?? []);
  renderDetailProtein(detail, gene, protResult.data);
  renderDetailTranscriptomics(detail, gene, exprRows ?? []);
  renderDetailProteomics(detail, gene, exprRows ?? [], orthoProtRow);
  renderDetailStructure(detail, gene, protResult.data, protResult.data?.alphafold_results ?? []);
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
          'dna_sequence,' +
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
  // Use (end_bp - start_bp) when coordinates available; fall back to end_bp*3 (aa→bp approx).
  const gLen    = g => (g.start_bp != null && g.end_bp != null)
    ? g.end_bp - g.start_bp
    : (g.end_bp ?? 600) * 3;
  const totalBp = neighbors.reduce((s, g) => s + Math.max(gLen(g), 1), 0);
  const scale   = (VB_W - 20) / Math.max(totalBp, 1);

  let x = 10;
  const arrowDefs = neighbors.map(g => {
    const w   = Math.max(Math.round(gLen(g) * scale), MIN_W);
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
      <div style="background:#fafafa;border:1px solid #efefef;border-radius:6px;padding:10px 10px 8px;overflow:hidden;">
        <svg viewBox="0 0 ${actualVbW} ${VB_H}" xmlns="http://www.w3.org/2000/svg"
             style="width:100%;height:auto;display:block;overflow:hidden;">
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
          'dna_sequence,' +
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
    ${sectionHead('Protein', seqCopyBtn('Copy AA', protein.aa_sequence))}
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
  attachCopyBtns(el);

  // Update hero ext links now that we have the UniProt ID
  const heroLinks = detail.querySelector('#d-hero-ext-links');
  if (heroLinks) {
    const updatedStamp = gene.updated_at
      ? `<span style="font-size:8px;color:#bbb;line-height:1;white-space:nowrap;margin-right:4px;">
           Last updated ${new Date(gene.updated_at).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}${gene.updated_by ? ` · ${esc(gene.updated_by)}` : ''}
         </span>`
      : '';
    heroLinks.innerHTML = updatedStamp +
      extLink('UniProt', protein.uniprot_id ? `https://www.uniprot.org/uniprot/${protein.uniprot_id}` : null) +
      ncbiLink(gene.locus_tag);
  }
}

// Generates a copy-to-clipboard button for a raw sequence string.
// Call attachCopyBtns(el) after setting el.innerHTML to wire up the listener.
function seqCopyBtn(label, seq) {
  if (!seq) return '';
  const icon = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-left:4px;flex-shrink:0;">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
  return `<button data-copy-seq="${esc(seq)}" data-copy-label="${label}"
    style="display:inline-flex;align-items:center;font-size:8px;font-weight:600;color:#6b7280;background:white;border:1px solid #e5e7eb;
           border-radius:5px;padding:2px 8px;cursor:pointer;font-family:inherit;line-height:1.4;
           transition:color 0.15s,border-color 0.15s;"
    onmouseenter="this.style.borderColor='#d1d5db'"
    onmouseleave="this.style.borderColor='#e5e7eb'">${label}${icon}</button>`;
}

function attachCopyBtns(el) {
  el.querySelectorAll('[data-copy-seq]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copySeq).then(() => {
        const orig = btn.innerHTML;
        btn.textContent = 'Copied!';
        btn.style.color = '#16a34a';
        btn.style.borderColor = '#bbf7d0';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.color = '#6b7280';
          btn.style.borderColor = '#e5e7eb';
        }, 1800);
      });
    });
  });
}

// Helper: NCBI gene link (always available from locus tag)
function ncbiLink(locusTag) {
  return `<a href="https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(locusTag)}" target="_blank" rel="noopener"
    style="font-size:9.5px;font-weight:500;color:#6b7280;text-decoration:none;padding:2px 7px;border:1px solid #e5e7eb;border-radius:5px;background:#f9fafb;"
    onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background='#f9fafb'">NCBI ↗</a>`;
}

// Map raw pattern_label values → normalized 4-bucket vocabulary
const L2_PATTERN_BUCKET = {
  'Early': 'Early', 'Mid': 'Mid', 'Mid_Late': 'Mid',
  'Late': 'Late', 'late': 'Late', 'Very_Late': 'Late',
  'Constitutive': 'Constitutive',
};

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

  // CT-L2 qualitative case: pattern_label holds expression pattern, no quantitative values
  if (values.every(v => v === 0) && sorted[0]?.pattern_label) {
    const rawLabel  = sorted[0].pattern_label;
    const bucket    = gene.expression_pattern ?? L2_PATTERN_BUCKET[rawLabel] ?? null;
    const display   = String(rawLabel).toUpperCase().replace(/_/g, ' ');
    const clickable = bucket != null;
    const isActive  = bucket && _expressionFilter === bucket;

    el.innerHTML = `
      ${sectionHead('Transcriptomics')}
      <div style="padding:8px 16px 14px;">
        <div style="font-size:9px;color:#555;margin-bottom:6px;">Expression pattern (CT-L2)</div>
        <span data-expr-pill="${esc(bucket ?? '')}"
          style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;
                 background:${isActive ? '#ecfeff' : '#f3f4f6'};
                 color:${isActive ? '#164e63' : '#374151'};
                 border:1px solid ${isActive ? '#a5f3fc' : '#e5e7eb'};
                 ${clickable ? 'cursor:pointer;' : ''}
                 transition:background 0.15s;">
          ${display}${isActive ? ' ×' : ''}
        </span>
        <div style="font-size:8.5px;color:#bbb;margin-top:6px;font-style:italic;">
          Qualitative · Nicholson et al. 2003, J Bacteriol · PMID 12730178
          ${clickable ? '· click to filter' : ''}
        </div>
      </div>`;

    if (clickable) {
      el.querySelector('[data-expr-pill]')?.addEventListener('click', () => {
        _expressionFilter = _expressionFilter === bucket ? null : bucket;
        _offset = 0;
        if (_expressionFilter) _expandedSections.expression = true;
        renderFilterBar(_container, !!_expressionFilter);
        fetchGenes(_container, true);
        // Re-render pill state
        renderDetailTranscriptomics(detail, gene, exprRows);
      });
    }
    return;
  }

  // CT-D quantitative case
  const bucket   = gene.expression_pattern ?? null;
  const isActive = bucket && _expressionFilter === bucket;

  // Peak: first timepoint at ≥90% of max (avoids noise-driven right-shift)
  const threshold = maxVal * 0.90;
  const peakTp = sorted.find(r => (r.value ?? 0) >= threshold) ?? sorted[sorted.length - 1];
  const peakLabel = TP_LABEL[peakTp.timepoint] ?? peakTp.timepoint;

  const bars = sorted.map(r => {
    const h   = Math.round(((r.value ?? 0) / maxVal) * 40);
    const pct = Math.max(h, 2);
    const lbl = TP_LABEL[r.timepoint] ?? r.timepoint;
    return `
      <div style="display:flex;flex-direction:column;align-items:center;flex:1;">
        <div style="height:40px;display:flex;align-items:flex-end;width:100%;">
          <div data-expr-bar title="${lbl}: ${r.value ?? 0}"
            style="background:#4ade80;border-radius:2px 2px 0 0;width:100%;height:${pct}px;
                   ${bucket ? 'cursor:pointer;' : ''}transition:background 0.1s;"
            onmouseenter="this.style.background='#16a34a'"
            onmouseleave="this.style.background='#4ade80'"></div>
        </div>
        <div style="font-size:7.5px;color:#9ca3af;font-family:'DM Mono',monospace;margin-top:3px;">${lbl}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    ${sectionHead('Transcriptomics')}
    <div style="padding:8px 16px 14px;">
      <div style="display:flex;align-items:flex-end;gap:4px;height:57px;padding-bottom:17px;position:relative;">
        <div style="position:absolute;bottom:17px;left:0;right:0;height:1px;background:#e5e7eb;"></div>
        ${bars}
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#16a34a;flex-shrink:0;"></div>
        <span data-expr-peak
          style="font-size:8px;color:${isActive ? '#164e63' : '#9ca3af'};
                 ${bucket ? 'cursor:pointer;text-decoration:underline dotted;' : ''}">
          Peak ${peakLabel}${bucket ? ` · ${bucket}` : ''}${isActive ? ' ×' : ''}
        </span>
      </div>
      <div style="font-size:8px;color:#9ca3af;margin-top:6px;font-style:italic;">CT-D microarray · 1h–40h · Belland et al. 2003, PNAS · PMID 12815105</div>
    </div>`;

  if (bucket) {
    const activate = () => {
      _expressionFilter = _expressionFilter === bucket ? null : bucket;
      _offset = 0;
      if (_expressionFilter) _expandedSections.expression = true;
      renderFilterBar(_container, !!_expressionFilter);
      fetchGenes(_container, true);
      renderDetailTranscriptomics(detail, gene, exprRows);
    };
    el.querySelectorAll('[data-expr-bar]').forEach(b => b.addEventListener('click', activate));
    el.querySelector('[data-expr-peak]')?.addEventListener('click', activate);
  }
}

function renderDetailProteomics(detail, gene, exprRows, orthoProtRow = null) {
  const el = detail.querySelector('#d-proteomics');
  if (!el) return;

  const localProtRow = exprRows.find(r => r.eb_expression != null || r.rb_expression != null);
  const protRow = localProtRow ?? orthoProtRow;
  const strainName = gene.strains?.common_name ?? _strain;
  const isInferred = strainName !== 'CT-L2' && protRow != null;

  if (!protRow) {
    el.innerHTML = `
      ${sectionHead('EB / RB Proteomics')}
      <div style="padding:8px 16px 14px;font-size:9px;color:#bbb;font-style:italic;">No proteomic data available</div>`;
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

  // Enrichment pill — only for CT-L2 genes (eb_enriched/rb_enriched are null for other strains)
  const ebEnriched = gene.eb_enriched;
  const rbEnriched = gene.rb_enriched;
  const enrichLabel = ebEnriched ? 'EB enriched' : rbEnriched ? 'RB enriched' : null;
  const enrichFilter = ebEnriched ? 'eb' : rbEnriched ? 'rb' : null;
  const pillActive = enrichFilter && _ebRbFilter === enrichFilter;

  const enrichPill = enrichLabel ? `
    <span data-prot-enrich-pill="${esc(enrichFilter)}"
      style="display:inline-block;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;
             background:${pillActive ? '#ecfeff' : '#f3f4f6'};
             color:${pillActive ? '#164e63' : '#374151'};
             border:1px solid ${pillActive ? '#a5f3fc' : '#e5e7eb'};
             cursor:pointer;margin-bottom:8px;transition:background 0.15s;">
      ${enrichLabel}${pillActive ? ' ×' : ''}
    </span>` : '';

  el.innerHTML = `
    ${sectionHead('EB / RB Proteomics')}
    <div style="padding:8px 16px 14px;">
      ${isInferred ? `<div style="font-size:8px;color:#f59e0b;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:5px 8px;margin-bottom:8px;">Data from CT-L2 ortholog${orthoProtRow?._orthoTag ? ` (${esc(orthoProtRow._orthoTag)})` : ''} · Not measured in CT-D/CM · May not reflect this strain's protein abundance</div>` : ''}
      ${bar('EB (elementary body)', ebVal, '/web/images/eb.png')}
      ${bar('RB (reticulate body)', rbVal, '/web/images/rb.png')}
      ${enrichPill}
      <div style="font-size:8.5px;color:#bbb;font-style:italic;">CT-L2 spectral counts · Saka et al. 2011, Mol Microbiol · PMID 22014092</div>
    </div>`;

  if (enrichFilter) {
    el.querySelector('[data-prot-enrich-pill]')?.addEventListener('click', () => {
      _ebRbFilter = _ebRbFilter === enrichFilter ? null : enrichFilter;
      _offset = 0;
      renderFilterBar(_container, !!_ebRbFilter);
      fetchGenes(_container, true);
      renderDetailProteomics(detail, gene, exprRows, orthoProtRow);
    });
  }
}

// ─── Structure confidence score helpers ───────────────────
// AlphaFold color scale: orange → yellow → light blue → dark blue (low → high)

function plddtColor(score) {
  if (score >= 90) return '#1d4ed8';
  if (score >= 70) return '#60a5fa';
  if (score >= 50) return '#f59e0b';
  return '#f97316';
}

function plddtLabel(score) {
  if (score >= 90) return 'Very high';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Low';
  return 'Very low';
}

function ptmColor(score) {
  if (score >= 0.8) return '#1d4ed8';
  if (score >= 0.6) return '#60a5fa';
  if (score >= 0.4) return '#f59e0b';
  return '#f97316';
}

function setupMolstarObserver(el) {
  const wrap = el.querySelector('#struct-viewer-wrap');
  if (!wrap) return;
  const url        = wrap.dataset.url;
  const uniprotId  = wrap.dataset.uniprotId;
  if (!url && !uniprotId) return;
  if (wrap.dataset.molstarInitiated) return;
  wrap.dataset.molstarInitiated = 'true';

  let fired = false;
  const observer = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || fired) return;
    fired = true;
    observer.disconnect();
    if (uniprotId) {
      loadMolstarViaAfdbApi(wrap, uniprotId, el);
    } else {
      loadMolstar(wrap, url);
    }
  }, { threshold: 0.1 });

  observer.observe(wrap);
}

async function loadMolstarViaAfdbApi(wrap, uniprotId, panelEl) {
  let cifUrl;
  try {
    const res   = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`);
    const entry = (await res.json())[0];
    cifUrl = entry.cifUrl;
    const plddt = entry.globalMetricValue;
    const scoreEl = panelEl?.querySelector('#af2-score-display');
    if (scoreEl && plddt != null) {
      scoreEl.innerHTML = `
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;
                       color:${plddtColor(plddt)};line-height:1;">${plddt.toFixed(1)}</span>
          <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.08em;color:#9ca3af;">mean pLDDT · ${plddtLabel(plddt)}</span>
        </div>`;
    }
  } catch (err) {
    console.warn('[Molstar] AFDB API fetch failed:', err);
    if (wrap.isConnected) _showStructureFallback(wrap, `https://alphafold.ebi.ac.uk/entry/${uniprotId}`);
    return;
  }
  if (wrap.isConnected) loadMolstar(wrap, cifUrl);
}

function formatExptlMethod(method) {
  const map = {
    'X-RAY DIFFRACTION':  'X-ray crystallography',
    'ELECTRON MICROSCOPY': 'Cryo-EM',
    'NEUTRON DIFFRACTION': 'Neutron diffraction',
    'SOLUTION NMR':       'NMR',
    'SOLID-STATE NMR':    'Solid-state NMR',
  };
  return map[method?.toUpperCase()] ?? method ?? '';
}

async function fetchRcsbMetadata(el, pdbId) {
  const container = el.querySelector('#rcsb-detail');
  if (!container || !pdbId) return;
  try {
    const res  = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId.toLowerCase()}`);
    const data = await res.json();
    const method  = data.exptl?.[0]?.method ?? '';
    const res_hi  = data.refine?.[0]?.ls_d_res_high ?? null;
    const parts   = [formatExptlMethod(method), res_hi ? `${parseFloat(res_hi).toFixed(2)} Å` : ''].filter(Boolean);
    if (container.isConnected) container.textContent = parts.join(' · ');
  } catch { /* silently fail */ }
}

function renderDetailStructure(detail, gene, protein, afRows) {
  const el = detail.querySelector('#d-structure');
  if (!el) return;

  const crystal   = afRows.find(r => r.af_version === 'crystal');
  const af3       = afRows.find(r => r.af_version === 'AF3');
  const uniprotId = protein?.uniprot_id ?? null;

  // Use DB row if present; otherwise mark as synthetic — AFDB API fetched at load time
  const af2 = afRows.find(r => r.af_version === 'AF2' || r.af_version === 'AFDB')
    ?? (uniprotId ? {
      af_version: 'AF2', _synthetic: true, _uniprotId: uniprotId,
      mmcif_path: null, thumbnail_path: null, homology_score: null, ptm_score: null,
      top_homolog_pdb_id: null, top_homolog_description: null,
      homology_method: null, inferred_function: null,
    } : null);

  // AF3 tab is only enabled when a mmcif model has actually been supplied
  const af3Available = af3?.mmcif_path ? af3 : null;

  let activeTab    = crystal ? 'crystal' : af3Available ? 'af3' : 'af2';
  let activeRecord = crystal ?? af3Available ?? af2;

  function tabBtn(id, label, record) {
    const available = !!record;
    const isActive  = id === activeTab;
    return `
      <button class="struct-tab" data-tab="${id}"
        style="padding:8px 14px;font-size:10px;font-weight:600;border:none;background:none;
               cursor:${available ? 'pointer' : 'not-allowed'};font-family:inherit;white-space:nowrap;
               color:${isActive ? '#1a6b4a' : available ? '#9ca3af' : '#d1d5db'};
               border-bottom:2px solid ${isActive ? '#1a6b4a' : 'transparent'};margin-bottom:-1px;"
        ${!available ? 'disabled' : ''}>
        ${label}${!available ? ' —' : ''}
      </button>`;
  }

  function extLink(href, label, download = false) {
    const attrs = download
      ? `href="${esc(href)}" download`
      : `href="${esc(href)}" target="_blank" rel="noopener"`;
    return `<a ${attrs}
      style="font-size:9.5px;font-weight:500;color:#6b7280;text-decoration:none;
             padding:3px 8px;border:1px solid #d1d5db;border-radius:5px;background:#f9fafb;">
      ${label}
    </a>`;
  }

  function afdbLink() {
    if (!uniprotId) return '';
    return extLink(`https://alphafold.ebi.ac.uk/entry/${uniprotId}`, 'AlphaFoldDB ↗');
  }

  function viewerHtml(record) {
    if (!record) {
      return `<div style="display:flex;align-items:center;justify-content:center;height:200px;
                          background:#f9fafb;border-radius:8px;font-size:10px;color:#bbb;font-style:italic;">
                No structural data available for this source
              </div>`;
    }

    const thumbHtml = record.thumbnail_path
      ? `<img src="${esc(record.thumbnail_path)}" alt="Structure thumbnail" id="struct-thumb"
              style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;
                     font-size:28px;color:#374151;background:#111827;border-radius:8px;">⬡</div>`;

    let scoreHtml = '';
    if (record.af_version === 'AF3' && record.ptm_score != null) {
      scoreHtml = `
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:10px;">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;
                       color:${ptmColor(record.ptm_score)};line-height:1;">
            ${record.ptm_score.toFixed(2)}
          </span>
          <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.08em;color:#9ca3af;">pTM score</span>
        </div>`;
    } else if (record.af_version === 'AF2' || record.af_version === 'AFDB') {
      // Pre-fill from DB if available; AFDB API will confirm/update when viewer loads
      const dbScore = record.homology_score;
      const preHtml = dbScore != null ? `
        <div style="display:flex;align-items:baseline;gap:6px;">
          <span style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;
                       color:${plddtColor(dbScore)};line-height:1;">${dbScore.toFixed(1)}</span>
          <span style="font-size:8.5px;font-weight:700;text-transform:uppercase;
                       letter-spacing:0.08em;color:#9ca3af;">mean pLDDT · ${plddtLabel(dbScore)}</span>
        </div>` : '';
      scoreHtml = `<div id="af2-score-display" style="margin-bottom:10px;min-height:26px;">${preHtml}</div>`;
    }

    const homologHtml = (record.af_version !== 'crystal' && record.top_homolog_description)
      ? `<div style="font-size:10.5px;color:#222;font-weight:600;margin-bottom:2px;">
           ${esc(record.top_homolog_description)}
         </div>
         <div style="font-size:9.5px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
           ${record.top_homolog_pdb_id ? `RCSB PDB: ${esc(record.top_homolog_pdb_id)}` : ''}
           ${record.homology_method    ? ` · Method: ${esc(record.homology_method)}` : ''}
         </div>`
      : '';

    const inferredHtml = (record.af_version !== 'crystal' && record.inferred_function)
      ? `<div style="font-size:10px;color:#444;background:#f0fdf4;border-radius:6px;
                     padding:7px 10px;border-left:3px solid #16a34a;line-height:1.55;margin-bottom:10px;">
           <strong style="color:#1a6b4a;">Inferred function:</strong> ${esc(record.inferred_function)}
         </div>`
      : '';

    let sourceLabel = '';
    let idHtml      = '';
    let linksHtml   = '';

    let versionNoteHtml = '';
    if (record.af_version === 'AF3') {
      versionNoteHtml = `<div style="font-size:9px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
        AlphaFold v3 (2024) uses a diffusion-based architecture that improves accuracy, especially for proteins with few homologs.
        These predictions were generated by the Hybiske Lab.
      </div>`;
    } else if (record.af_version === 'AF2' || record.af_version === 'AFDB') {
      versionNoteHtml = `<div style="font-size:9px;color:#9ca3af;line-height:1.5;margin-bottom:10px;">
        AlphaFold v2 (2021) predicts structure from sequence and evolutionary data using a transformer-based model.
        Predictions are sourced from the EBI AlphaFold Database.
      </div>`;
    }

    if (record.af_version === 'crystal') {
      sourceLabel = 'Crystal Structure · RCSB PDB';
      const pdbId = record.top_homolog_pdb_id ?? '';
      idHtml = pdbId
        ? `<div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;
                              color:#111;line-height:1;margin-bottom:4px;">
                    ${esc(pdbId)}
                  </div>
                  <div id="rcsb-detail" style="font-size:9.5px;color:#9ca3af;
                       margin-bottom:14px;min-height:14px;"></div>`
        : '';
      const links = [
        pdbId ? extLink(`https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}`, `RCSB ${esc(pdbId)} ↗`) : '',
      ].filter(Boolean);
      linksHtml = links.join('');
    } else if (record.af_version === 'AF3') {
      sourceLabel = 'AlphaFold v3 · Hybiske Lab';
      const links = [
        record.top_homolog_pdb_id
          ? extLink(`https://www.rcsb.org/structure/${encodeURIComponent(record.top_homolog_pdb_id)}`,
                    `RCSB ${esc(record.top_homolog_pdb_id)} ↗`)
          : '',
        afdbLink(),
        record.mmcif_path ? extLink(record.mmcif_path, 'Open mmCIF ↗') : '',
      ].filter(Boolean);
      linksHtml = links.join('');
    } else {
      sourceLabel = 'AlphaFold v2 · AlphaFoldDB';
      linksHtml = afdbLink();
    }

    return `
      <div style="display:flex;gap:16px;align-items:flex-start;overflow:hidden;min-width:0;">
        <div id="struct-viewer-wrap"
          style="width:200px;height:200px;flex-shrink:0;border-radius:8px;overflow:hidden;
                 position:relative;background:#0a1628;"
          ${(record.af_version === 'AF2' || record.af_version === 'AFDB') && uniprotId
            ? `data-uniprot-id="${esc(uniprotId)}"`
            : `data-url="${record.mmcif_path ? esc(record.mmcif_path) : ''}"`}>
          ${thumbHtml}
        </div>
        <div style="flex:1;min-width:0;padding-top:2px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;
                      letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px;">
            ${sourceLabel}
          </div>
          ${versionNoteHtml}
          ${idHtml}
          ${scoreHtml}
          ${homologHtml}
          ${inferredHtml}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">${linksHtml}</div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    ${sectionHead('Structure')}
    <div style="border-bottom:1px solid #e5e7eb;margin:0 16px 12px;display:flex;">
      ${tabBtn('crystal', 'Crystal Structure', crystal)}
      ${tabBtn('af3',     'AlphaFold v3',      af3Available)}
      ${tabBtn('af2',     'AlphaFold v2',      af2)}
    </div>
    <div id="struct-viewer-body" style="padding:0 16px 16px;">
      ${viewerHtml(activeRecord)}
    </div>`;

  el.querySelectorAll('.struct-tab:not([disabled])').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab    = tab.dataset.tab;
      activeRecord = activeTab === 'crystal' ? crystal : activeTab === 'af3' ? af3Available : af2;
      el.querySelectorAll('.struct-tab').forEach(t => {
        const isActive = t.dataset.tab === activeTab;
        t.style.color             = isActive ? '#1a6b4a' : (t.disabled ? '#d1d5db' : '#9ca3af');
        t.style.borderBottomColor = isActive ? '#1a6b4a' : 'transparent';
      });
      el.querySelector('#struct-viewer-body').innerHTML = viewerHtml(activeRecord);
      setupMolstarObserver(el);
      if (activeTab === 'crystal' && crystal?.top_homolog_pdb_id) {
        fetchRcsbMetadata(el, crystal.top_homolog_pdb_id);
      }
    });
  });

  setupMolstarObserver(el);
  if (activeTab === 'crystal' && crystal?.top_homolog_pdb_id) {
    fetchRcsbMetadata(el, crystal.top_homolog_pdb_id);
  }
}

// Mapping of common GO cellular component IDs → human-readable labels
const GO_LABELS = {
  // General compartments
  'GO:0005737': 'Cytoplasm',
  'GO:0005829': 'Cytosol',
  'GO:0005576': 'Extracellular region',
  'GO:0005615': 'Extracellular space',
  'GO:0005886': 'Plasma membrane',
  'GO:0016020': 'Membrane',
  'GO:0009986': 'Cell surface',
  'GO:0030312': 'External side of plasma membrane',
  'GO:0042025': 'Host cell nucleus',
  'GO:0044164': 'Host cell cytosol',
  'GO:0030140': 'Trans-Golgi network transport vesicle',
  // Bacterial compartments & envelopes
  'GO:0009276': 'Cell wall',
  'GO:0009279': 'Cell outer membrane',
  'GO:0009295': 'Nucleoid',
  'GO:0019867': 'Outer membrane',
  'GO:0030288': 'Periplasmic space',
  'GO:0042597': 'Periplasmic space',
  'GO:0043590': 'Bacterial nucleoid',
  'GO:0032153': 'Cell division site',
  'GO:0005856': 'Cytoskeleton',
  'GO:0005694': 'Chromosome',
  'GO:0097268': 'Cytoophidium',
  // Ribosomes & translation
  'GO:0005840': 'Ribosome',
  'GO:0015934': 'Large ribosomal subunit',
  'GO:0015935': 'Small ribosomal subunit',
  'GO:0022625': 'Cytosolic large ribosomal subunit',
  'GO:0022627': 'Cytosolic small ribosomal subunit',
  'GO:1990904': 'Ribonucleoprotein complex',
  // Secretion systems
  'GO:0015627': 'Type II secretion system complex',
  'GO:0030257': 'Type III secretion system complex',
  // Energy / metabolism complexes
  'GO:0045259': 'ATP synthase complex',
  'GO:0033176': 'V-type ATPase complex',
  'GO:0033177': 'Two-sector ATPase complex',
  'GO:0033178': 'Two-sector ATPase complex',
  'GO:0033179': 'V-type ATPase, V0 domain',
  'GO:0016471': 'Vacuolar V-type ATPase complex',
  'GO:0045254': 'Pyruvate dehydrogenase complex',
  'GO:0045252': 'Oxoglutarate dehydrogenase complex',
  'GO:0009361': 'Succinate-CoA ligase complex',
  'GO:0042709': 'Succinate-CoA ligase complex',
  'GO:0070069': 'Cytochrome complex',
  'GO:1990220': 'GroEL-GroES complex',
  'GO:1990229': 'Iron-sulfur cluster assembly complex',
  'GO:1990228': 'Sulfurtransferase complex',
  'GO:1990351': 'Transporter complex',
  'GO:0043190': 'ABC transporter complex',
  'GO:0010170': 'ADP-glucose pyrophosphorylase complex',
  // DNA / repair complexes
  'GO:0000428': 'RNA polymerase complex',
  'GO:0009360': 'DNA polymerase III complex',
  'GO:0009330': 'Topoisomerase II complex',
  'GO:0009338': 'Exodeoxyribonuclease V complex',
  'GO:0009318': 'Exodeoxyribonuclease VII complex',
  'GO:0009380': 'Excinuclease repair complex',
  'GO:0048476': 'Holliday junction resolvase complex',
  'GO:0033202': 'DNA helicase complex',
  'GO:0032300': 'Mismatch repair complex',
  'GO:0032299': 'Ribonuclease H2 complex',
  'GO:1990077': 'Primosome complex',
  'GO:0032993': 'Protein-DNA complex',
  // Other complexes
  'GO:0009317': 'Acetyl-CoA carboxylase complex',
  'GO:0009349': 'Riboflavin synthase complex',
  'GO:0009368': 'Endopeptidase Clp complex',
  'GO:0009376': 'HslUV protease complex',
  'GO:0048500': 'Signal recognition particle',
  'GO:0030677': 'Ribonuclease P complex',
  'GO:0030956': 'Glutamyl-tRNA amidotransferase complex',
  'GO:0043527': 'tRNA methyltransferase complex',
  'GO:0005971': 'Ribonucleotide reductase complex',
  'GO:0005960': 'Glycine cleavage complex',
  'GO:0005952': 'cAMP-dependent protein kinase complex',
  'GO:0046930': 'Pore complex',
  'GO:0098797': 'Plasma membrane protein complex',
};

function locTermLabel(termId) {
  if (!termId) return termId;
  if (termId.startsWith('GO:')) return GO_LABELS[termId] ?? termId;
  // SL ID → human label; fallback to raw ID
  const SL_LABELS = {
    'SL-0086': 'Cytoplasm',
    'SL-0037': 'Cell inner membrane',
    'SL-0039': 'Cell membrane',
    'SL-0040': 'Cell outer membrane',
    'SL-0041': 'Cell wall',
    'SL-0093': 'Cell membrane',
    'SL-0162': 'Nucleoid',
    'SL-0187': 'Periplasm',
    'SL-0191': 'Periplasm',
    'SL-0200': 'Membrane',
    'SL-0204': 'Secreted',
    'SL-0243': 'Secreted',
    'SL-0310': 'Cell surface',
    'SL-0020': 'Cell outer membrane',
    'SL-0122': 'Host cell membrane',
    'SL-0023': 'Cell surface',
    'SL-0478': 'Host cytoplasm',
  };
  return SL_LABELS[termId] ?? termId;
}

function renderDetailLocalization(detail, gene, protein) {
  const el = detail.querySelector('#d-localization');
  if (!el) return;

  const source   = protein?.localization_source ?? null;
  const slTerms  = protein?.subcellular_location_sl ?? [];
  const goTerms  = protein?.subcellular_location_go ?? [];
  const taxid    = Number(STRAIN_TAXID[gene.strains?.common_name]) || 813;
  const isHypo   = gene.is_hypothetical ?? false;

  // --- Determine diagram endpoint and pill set ---
  let diagramUrl  = null;
  let activeTerms = [];  // { id, label } pairs for pills
  let sourceBadge = '';

  const badgeStyle = (bg, color) =>
    `font-size:7.5px;font-weight:700;padding:1px 7px;border-radius:8px;background:${bg};color:${color};letter-spacing:0.04em;font-family:inherit;`;

  if (source === 'user') {
    diagramUrl  = slTerms.length ? `https://www.swissbiopics.org/api/${taxid}/sl/${slTerms.map(t => t.replace(/^SL-/, '')).join(',')}` : null;
    activeTerms = slTerms.map(id => ({ id, label: locTermLabel(id) }));
    sourceBadge = `<span style="${badgeStyle('#d1fae5','#065f46')}">Curated</span>`;
  } else if (source === 'lab_flag') {
    const isInc = gene.functional_category === 'Inclusion membrane protein';
    const isT3  = gene.is_t3_secreted === true;
    // lab_flag = we're overriding to Secreted. Always use SL-0243 for diagram geometry —
    // SL-0204 (UniProt generic "Secreted") has no subcell_present elements; SL-0243 does.
    diagramUrl  = `https://www.swissbiopics.org/api/${taxid}/sl/0243`;
    activeTerms = [{ id: 'SL-0204', label: 'Secreted' }];
    const reason = isInc
      ? 'Inc (inclusion membrane) proteins are actively secreted into the host cell via the T3SS. UniProt incorrectly annotates them as bacterial membrane proteins. Location overridden to Secreted.'
      : isT3
      ? 'T3SS effector proteins are actively secreted into the host cell via the type III secretion system. UniProt incorrectly annotates them as bacterial membrane proteins. Location overridden to Secreted.'
      : 'Location overridden by ChlamAtlas to Secreted based on experimental evidence.';
    sourceBadge = `<span style="${badgeStyle('#fef3c7','#92400e')}cursor:default;" title="${esc(reason)}">ChlamAtlas</span>`;
  } else if (source === 'uniprot_sl') {
    diagramUrl  = `https://www.swissbiopics.org/api/${taxid}/sl/${slTerms.map(t => t.replace(/^SL-/, '')).join(',')}`;
    activeTerms = slTerms.map(id => ({ id, label: locTermLabel(id) }));
    sourceBadge = `<span style="${badgeStyle('#f3f4f6','#6b7280')}">UniProt</span>`;
  } else if (source === 'uniprot_go') {
    const goIds = goTerms.map(t => t.replace(/^GO:/, '')).join(',');
    diagramUrl  = `https://www.swissbiopics.org/api/${taxid}/go/${goIds}`;
    activeTerms = goTerms.map(id => ({ id, label: locTermLabel(id) }));
    sourceBadge = `<span style="${badgeStyle('#f3f4f6','#6b7280')}">GO</span>`;
  }

  // --- No data ---
  if (!diagramUrl && (isHypo || !protein?.localization)) {
    el.innerHTML = `
      ${sectionHead('Cell Localization')}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:18px 8px 14px;text-align:center;">
        <div style="font-size:20px;color:#d1d5db;">◎</div>
        <div style="font-size:9px;font-weight:600;color:#aaa;">Location unknown</div>
      </div>`;
    return;
  }

  // --- UniProt localization text pills (supplementary, below the primary pills) ---
  const textPillsHtml = buildLocTextPills(protein?.localization ?? '');

  // --- Primary pills (clickable, from term IDs) ---
  const primaryPillsHtml = activeTerms.length
    ? `<div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${activeTerms.map(t => `
          <button data-loc-term="${esc(t.id)}"
            style="font-size:9px;font-weight:600;padding:2px 10px;border-radius:10px;
                   background:${_locationFilter === t.id ? '#dbeafe' : '#f3f4f6'};
                   color:${_locationFilter === t.id ? '#1d4ed8' : '#374151'};
                   border:1px solid ${_locationFilter === t.id ? '#93c5fd' : '#e5e7eb'};
                   cursor:pointer;font-family:inherit;"
            title="Filter gene list to ${esc(t.label)} location">
            ${esc(t.label)}
          </button>`).join('')}
       </div>`
    : '';

  // --- Section label under pills ---
  const primarySource = source === 'lab_flag' ? 'ChlamAtlas' : source === 'user' ? 'Curated' : source === 'uniprot_go' ? 'GO (cellular component)' : 'UniProt';
  const pillGroupLabel = `<div style="font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#b0b0b0;margin:8px 0 4px;">${primarySource}</div>`;

  // Extra UniProt text pills only shown for lab_flag case (to acknowledge what UniProt says)
  const uniprotTextSection = (source === 'lab_flag' && textPillsHtml)
    ? `<div style="font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#d1d5db;margin:10px 0 4px;">UniProt (overridden)</div>
       <div style="opacity:0.5;">${textPillsHtml}</div>`
    : (source === 'uniprot_sl' && textPillsHtml)
    ? `<div style="font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#b0b0b0;margin:10px 0 4px;">UniProt text annotation</div>
       ${textPillsHtml}`
    : '';

  el.innerHTML = `
    ${sectionHead('Cell Localization', sourceBadge)}
    <div style="padding:6px 12px 12px;">
      <div id="swissbiopics-svg" style="max-width:100%;min-height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <div style="font-size:9px;color:#aaa;">Loading diagram…</div>
      </div>
      ${primaryPillsHtml ? pillGroupLabel + primaryPillsHtml : ''}
      ${uniprotTextSection}
    </div>`;

  // Wire pill clicks → location filter
  el.querySelectorAll('[data-loc-term]').forEach(btn => {
    btn.addEventListener('click', () => {
      const term = btn.dataset.locTerm;
      _locationFilter = (_locationFilter === term) ? null : term;
      if (_locationFilter) _expandedSections.location = true;
      renderFilterBar(_container, true);
      fetchGenes(_container, true);
      // Update pill highlight in place without re-rendering full localization
      el.querySelectorAll('[data-loc-term]').forEach(b => {
        const active = _locationFilter === b.dataset.locTerm;
        b.style.background   = active ? '#dbeafe' : '#f3f4f6';
        b.style.color        = active ? '#1d4ed8' : '#374151';
        b.style.borderColor  = active ? '#93c5fd' : '#e5e7eb';
      });
    });
  });

  // Load SwissBioPics SVG
  if (diagramUrl) {
    const svgContainer = el.querySelector('#swissbiopics-svg');
    fetch(diagramUrl)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
      .then(svg => {
        // Strip width/height only from the root <svg> tag (not child elements like rect)
        const responsive = svg
          .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, '$1')
          .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, '$1')
          .replace('<svg', '<svg style="width:100%;height:auto;display:block;overflow:hidden;"');
        svgContainer.innerHTML = responsive;
      })
      .catch(() => {
        svgContainer.innerHTML = '<div style="font-size:9px;color:#aaa;font-style:italic;padding:8px 0;">Diagram unavailable</div>';
      });
  }
}

// Parses the UniProt localization free-text field into non-clickable display pills
function buildLocTextPills(localization) {
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
    <div style="display:flex;gap:5px;flex-wrap:wrap;">
      ${tags.map(t => `<span style="font-size:9px;font-weight:500;padding:2px 8px;border-radius:10px;background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;">${esc(t)}</span>`).join('')}
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
        _expandedSections.function = true;
      } else {
        _filters[filterType] = true;
        _expandedSections.characterization = true;
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

  const favs   = loadFavorites(GENE_FAVORITES_KEY);
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
        ${state.user ? `
        <button id="detail-edit-btn"
          style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:0;flex-shrink:0;padding-top:2px;margin-left:2px;"
          title="Edit gene">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H2v-3L11.5 2.5z"/></svg>
        </button>` : ''}
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
    <div style="background:white;min-width:0;overflow-x:clip;width:100%;box-sizing:border-box;">
      ${heroHtml}
      <!-- 2-col: Gene Info + Orthologs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div id="d-gene-info" style="border-right:1px solid #f0f0f0;min-width:0;overflow:hidden;"></div>
        <div id="d-orthologs" style="min-width:0;overflow:hidden;">${detailSkeleton(3)}</div>
      </div>
      <!-- Genomic Context -->
      <div id="d-gene-map" style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(2)}</div>
      <!-- Protein + Transcriptomics + EB/RB (left 2/3) + Cell Localization (right 1/3, full height) -->
      <div style="display:grid;grid-template-columns:2fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div style="display:flex;flex-direction:column;border-right:1px solid #f0f0f0;min-width:0;overflow:hidden;">
          <div id="d-protein" style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(4)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;flex:1;">
            <div id="d-transcriptomics" style="border-right:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(3)}</div>
            <div id="d-proteomics" style="min-width:0;overflow:hidden;">${detailSkeleton(2)}</div>
          </div>
        </div>
        <div id="d-localization" style="min-width:0;overflow:hidden;"></div>
      </div>
      <!-- Structure + Protein Interactions -->
      <div style="display:grid;grid-template-columns:2fr 1fr;border-bottom:1px solid #f0f0f0;">
        <div id="d-structure" style="border-right:1px solid #f0f0f0;min-width:0;overflow:hidden;">${detailSkeleton(3)}</div>
        <div id="d-interactions" style="min-width:0;overflow:hidden;">
          <div style="padding:14px 16px;">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:10px;">Protein Interactions</div>
            <div style="font-size:10px;color:#bbb;font-style:italic;">Coming soon</div>
          </div>
        </div>
      </div>
      <!-- Mutants (full width) -->
      <div style="border-bottom:1px solid #f0f0f0;min-width:0;overflow:hidden;">
        <div style="padding:14px 16px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1a6b4a;margin-bottom:10px;">Mutants</div>
          <div style="font-size:10px;color:#bbb;font-style:italic;">Coming soon</div>
        </div>
      </div>
    </div>`;

  // Wire favorite button in detail panel
  detail.querySelector('#detail-fav-btn').addEventListener('click', e => {
    const id    = e.currentTarget.dataset.id;
    const nowFav = toggleFavorite(id, GENE_FAVORITES_KEY);
    e.currentTarget.textContent = nowFav ? '★' : '☆';
    e.currentTarget.style.color  = nowFav ? '#f59e0b' : '#d1d5db';
    // Sync star in list panel
    const listBtn = container.querySelector(`.fav-btn[data-id="${id}"]`);
    if (listBtn) {
      listBtn.textContent = nowFav ? '★' : '☆';
      listBtn.style.color  = nowFav ? '#f59e0b' : '#e5e7eb';
    }
  });

  // Wire edit button
  detail.querySelector('#detail-edit-btn')?.addEventListener('click', () => {
    openGeneEditModal(gene, null, detail, container);
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

const CATEGORY_OPTIONS = Object.keys(CATEGORY_COLORS);

const LOC_OPTIONS = [
  { id: '',        label: '— not set —' },
  { id: 'SL-0086', label: 'Cytoplasm' },
  { id: 'SL-0037', label: 'Cell inner membrane' },
  { id: 'SL-0040', label: 'Cell outer membrane' },
  { id: 'SL-0200', label: 'Membrane' },
  { id: 'SL-0187', label: 'Periplasm' },
  { id: 'SL-0204', label: 'Secreted' },
  { id: 'SL-0310', label: 'Cell surface' },
  { id: 'SL-0122', label: 'Host cell membrane' },
  { id: 'SL-0478', label: 'Host cytoplasm' },
];

// ─── Gene Edit Modal ──────────────────────────────────────────────────────────

async function openGeneEditModal(gene, proteinArg, detail, container) {
  // Remove any stale modal
  document.getElementById('gene-edit-overlay')?.remove();

  // Fetch protein if not provided
  let protein = proteinArg;
  if (!protein && gene.id) {
    const { data } = await sb
      .from('proteins')
      .select('*')
      .eq('gene_id', gene.id)
      .maybeSingle();
    protein = data;
  }

  // Fetch existing PDB entries for this protein
  let pdbRows = [];
  if (protein?.id) {
    const { data } = await sb
      .from('alphafold_results')
      .select('id,top_homolog_pdb_id,top_homolog_description,homology_score')
      .eq('protein_id', protein.id)
      .eq('af_version', 'PDB');
    pdbRows = data ?? [];
  }

  const overlay = document.createElement('div');
  overlay.id = 'gene-edit-overlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;',
    'display:flex;align-items:center;justify-content:center;padding:16px;',
  ].join('');

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', onEsc);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  overlay.innerHTML = buildModalHtml(gene, protein, pdbRows);
  document.body.appendChild(overlay);

  overlay._onEsc = onEsc;

  wireModalEvents(overlay, gene, protein, pdbRows, closeModal, detail, container);
}

function buildModalHtml(gene, protein, pdbRows) {
  const curLoc = protein?.subcellular_location_sl?.[0] ?? '';
  const catOpts = `<option value="" ${!gene.functional_category ? 'selected' : ''}>— not set —</option>` +
    CATEGORY_OPTIONS.map(c =>
      `<option value="${esc(c)}" ${gene.functional_category === c ? 'selected' : ''}>${esc(c)}</option>`
    ).join('');
  const locOpts = LOC_OPTIONS.map(o =>
    `<option value="${esc(o.id)}" ${curLoc === o.id ? 'selected' : ''}>${esc(o.label)}</option>`
  ).join('');

  const field = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <input name="${name}" value="${esc(value ?? '')}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
      <div id="gem-err-${name}" style="font-size:10px;color:#dc2626;margin-top:2px;display:none;"></div>
    </div>`;

  const checkEl = (label, name, checked) =>
    `<label style="display:flex;align-items:center;gap:5px;background:#f8fafc;
      border:1.5px solid #e2e8f0;border-radius:6px;padding:5px 9px;cursor:pointer;
      font-size:11px;color:#374151;">
      <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}
    </label>`;

  return `<div id="gene-edit-modal" style="background:white;border-radius:14px;
    box-shadow:0 12px 40px rgba(0,0,0,0.25);width:420px;max-width:100%;
    font-size:12px;overflow:hidden;">

    <!-- Header -->
    <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;
      display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:14px;font-weight:700;color:#111;">Edit Gene</div>
        <div style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:1px;">
          ${esc(gene.locus_tag)} · ${esc(gene.strains?.common_name ?? '')}
        </div>
      </div>
      <button id="gem-close" style="font-size:18px;color:#d1d5db;background:none;
        border:none;cursor:pointer;line-height:1;padding:0;">✕</button>
    </div>

    <!-- Body -->
    <div id="gem-body" style="padding:14px 18px;max-height:70vh;overflow-y:auto;">

      <!-- Gene name + symbol -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:10px;margin-bottom:10px;">
        ${field('Gene Name', 'gene_name', gene.gene_name)}
        ${field('Symbol', 'gene_symbol', gene.gene_symbol, 'style="font-family:\'DM Mono\',monospace;"')}
      </div>

      <!-- Product -->
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Product Description</label>
        <textarea name="product" rows="2"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:11.5px;color:#111;box-sizing:border-box;resize:vertical;">${esc(gene.product ?? '')}</textarea>
      </div>

      <!-- Functional category -->
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Functional Category</label>
        <select name="functional_category"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:12px;color:#111;background:white;">
          ${catOpts}
        </select>
      </div>

      <!-- Flags -->
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:6px;">Properties</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${checkEl('Hypothetical', 'is_hypothetical', gene.is_hypothetical)}
          ${checkEl('Membrane',     'is_membrane_protein', gene.is_membrane_protein)}
          ${checkEl('T3 Secreted',  'is_t3_secreted', gene.is_t3_secreted)}
          ${checkEl('DNA Binding',  'is_dna_binding', gene.is_dna_binding)}
        </div>
      </div>

      <!-- Localization -->
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">
          Localization
          <span style="font-weight:400;color:#94a3b8;">(lab-curated)</span>
        </label>
        <select name="localization_sl"
          style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
          font-size:12px;color:#111;background:white;">
          ${locOpts}
        </select>
      </div>

      <!-- Advanced expander placeholder (filled in Task 5) -->
      <div id="gem-advanced-wrap"></div>

      <!-- UniProt sync placeholder -->
      <div style="border:1.5px dashed #e2e8f0;border-radius:7px;padding:8px 10px;
        display:flex;align-items:center;gap:8px;background:#fafafa;margin-bottom:4px;">
        <div style="font-size:14px;">🔄</div>
        <div style="flex:1;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;">Sync with UniProt</div>
          <div style="font-size:9px;color:#cbd5e1;">Coming soon — refresh protein data from UniProt</div>
        </div>
        <button disabled style="background:#f1f5f9;border:1.5px solid #e2e8f0;border-radius:5px;
          padding:4px 9px;font-size:9px;color:#cbd5e1;cursor:not-allowed;">Sync</button>
      </div>

    </div>

    <!-- Error banner (hidden by default) -->
    <div id="gem-error-banner" style="display:none;margin:0 18px 8px;padding:8px 12px;
      background:#fef2f2;border:1px solid #fecaca;border-radius:7px;
      font-size:11px;color:#dc2626;line-height:1.4;"></div>

    <!-- Footer -->
    <div style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;background:#fafafa;">
      <button id="gem-cancel" style="flex:1;background:#f1f5f9;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:#64748b;cursor:pointer;font-weight:500;">Cancel</button>
      <button id="gem-save" style="flex:2;background:#111;border:none;border-radius:7px;
        padding:9px;font-size:12px;color:white;font-weight:600;cursor:pointer;">Save Changes</button>
    </div>
  </div>`;
}

function buildAdvancedHtml(protein, pdbRows) {
  const advField = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:8px;color:#64748b;font-weight:600;
        margin-bottom:3px;">${label}</label>
      <input name="${name}" value="${esc(String(value ?? ''))}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:5px;padding:5px 7px;
        font-size:11px;box-sizing:border-box;">
      <div id="gem-err-${name}" style="font-size:10px;color:#dc2626;margin-top:2px;display:none;"></div>
    </div>`;

  const pdbList = pdbRows.map(r => `
    <div class="gem-pdb-existing" data-pdb-id="${esc(r.id)}"
      style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:6px;
      padding:7px 9px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;">
        <div style="font-size:10px;font-weight:600;font-family:'DM Mono',monospace;color:#111;">
          ${esc(r.top_homolog_pdb_id ?? '')}
        </div>
        <div style="font-size:9px;color:#64748b;margin-top:1px;">
          ${esc(r.top_homolog_description ?? '')}
        </div>
      </div>
      <button class="gem-pdb-remove" data-row-id="${esc(r.id)}"
        style="font-size:9px;color:#94a3b8;background:none;border:none;cursor:pointer;
        padding:2px 4px;">remove</button>
    </div>`).join('');

  return `
    <div style="border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px;">
      <button id="gem-adv-toggle" type="button"
        style="width:100%;display:flex;align-items:center;justify-content:space-between;
        padding:8px 12px;background:#f8fafc;border:none;cursor:pointer;">
        <span style="font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#94a3b8;">Advanced Fields</span>
        <span id="gem-adv-arrow" style="font-size:10px;color:#cbd5e1;">▸</span>
      </button>
      <div id="gem-adv-body" style="display:none;padding:12px;border-top:1px solid #e2e8f0;">

        <div style="font-size:8px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#94a3b8;margin-bottom:8px;">Protein Identity</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          ${advField('UniProt ID', 'uniprot_id', protein?.uniprot_id, 'style="font-family:\'DM Mono\',monospace;"')}
          ${advField('Protein Family', 'protein_family', protein?.protein_family)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          ${advField('Subunit Structure', 'oligomeric_state', protein?.oligomeric_state)}
          ${advField('Mass (kDa)', 'mass_kd', protein?.mass_kd)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
          ${advField('TM Domains', 'transmembrane_domains', protein?.transmembrane_domains, 'type="number" min="0"')}
          <div>
            <label style="display:block;font-size:8px;color:#64748b;font-weight:600;margin-bottom:5px;">
              Signal Peptide
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;margin-top:5px;">
              <input type="checkbox" name="signal_peptide" ${protein?.signal_peptide ? 'checked' : ''}> Yes
            </label>
          </div>
        </div>

        <!-- PDB structures -->
        <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
          <div style="font-size:8px;font-weight:700;text-transform:uppercase;
            letter-spacing:.05em;color:#94a3b8;margin-bottom:8px;">Crystal / PDB Structures</div>
          <div id="gem-pdb-list">${pdbList || '<div style="font-size:10px;color:#bbb;margin-bottom:6px;">No PDB entries on record.</div>'}</div>
          <!-- Add new PDB -->
          <div style="border:1.5px dashed #c7d2fe;border-radius:6px;padding:8px 9px;background:#fafffe;">
            <div style="font-size:8px;font-weight:700;text-transform:uppercase;
              letter-spacing:.05em;color:#6366f1;margin-bottom:5px;">Add New PDB Entry</div>
            <div style="display:flex;gap:6px;align-items:center;">
              <input id="gem-pdb-input" placeholder="e.g. 5YKG"
                style="flex:1;border:1.5px solid #c7d2fe;border-radius:5px;padding:5px 7px;
                font-size:11px;font-family:'DM Mono',monospace;box-sizing:border-box;text-transform:uppercase;">
              <button id="gem-pdb-lookup" type="button"
                style="background:#6366f1;border:none;border-radius:5px;padding:5px 10px;
                font-size:9px;color:white;font-weight:600;white-space:nowrap;cursor:pointer;">
                Look up ↗
              </button>
            </div>
            <div id="gem-pdb-error" style="font-size:10px;color:#dc2626;margin-top:4px;display:none;"></div>
            <div id="gem-pdb-result" style="display:none;margin-top:7px;"></div>
          </div>
        </div>
      </div>
    </div>`;
}

function wireModalEvents(overlay, gene, protein, pdbRows, closeModal, detail, container) {
  overlay.querySelector('#gem-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#gem-cancel')?.addEventListener('click', closeModal);

  // Inject advanced section
  const advWrap = overlay.querySelector('#gem-advanced-wrap');
  if (advWrap) advWrap.innerHTML = buildAdvancedHtml(protein, pdbRows);

  // Toggle advanced expander
  overlay.querySelector('#gem-adv-toggle')?.addEventListener('click', () => {
    const body  = overlay.querySelector('#gem-adv-body');
    const arrow = overlay.querySelector('#gem-adv-arrow');
    const open  = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    arrow.textContent  = open ? '▾' : '▸';
  });
}
