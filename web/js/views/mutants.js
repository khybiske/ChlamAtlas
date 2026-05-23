// ChlamAtlas — Mutants tab (full two-panel view)
import { sb, state, loadFavorites, toggleFavorite, MUTANT_FAVORITES_KEY } from '../client.js?v=74';

const COLLECTIONS = [
  { id: 'CT_L2',    label: 'C. trachomatis', icon: '/design/L2icon.jpg' },
  { id: 'CM',       label: 'C. muridarum',   icon: '/design/CMicon.jpg' },
  { id: 'Lucky17',  label: 'Lucky 17',        icon: '/design/L17icon.jpg' },
  { id: 'Chimeras', label: 'Chimeras',        icon: '/design/Chimeraicon.jpg' },
];

const TYPE_LABELS = { transposon: 'Transposon', chimera: 'Chimera', deletion: 'Deletion', chemical: 'Chemical', intron: 'Intron' };

const SORT_OPTIONS = [
  { field: 'locus_tag', asc: true, label: 'Locus tag' },
  { field: 'gene_name', asc: true, label: 'Gene name' },
  { field: 'mutant_id', asc: true, label: 'Mutant ID' },
];

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
  'Replication':                'Replication',
  'Secreted effector':          'Secreted effector',
  'Transcription':              'Transcription',
  'Translation':                'Translation',
  'Type III secretion':         'T3SS',
};

// Type filter options per collection (Lucky17 + Chimeras have no type dimension)
const COLLECTION_TYPES = {
  CT_L2:    ['transposon', 'deletion', 'intron', 'chemical'],
  CM:       ['transposon', 'deletion'],
  Lucky17:  [],
  Chimeras: [],
};

// Strain filter options per collection (value = DB common_name, label = display)
const COLLECTION_STRAINS = {
  CT_L2:    [{ value: 'CT-L2', label: 'CT L2/434' }, { value: 'CT-D', label: 'D/UW-3' }],
  CM:       [],
  Lucky17:  [],
  Chimeras: [{ value: 'CT-L2', label: 'CT L2/434' }, { value: 'CM', label: 'C. muridarum' }],
};

// Accent color per mutation type — drives hero gradient and type badge color
const TYPE_ACCENT = {
  transposon: { color: '#059669', heroBg: 'rgba(5,150,105,0.08)',   badgeBg: 'rgba(209,250,229,0.5)',  badgeText: '#059669', badgeBorder: 'rgba(5,150,105,0.35)'   },
  deletion:   { color: '#dc2626', heroBg: 'rgba(220,38,38,0.08)',   badgeBg: 'rgba(254,226,226,0.5)',  badgeText: '#dc2626', badgeBorder: 'rgba(220,38,38,0.3)'    },
  chimera:    { color: '#7c3aed', heroBg: 'rgba(124,58,237,0.08)',  badgeBg: 'rgba(237,233,254,0.5)',  badgeText: '#7c3aed', badgeBorder: 'rgba(124,58,237,0.3)'   },
  chemical:   { color: '#2563eb', heroBg: 'rgba(37,99,235,0.08)',   badgeBg: 'rgba(219,234,254,0.5)',  badgeText: '#2563eb', badgeBorder: 'rgba(37,99,235,0.3)'    },
  intron:     { color: '#ca8a04', heroBg: 'rgba(202,138,4,0.08)',   badgeBg: 'rgba(254,249,195,0.6)',  badgeText: '#ca8a04', badgeBorder: 'rgba(202,138,4,0.35)'   },
};
const DEFAULT_ACCENT = { color: '#6b7280', heroBg: 'rgba(107,114,128,0.06)', badgeBg: 'rgba(243,244,246,0.6)', badgeText: '#6b7280', badgeBorder: 'rgba(107,114,128,0.3)' };
const FUNC_CLASSES = ['Hypothetical', 'Inc protein', 'T3 secreted', 'Characterized'];

// Functional category fill colors — matches Genomes tab exactly
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

// Section header matching gene detail sectionHead() pattern.
// rightContent: optional HTML rendered right-aligned (e.g. LAB_PILL).
function mutSectionHead(label, rightContent = '') {
  return `
    <div style="display:flex;align-items:center;padding:10px 16px 8px;border-bottom:1px solid #f5f5f5;">
      <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#1a6b4a;">${label}</span>
      ${rightContent ? `<span style="margin-left:auto;">${rightContent}</span>` : ''}
    </div>`;
}

const LAB_PILL = `<span class="mut-lab-pill">🔒 Lab</span>`;

// Shared outline badge for the hero row.
function heroBadge(text, textColor, border, bg = 'rgba(255,255,255,0.75)') {
  return `<span style="display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:10px;background:${bg};color:${textColor};border:1px solid ${border};">${text}</span>`;
}

// Functional category pill for gene lists — colored by category using existing CATEGORY_COLORS map.
const LIGHT_CATS = new Set(['#FFF100','#EBEBEB','#BED630','#F497AE','#AAAAAA']);
function funcCategoryPill(category) {
  if (!category) return '';
  const bg   = CATEGORY_COLORS[category] ?? CATEGORY_COLOR_DEFAULT;
  const text = LIGHT_CATS.has(bg) ? '#555' : '#fff';
  return `<span style="display:inline-block;font-size:0.5rem;font-weight:600;padding:1px 5px;border-radius:4px;background:${bg};color:${text};white-space:nowrap;flex-shrink:0;">${category}</span>`;
}

// Module state
let _collection       = 'CT_L2';
let _sortField        = 'locus_tag';
let _sortAsc          = true;
let _total            = 0;
let _searchTerm       = '';
let _selectedId       = null;
let _container        = null;
let _searchTimer      = null;
let _filters          = { favorites: false, type: null, strain: null, category: null };
let _moreOpen         = false;
let _expandedSections = { type: false, strain: false, function: false };
let _geneDataMap      = new Map();

// ─── Entry point ──────────────────────────────────────────

export function renderMutants(container) {
  _container = container;
  _collection = window.__mutantCollection ?? 'CT_L2';
  _sortField = 'locus_tag';
  _sortAsc = true;
  _total = 0;
  _searchTerm = '';
  _selectedId = null;
  _filters = { favorites: false, type: null, strain: null, category: null };
  _moreOpen = false;
  _expandedSections = { type: false, strain: false, function: false };
  _geneDataMap = new Map();

  const col = COLLECTIONS.find(c => c.id === _collection) ?? COLLECTIONS[0];
  const isMobile = window.innerWidth < 768;
  const panelHeight = `calc(100vh - ${isMobile ? 112 : 56}px)`;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:300px 1fr;height:${panelHeight};overflow:hidden;" id="mut-panels">

      <!-- LEFT PANEL -->
      <div class="mut-list-panel" id="mut-left">

        <!-- Collection strip -->
        <div class="mut-strip">
          <img class="mut-strip-icon" src="${col.icon}" alt="">
          <div style="flex:1;min-width:0;">
            <div class="mut-strip-name">${col.label}</div>
            <div class="mut-strip-count" id="strip-count">Loading…</div>
          </div>
          <button class="mut-switch-btn" id="mut-switch-btn">Switch ▾</button>
        </div>

        <!-- Search -->
        <div style="padding:6px 10px;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
          <input id="mut-search" type="search" placeholder="Search mutants…"
            style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;
                   font-size:12px;outline:none;background:#f9fafb;" />
        </div>

        <!-- Filter bar (sort, favorites, more) -->
        <div id="filter-bar" style="flex-shrink:0;"></div>

        <!-- List -->
        <div id="mut-list" style="flex:1;overflow-y:auto;"></div>
      </div>

      <!-- RIGHT PANEL -->
      <div class="mut-detail-panel" id="mut-right">
        <div class="mut-placeholder" id="mut-placeholder">
          <img class="mut-placeholder-icon" src="${col.icon}" alt="">
          <span>Select a mutant from the list</span>
        </div>
      </div>

    </div>`;

  // Mobile: stack panels
  if (isMobile) {
    document.getElementById('mut-panels').style.gridTemplateColumns = '1fr';
    document.getElementById('mut-panels').style.gridTemplateRows = '1fr';
  }

  wireControls();
  renderFilterBar();
  fetchList();
}

// ─── Controls wiring ──────────────────────────────────────

function wireControls() {
  document.getElementById('mut-switch-btn').addEventListener('click', (e) => {
    showCollectionDropdown(e.currentTarget);
  });
  document.getElementById('mut-search').addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _searchTerm = e.target.value.trim();
      fetchList();
    }, 300);
  });
}

function showCollectionDropdown(anchor) {
  const openPop = window.__openNavPopover;
  if (!openPop) return;

  openPop(anchor, `
    <div class="nav-popover-label">Collections</div>
    ${COLLECTIONS.map(c => `
      <button class="nav-popover-row" data-collection="${c.id}">
        <img style="width:22px;height:22px;border-radius:50%;object-fit:cover;" src="${c.icon}" alt="">
        <span class="nav-popover-row-name">${c.label}</span>
      </button>`).join('')}
  `, 'mut-coll-popover');

  const pop = document.getElementById('mut-coll-popover');
  pop?.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      _collection = btn.dataset.collection;
      window.__mutantCollection = _collection;
      pop.remove();
      _selectedId = null;
      renderMutants(_container);
    });
  });
}

// ─── Filter bar ───────────────────────────────────────────

function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;

  const sortLabel    = SORT_OPTIONS.find(o => o.field === _sortField)?.label ?? 'Locus tag';
  const typeOptions  = COLLECTION_TYPES[_collection]   ?? [];
  const strainOpts   = COLLECTION_STRAINS[_collection] ?? [];
  const funcOptions  = Object.entries(FUNC_LABELS).map(([cat, label]) => ({ value: cat, label }));
  const hasMore      = typeOptions.length > 0 || strainOpts.length > 0 || funcOptions.length > 0;
  const secOpen      = { ..._expandedSections };
  const strainObj    = strainOpts.find(s => s.value === _filters.strain);
  const catLabel     = _filters.category ? (FUNC_LABELS[_filters.category] ?? _filters.category) : null;
  const typelabel    = _filters.type ? (TYPE_LABELS[_filters.type] ?? _filters.type) : null;

  const chip = (id, label, active) => `
    <button data-filter="${id}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${active ? '#bbf7d0' : '#e5e7eb'};
             background:${active ? '#f0fdf4' : 'white'};color:${active ? '#16a34a' : '#9ca3af'};">
      ${label}${active ? ' ×' : ''}
    </button>`;

  const typeChip = v => {
    const a = _filters.type === v;
    return `<button data-type-filter="${v}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
      ${TYPE_LABELS[v] ?? v}${a ? ' ×' : ''}
    </button>`;
  };

  const strainChip = s => {
    const a = _filters.strain === s.value;
    return `<button data-strain-filter="${s.value}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
      ${s.label}${a ? ' ×' : ''}
    </button>`;
  };

  const catChip = (value, label) => {
    const a = _filters.category === value;
    return `<button data-cat-filter="${value}"
      style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#fde68a' : '#e5e7eb'};background:${a ? '#fefce8' : 'white'};color:${a ? '#92400e' : '#9ca3af'};">
      ${a ? '⚙️ ' : ''}${label}${a ? ' ×' : ''}
    </button>`;
  };

  const groupHead = (id, icon, label, isOpen) => `
    <button data-section="${id}"
      style="display:flex;align-items:center;gap:4px;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
             color:#888;width:100%;margin-top:6px;border-top:1px solid #efefef;padding-top:7px;
             padding-bottom:${isOpen ? '4px' : '2px'};background:none;border-left:none;border-right:none;border-bottom:none;
             cursor:pointer;text-align:left;font-family:inherit;">
      ${icon ? `<span>${icon}</span>` : ''}<span>${label}</span>
      <span style="margin-left:auto;font-size:9px;color:#ccc;">${isOpen ? '▾' : '▸'}</span>
    </button>`;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;">
      <div style="position:relative;">
        <button id="mut-sort-btn"
          style="font-size:11px;font-weight:500;color:#555;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit;">
          ⇅ ${sortLabel}
        </button>
        <div id="mut-sort-drop" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:120px;overflow:hidden;">
          ${SORT_OPTIONS.map(o => `
            <button data-sort-field="${o.field}"
              style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:11.5px;border:none;cursor:pointer;font-family:inherit;
                     font-weight:${o.field === _sortField ? '600' : '400'};
                     color:${o.field === _sortField ? '#16a34a' : '#333'};
                     background:${o.field === _sortField ? '#f0fdf4' : 'none'};">
              ${o.label}
            </button>`).join('')}
        </div>
      </div>
      ${chip('favorites', '★ Favorites', _filters.favorites)}
      ${typelabel   ? `<button data-clear-type     style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-family:inherit;">${typelabel} ×</button>`  : ''}
      ${strainObj   ? `<button data-clear-strain   style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;font-family:inherit;">${strainObj.label} ×</button>` : ''}
      ${catLabel    ? `<button data-clear-category style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #fde68a;background:#fefce8;color:#92400e;cursor:pointer;white-space:nowrap;font-family:inherit;">⚙️ ${catLabel} ×</button>` : ''}
      ${hasMore ? `<button id="mut-more-btn"
        style="font-size:10.5px;font-weight:600;cursor:pointer;margin-left:auto;font-family:inherit;
               color:${_moreOpen ? '#16a34a' : '#9ca3af'};background:white;
               border:1px solid ${_moreOpen ? '#bbf7d0' : '#e5e7eb'};border-radius:6px;padding:3px 9px;">
        ${_moreOpen ? '− Less' : '+ More'}
      </button>` : ''}
    </div>
    <div id="mut-more-panel" style="display:${_moreOpen ? 'block' : 'none'};padding:4px 12px 8px;background:#fafafa;border-bottom:1px solid #f0f0f0;overflow-y:auto;max-height:40vh;">
      ${typeOptions.length ? `
        ${groupHead('type', '', 'Type', secOpen.type)}
        <div style="display:${secOpen.type ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
          ${typeOptions.map(t => typeChip(t)).join('')}
        </div>` : ''}
      ${strainOpts.length ? `
        ${groupHead('strain', '', 'Strain', secOpen.strain)}
        <div style="display:${secOpen.strain ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
          ${strainOpts.map(s => strainChip(s)).join('')}
        </div>` : ''}
      ${groupHead('function', '⚙️', 'Function', secOpen.function)}
      <div style="display:${secOpen.function ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${funcOptions.map(f => catChip(f.value, f.label)).join('')}
      </div>
    </div>
  `;

  // Sort dropdown
  const sortBtn  = bar.querySelector('#mut-sort-btn');
  const sortDrop = bar.querySelector('#mut-sort-drop');
  sortBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = sortDrop.style.display === 'none';
    sortDrop.style.display = open ? 'block' : 'none';
    if (open) setTimeout(() => document.addEventListener('click', () => { sortDrop.style.display = 'none'; }, { once: true }), 0);
  });
  bar.querySelectorAll('[data-sort-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      _sortField = btn.dataset.sortField;
      sortDrop.style.display = 'none';
      renderFilterBar();
      fetchList();
    });
  });

  // Favorites chip
  bar.querySelector('[data-filter="favorites"]')?.addEventListener('click', () => {
    _filters.favorites = !_filters.favorites;
    renderFilterBar();
    fetchList();
  });

  // Active filter clear buttons
  bar.querySelector('[data-clear-type]')?.addEventListener('click', ()     => { _filters.type = null;     renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-strain]')?.addEventListener('click', ()   => { _filters.strain = null;   renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-category]')?.addEventListener('click', () => { _filters.category = null; renderFilterBar(); fetchList(); });

  // More/Less toggle
  bar.querySelector('#mut-more-btn')?.addEventListener('click', () => {
    _moreOpen = !_moreOpen;
    renderFilterBar();
  });

  // Section expand/collapse
  bar.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.section;
      if (id in _expandedSections) _expandedSections[id] = !_expandedSections[id];
      renderFilterBar();
    });
  });

  // Type filter chips
  bar.querySelectorAll('[data-type-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.typeFilter;
      _filters.type = _filters.type === val ? null : val;
      renderFilterBar();
      fetchList();
    });
  });

  // Strain filter chips
  bar.querySelectorAll('[data-strain-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.strainFilter;
      _filters.strain = _filters.strain === val ? null : val;
      renderFilterBar();
      fetchList();
    });
  });

  // Category filter chips
  bar.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.catFilter;
      _filters.category = _filters.category === val ? null : val;
      renderFilterBar();
      fetchList();
    });
  });
}

// ─── Fetch + render list ──────────────────────────────────

async function fetchList() {
  const listEl = document.getElementById('mut-list');
  if (!listEl) return;
  listEl.innerHTML = skeletonRows(8);

  // Fetch all records for this collection (no server-side sort — we sort client-side)
  let query = sb
    .from('mutants')
    .select('id,mutant_id,name,mutation_type,is_published,target_gene_ids,strains!background_strain_id(common_name)')
    .eq('collection', _collection)
    .limit(1000);

  if (_searchTerm) query = query.or(`mutant_id.ilike.%${_searchTerm}%,name.ilike.%${_searchTerm}%`);

  const { data: rows, error } = await query;

  if (error) {
    listEl.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:0.8125rem;">${error.message}</div>`;
    return;
  }
  if (!rows?.length) {
    listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:0.875rem;">No mutants found.</div>`;
    return;
  }

  // Bulk-fetch gene data (locus_tag, gene_name, functional_category) for all target genes
  const allGeneIds = [...new Set(rows.flatMap(m => m.target_gene_ids ?? []))];
  _geneDataMap = new Map();
  if (allGeneIds.length) {
    const { data: geneData } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,functional_category')
      .in('id', allGeneIds);
    (geneData ?? []).forEach(g => _geneDataMap.set(g.id, g));
  }

  // Client-side filters
  let displayRows = rows;

  if (_filters.favorites) {
    const favs = loadFavorites(MUTANT_FAVORITES_KEY);
    displayRows = displayRows.filter(m => favs.has(String(m.id)));
  }
  if (_filters.type) {
    displayRows = displayRows.filter(m => m.mutation_type === _filters.type);
  }
  if (_filters.strain) {
    displayRows = displayRows.filter(m => m.strains?.common_name === _filters.strain);
  }
  if (_filters.category) {
    displayRows = displayRows.filter(m =>
      (m.target_gene_ids ?? []).some(id => _geneDataMap.get(id)?.functional_category === _filters.category)
    );
  }

  // Update count display (after filters)
  _total = displayRows.length;
  const countEl = document.getElementById('strip-count');
  if (countEl) countEl.textContent = `${_total.toLocaleString()} mutant${_total !== 1 ? 's' : ''}`;

  if (!displayRows.length) {
    listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:0.875rem;">No mutants found.</div>`;
    return;
  }

  // Client-side sort
  const getFirstLocusTag = m => {
    const ids = m.target_gene_ids ?? [];
    const tags = ids.map(id => _geneDataMap.get(id)?.locus_tag).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return tags[0] ?? '￿';
  };
  const getFirstGeneName = m => {
    const ids = m.target_gene_ids ?? [];
    const names = ids.map(id => _geneDataMap.get(id)?.gene_name).filter(Boolean).sort();
    return names[0] ?? '￿';
  };

  displayRows = [...displayRows].sort((a, b) => {
    let va, vb;
    if (_sortField === 'locus_tag') {
      va = getFirstLocusTag(a); vb = getFirstLocusTag(b);
    } else if (_sortField === 'gene_name') {
      va = getFirstGeneName(a); vb = getFirstGeneName(b);
    } else {
      va = a.mutant_id ?? ''; vb = b.mutant_id ?? '';
    }
    const cmp = va.localeCompare(vb, undefined, { numeric: true });
    return _sortAsc ? cmp : -cmp;
  });

  // Build locus-tag strings from _geneDataMap and render rows
  listEl.innerHTML = displayRows.map(m => {
    const tagMap = new Map([..._geneDataMap].map(([id, g]) => [id, g.locus_tag]));
    return mutantRowHTML(m, formatLocusTags(m.target_gene_ids, tagMap));
  }).join('');

  listEl.querySelectorAll('.mut-row').forEach(row => {
    row.addEventListener('click', () => {
      document.querySelectorAll('.mut-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      _selectedId = row.dataset.id;
      loadDetail(row.dataset.id);
    });
  });

  // Auto-select first row on initial load
  if (!_selectedId && displayRows.length) {
    const first = listEl.querySelector('.mut-row');
    if (first) { first.classList.add('selected'); _selectedId = first.dataset.id; loadDetail(first.dataset.id); }
  } else if (_selectedId) {
    const sel = listEl.querySelector(`[data-id="${_selectedId}"]`);
    if (sel) sel.classList.add('selected');
  }
}

function mutantRowHTML(m, locusTagStr = '') {
  const displayName = m.name || m.mutant_id;
  const showId = m.name ? `<div class="mut-row-id">${m.mutant_id}</div>` : '';
  const locusLabel = locusTagStr
    ? `<div style="font-size:0.625rem;font-family:'DM Mono',ui-monospace,monospace;color:#9ca3af;margin-top:1px;">${locusTagStr}</div>`
    : '';
  const labPill = !m.is_published
    ? `<span class="mut-lab-pill" style="margin-left:auto;flex-shrink:0;">🔒 Lab</span>`
    : '';
  return `
    <button class="mut-row" data-id="${m.id}">
      <div style="flex:1;min-width:0;">
        ${showId}
        <div class="mut-row-name">${displayName}</div>
        ${locusLabel}
      </div>
      ${labPill}
    </button>`;
}


// ─── Detail panel ─────────────────────────────────────────

async function loadDetail(mutantUUID) {
  const rightEl = document.getElementById('mut-right');
  if (!rightEl) return;
  rightEl.innerHTML = `<div style="padding:1.25rem;">${skeletonRows(5)}</div>`;

  // Parallel: main mutant record + pipeline + phenotypes
  const [mutantRes, pipeRes, phenoRes] = await Promise.all([
    sb.from('mutants')
      .select(`id,mutant_id,name,mutation_type,mutation_method,plasmid_used,marker,
               creator_name,is_published,notes,target_gene_ids,
               strains!background_strain_id(common_name,species)`)
      .eq('id', mutantUUID)
      .single(),
    sb.from('mutant_pipeline')
      .select('*')
      .eq('mutant_id', mutantUUID)
      .maybeSingle(),
    sb.from('mutant_phenotypes')
      .select('*')
      .eq('mutant_id', mutantUUID),
  ]);

  const m = mutantRes.data;
  if (!m) {
    const msg = mutantRes.error?.message ?? 'Unknown error';
    rightEl.innerHTML = `<div style="padding:1.5rem;color:#ef4444;font-size:0.875rem;">Failed to load mutant: ${msg}</div>`;
    return;
  }

  const pipe = pipeRes.data ?? null;
  const phenos = phenoRes.data ?? [];
  const isLabMember = state.userRole === 'lab_member' || state.userRole === 'admin';

  // Resolve target genes (with sort_index + strain_id for the locus map)
  let genes = [];
  let neighborhood = [];
  if (m.target_gene_ids?.length) {
    const { data: geneData } = await sb
      .from('genes')
      .select(`id,locus_tag,gene_name,product,functional_category,is_characterized,sort_index,strain_id,
               proteins(id,localization,
                 alphafold_results(thumbnail_path))`)
      .in('id', m.target_gene_ids);
    genes = (geneData ?? []).sort((a, b) => (a.locus_tag ?? '').localeCompare(b.locus_tag ?? ''));

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
  }

  const isMobile = window.innerWidth < 768;

  rightEl.innerHTML = `
    ${isMobile ? `<div class="mut-mobile-back"><button class="back-btn" id="mut-back-btn">‹ Back</button></div>` : ''}

    ${heroHTML(m, genes)}
    ${geneCardsHTML(genes)}
    ${geneLociMapHTML(genes, neighborhood, m.mutation_type)}
    ${recombInfoHTML(m, pipe, isLabMember)}
    ${pipe || isLabMember ? pipelineHTML(pipe, isLabMember) : ''}
    ${phenoHTML(phenos)}
    ${isLabMember && pipe ? stocksHTML(pipe) : ''}
    <div style="height:2rem;"></div>
  `;

  if (isMobile) {
    document.getElementById('mut-back-btn')?.addEventListener('click', () => {
      rightEl.style.display = 'none';
      document.getElementById('mut-left').style.display = '';
    });
  }

  // Wire "View in Genomes →" buttons
  rightEl.querySelectorAll('[data-gene-nav]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const geneId = btn.dataset.geneNav;
      window.__geneDetailId = geneId;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
    });
  });

  // Edit button — placeholder until edit modal is built
  rightEl.querySelector('#mut-edit-btn')?.addEventListener('click', () => {});

  // Wire favorites star
  rightEl.querySelector('#mut-fav-btn')?.addEventListener('click', e => {
    const id     = e.currentTarget.dataset.id;
    const nowFav = toggleFavorite(id, MUTANT_FAVORITES_KEY);
    e.currentTarget.style.color = nowFav ? '#f59e0b' : '#d1d5db';
    e.currentTarget.title       = nowFav ? 'Remove from favorites' : 'Add to favorites';
    e.currentTarget.textContent = nowFav ? '★' : '☆';
  });

}

// ─── Detail section builders ──────────────────────────────

function heroHTML(m, genes = []) {
  const displayName  = m.name || m.mutant_id;
  const hasName      = !!m.name;
  const accent       = TYPE_ACCENT[m.mutation_type] ?? DEFAULT_ACCENT;
  const strainLabel  = m.strains?.common_name ?? m.strains?.species ?? '';
  const typeLabel    = TYPE_LABELS[m.mutation_type] ?? m.mutation_type ?? '';
  const isFav        = loadFavorites(MUTANT_FAVORITES_KEY).has(String(m.id));
  const col          = COLLECTIONS.find(c => c.id === _collection);

  // Locus tag line derived from the resolved genes array
  const locusTagStr  = (() => {
    if (!genes.length) return '';
    const tags = genes.map(g => g.locus_tag).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!tags.length) return '';
    if (tags.length === 1) return tags[0];
    const nums = tags.map(t => parseInt(t.replace(/\D/g, ''), 10));
    const isRange = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    return isRange ? `${tags[0]}–${tags[tags.length - 1]}` : tags.join(', ');
  })();

  const pubBadge = m.is_published
    ? heroBadge('Published',   '#059669', 'rgba(5,150,105,0.3)')
    : heroBadge('Unpublished', '#b45309', 'rgba(180,83,9,0.3)');

  const pencilSvg = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H2v-3L11.5 2.5z"/></svg>`;
  const btnBase   = 'background:none;border:none;cursor:pointer;padding:0;flex-shrink:0;padding-top:2px;';

  const collIcon = col?.icon
    ? `<img src="${col.icon}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;box-shadow:0 1px 4px rgba(0,0,0,0.08);">`
    : '';

  return `
    <div style="padding:16px 20px 14px;border-bottom:3px solid ${accent.color};background:linear-gradient(150deg,${accent.heroBg} 0%,#ffffff 65%);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        ${collIcon}
        <div style="flex:1;min-width:0;">
          <div style="font-size:24px;font-weight:700;color:#111;line-height:1.1;">${displayName}</div>
          ${hasName ? `<div style="font-size:10px;font-family:'DM Mono',ui-monospace,monospace;color:#888;margin-top:2px;letter-spacing:0.02em;">${m.mutant_id}</div>` : ''}
          ${locusTagStr ? `<div style="font-size:10px;font-family:'DM Mono',ui-monospace,monospace;color:#aaa;margin-top:1px;letter-spacing:0.02em;">${locusTagStr}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;padding-top:2px;">
          <button id="mut-edit-btn" style="${btnBase}color:#9ca3af;" title="Edit">${pencilSvg}</button>
          <button id="mut-fav-btn" data-id="${m.id}"
            style="font-size:16px;${btnBase}color:${isFav ? '#f59e0b' : '#d1d5db'};"
            title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '★' : '☆'}</button>
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
        ${strainLabel ? heroBadge(strainLabel, '#16a34a', 'rgba(22,163,74,0.35)') : ''}
        ${typeLabel   ? heroBadge(typeLabel, accent.badgeText, accent.badgeBorder, accent.badgeBg) : ''}
        ${pubBadge}
      </div>
    </div>`;
}

function geneCardsHTML(genes) {
  if (!genes.length) return '';

  const title = `Target Gene${genes.length > 1 ? `s (${genes.length})` : ''}`;

  // 1–2 genes: full cards (side by side if 2)
  if (genes.length <= 2) {
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
            <button class="mut-gene-link" data-gene-nav="${g.id}">View in Genomes →</button>
          </div>
        </div>`;
    }).join('');

    return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead(title)}
    <div style="padding:10px 16px 14px;">
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">${cards}</div>
    </div>
  </div>`;
  }

  // 3+ genes: compact scrollable list
  const rows = genes.map(g => `
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid #f3f4f6;">
      <span class="mut-gene-tag" style="min-width:5.5rem;flex-shrink:0;">${g.locus_tag}</span>
      <div style="flex:1;min-width:0;display:flex;align-items:center;gap:0.375rem;overflow:hidden;">
        <span style="font-size:0.75rem;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.product ?? ''}</span>
        ${funcCategoryPill(g.functional_category)}
      </div>
      <button class="mut-gene-link" style="flex-shrink:0;font-size:0.6875rem;" data-gene-nav="${g.id}">→</button>
    </div>`).join('');

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead(title)}
    <div style="padding:10px 16px 14px;">
      <div style="max-height:12rem;overflow-y:auto;">${rows}</div>
    </div>
  </div>`;
}

// ─── Genomic locus map ────────────────────────────────────

function geneLociMapHTML(genes, neighborhood, mutationType) {
  if (!neighborhood.length) return '';

  const targetIds = new Set(genes.map(g => g.id));

  // Stroke color for target gene outline, by mutation type
  const typeStroke = {
    transposon: '#047857',
    deletion:   '#b91c1c',
    chemical:   '#6d28d9',
    chimera:    '#0e7490',
  };
  const hitStroke = typeStroke[mutationType] ?? typeStroke.deletion;

  // ── Layout constants ──────────────────────────────────────────────────
  const VB_W    = 600;
  const VB_H    = 94;
  const SPINE_Y = 46;
  const P_TOP   = 34; const P_BOT = 46;   // + strand row
  const N_TOP   = 48; const N_BOT = 60;   // − strand row (below spine)
  const TGT_PAD = 3;                       // target genes extend this far beyond normal row
  const TIP     = 9;
  const MIN_W   = 26;

  const hasStrand = neighborhood.some(g => g.strand);

  // Gene length helper: prefer real bp coords, fall back to aa * 3
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

  // Strand labels if we have strand data
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

    // Chevron points right for + strand, left for − strand
    const pts = isPlus
      ? `${x},${ktop} ${x + w - TIP},${ktop} ${x + w},${mid} ${x + w - TIP},${kbot} ${x},${kbot}`
      : `${x + w},${ktop} ${x + TIP},${ktop} ${x},${mid} ${x + TIP},${kbot} ${x + w},${kbot}`;

    const strokeEl = isTarget
      ? `<polygon points="${pts}" fill="none" stroke="${hitStroke}" stroke-width="1.5"/>`
      : '';

    const midX = x + w / 2;
    const isNamed = g.gene_name && g.gene_name !== g.locus_tag;
    // Density-aware stagger: narrow genes (< 35px) use 4 levels; wider use 2.
    // Both the above-axis and below-axis labels are staggered to prevent collision.
    const staggerLevels = w < 35 ? 4 : 2;
    const level         = idx % staggerLevels;
    const aboveStagger  = -(level * 8);   // 0, -8, -16, -24
    const belowStagger  =   level * 8;    // 0,  8,  16,  24
    const nameY  = isPlus ? ktop - 4 + aboveStagger : kbot + 9 + belowStagger;
    const locusY = isPlus ? kbot + 9 + belowStagger : ktop - 4 + aboveStagger;

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

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Chromosome Context')}
    <div style="padding:10px 16px 14px;">
      <div style="background:#fafafa;border:1px solid #efefef;border-radius:6px;padding:10px 10px 8px;overflow:hidden;">
        <svg viewBox="0 0 ${actualVbW} ${VB_H}" xmlns="http://www.w3.org/2000/svg"
             style="width:100%;height:auto;display:block;overflow:visible;">
          ${backbone}
          ${strandLabels}
          ${arrows}
        </svg>
      </div>
    </div>
  </div>`;
}

function recombInfoHTML(m, pipe, isLabMember) {
  const creator = m.creator_name || '—';
  const plasmid = m.plasmid_used || '—';
  const markers = m.marker?.join(', ') || '—';
  const method  = m.mutation_method ? m.mutation_method.replace(/_/g, ' ') : null;

  const leftCol = `
    <div style="display:flex;flex-direction:column;gap:0.625rem;">
      <div class="mut-info-row"><span class="mut-info-label">Creator</span><span class="mut-info-value">${creator}</span></div>
      <div class="mut-info-row"><span class="mut-info-label">Plasmid</span><span class="mut-info-value">${plasmid}</span></div>
      <div class="mut-info-row"><span class="mut-info-label">Marker</span><span class="mut-info-value">${markers}</span></div>
      ${method ? `<div class="mut-info-row"><span class="mut-info-label">Method</span><span class="mut-info-value">${method}</span></div>` : ''}
    </div>`;

  let rightCol = '';
  if (isLabMember && pipe) {
    const sequenced     = pipe.sequenced;
    const seqMethod     = pipe.genotyping_method || null;
    const genotypedDate = pipe.genotyped_date ? fmtDate(pipe.genotyped_date) : null;
    const seqText = sequenced === true ? '✓ WGS' : sequenced === false ? 'No' : '—';
    rightCol = `
      <div style="display:flex;flex-direction:column;gap:0.625rem;">
        <div class="mut-info-row"><span class="mut-info-label">Sequenced</span><span class="mut-info-value" style="${sequenced ? 'color:#16a34a;font-weight:600;' : ''}">${seqText}</span></div>
        ${seqMethod     ? `<div class="mut-info-row"><span class="mut-info-label">Seq method</span><span class="mut-info-value">${seqMethod}</span></div>` : ''}
        ${genotypedDate ? `<div class="mut-info-row"><span class="mut-info-label">Genotyped</span><span class="mut-info-value">${genotypedDate}</span></div>` : ''}
      </div>`;
  }

  const gridStyle    = rightCol ? 'class="mut-info-grid"' : 'style="display:block;"';
  const sectionLabel = `Recombinant Info${isLabMember && pipe ? ' &amp; Genotyping' : ''}`;
  const right        = isLabMember && pipe ? LAB_PILL : '';
  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead(sectionLabel, right)}
    <div style="padding:10px 16px 14px;">
      <div ${gridStyle}>${leftCol}${rightCol}</div>
    </div>
  </div>`;
}

function pipelineHTML(pipe, isLabMember) {
  if (!isLabMember) return '';
  if (!pipe) {
    return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Pipeline', LAB_PILL)}
    <div style="padding:10px 16px 14px;font-size:0.8125rem;color:#9ca3af;">No pipeline record.</div>
  </div>`;
  }

  const plasmidDone = !!pipe.transformed_date;

  const stages = [
    { label: 'Plasmid',   done: plasmidDone,             date: plasmidDone ? '✓' : null },
    { label: 'Transform', done: !!pipe.transformed_date,  date: fmtDate(pipe.transformed_date) },
    { label: 'Cloning',   done: !!pipe.plaque_cloned_date,date: fmtDate(pipe.plaque_cloned_date) },
    { label: 'Genotype',  done: !!pipe.genotyped_date,    date: fmtDate(pipe.genotyped_date) },
    { label: 'In vitro',  done: !!pipe.in_vitro_date,     date: fmtDate(pipe.in_vitro_date) },
    { label: 'In vivo',   done: !!pipe.in_vivo_date,      date: fmtDate(pipe.in_vivo_date) },
    { label: 'Sequenced', done: !!pipe.sequenced_date,    date: fmtDate(pipe.sequenced_date) },
  ];

  const bars = stages.map(s => `
    <div class="mut-stage">
      <div class="mut-stage-bar ${s.done ? 'done' : 'pending'}"></div>
      <div class="mut-stage-name ${s.done ? 'done' : 'pending'}">${s.label}</div>
      <div class="mut-stage-date">${s.date ?? '—'}</div>
    </div>`).join('');

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Pipeline', LAB_PILL)}
    <div style="padding:10px 16px 14px;">
      <div class="mut-pipeline">${bars}</div>
    </div>
  </div>`;
}

function phenoHTML(phenos) {
  const vitro = phenos.find(p => p.phenotype_type === 'in_vitro') ?? null;
  const vivo  = phenos.find(p => p.phenotype_type === 'in_vivo')  ?? null;

  const card = (label, p) => {
    if (!p) return `
      <div class="mut-pheno-card">
        <div class="mut-pheno-label">${label}</div>
        <div class="mut-pheno-status untested">Not yet tested</div>
      </div>`;

    const statusClass = p.has_phenotype === true ? 'positive' : p.has_phenotype === false ? 'none' : 'untested';
    const statusText  = p.has_phenotype === true ? '✓ Phenotype observed'
                      : p.has_phenotype === false ? 'No phenotype recorded'
                      : 'Not tested';
    const imgs = p.image_paths?.length
      ? `<div class="mut-pheno-imgs">${p.image_paths.map(u => `<img src="${u}" class="phenotype-img" alt="">`).join('')}</div>`
      : '';

    return `
      <div class="mut-pheno-card">
        <div class="mut-pheno-label">${label}</div>
        <div class="mut-pheno-status ${statusClass}">${statusText}</div>
        ${p.description ? `<div class="mut-pheno-desc">${p.description}</div>` : ''}
        ${imgs}
      </div>`;
  };

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Phenotypes')}
    <div style="padding:10px 16px 14px;">
      <div class="mut-pheno-grid">
        ${card('In vitro', vitro)}
        ${card('In vivo', vivo)}
      </div>
    </div>
  </div>`;
}

function stocksHTML(pipe) {
  const labs = [
    { key: 'stocks_uw_hybiske', name: 'UW Hybiske' },
    { key: 'stocks_uw_bob',     name: 'UW Bob' },
    { key: 'stocks_osu_rockey', name: 'OSU Rockey' },
    { key: 'stocks_ku_hefty',   name: 'KU Hefty' },
  ];
  const items = labs.map(l => `
    <div class="mut-stock-item">
      <div class="mut-stock-dot ${pipe[l.key] ? 'yes' : 'no'}"></div>
      <span class="mut-stock-name">${l.name}</span>
    </div>`).join('');

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Stocks', LAB_PILL)}
    <div style="padding:10px 16px 14px;">
      <div class="mut-stocks-grid">${items}</div>
    </div>
  </div>`;
}

// ─── Helpers ──────────────────────────────────────────────

// Returns a compact locus-tag label: single tag, range (CTL0370–CTL0374), or CSV.
function formatLocusTags(targetGeneIds, geneTagMap) {
  if (!targetGeneIds?.length) return '';
  const tags = targetGeneIds
    .map(id => geneTagMap.get(id))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!tags.length) return '';
  if (tags.length === 1) return tags[0];
  // Check if all numeric suffixes are consecutive
  const nums = tags.map(t => parseInt(t.replace(/\D/g, ''), 10));
  const isRange = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  return isRange ? `${tags[0]}–${tags[tags.length - 1]}` : tags.join(', ');
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <div style="display:flex;gap:0.75rem;padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6;">
      <div style="flex:1;display:flex;flex-direction:column;gap:0.375rem;">
        <div class="skeleton" style="height:0.625rem;width:4rem;border-radius:0.25rem;"></div>
        <div class="skeleton" style="height:0.75rem;width:8rem;border-radius:0.25rem;"></div>
      </div>
    </div>`).join('');
}
