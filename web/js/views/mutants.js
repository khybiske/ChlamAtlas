// ChlamAtlas — Mutants tab (full two-panel view)
import { sb, state, toggleFavoriteDB } from '../client.js?v=83';
import { isMobileViewport, pushMobileDetail, onMobScroll } from '../app.js?v=83';

const COLLECTIONS = [
  { id: 'CT_L2',    label: 'C. trachomatis', icon: '/design/icons_transparent/L2icon_transparent.png' },
  { id: 'CM',       label: 'C. muridarum',   icon: '/design/icons_transparent/CMicon_transparent.png' },
  { id: 'Lucky17',  label: 'Lucky 17',        icon: '/design/icons_transparent/L17icon_transparent.png' },
  { id: 'Chimeras', label: 'Chimeras',        icon: '/design/icons_transparent/Chimeraicon_transparent.png' },
];

const TYPE_LABELS = { transposon: 'Transposon', chimera: 'Chimera', deletion: 'Deletion', chemical: 'Chemical', intron: 'Intron', recombination: 'Recombination' };

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
  transposon:    { color: '#059669', heroBg: 'rgba(5,150,105,0.08)',   badgeBg: 'rgba(209,250,229,0.5)',  badgeText: '#059669', badgeBorder: 'rgba(5,150,105,0.35)'   },
  deletion:      { color: '#dc2626', heroBg: 'rgba(220,38,38,0.08)',   badgeBg: 'rgba(254,226,226,0.5)',  badgeText: '#dc2626', badgeBorder: 'rgba(220,38,38,0.3)'    },
  chimera:       { color: '#7c3aed', heroBg: 'rgba(124,58,237,0.08)',  badgeBg: 'rgba(237,233,254,0.5)',  badgeText: '#7c3aed', badgeBorder: 'rgba(124,58,237,0.3)'   },
  chemical:      { color: '#2563eb', heroBg: 'rgba(37,99,235,0.08)',   badgeBg: 'rgba(219,234,254,0.5)',  badgeText: '#2563eb', badgeBorder: 'rgba(37,99,235,0.3)'    },
  intron:        { color: '#ca8a04', heroBg: 'rgba(202,138,4,0.08)',   badgeBg: 'rgba(254,249,195,0.6)',  badgeText: '#ca8a04', badgeBorder: 'rgba(202,138,4,0.35)'   },
  recombination: { color: '#db2777', heroBg: 'rgba(219,39,119,0.08)',  badgeBg: 'rgba(252,231,243,0.5)',  badgeText: '#db2777', badgeBorder: 'rgba(219,39,119,0.3)'   },
};
const DEFAULT_ACCENT = { color: '#6b7280', heroBg: 'rgba(107,114,128,0.06)', badgeBg: 'rgba(243,244,246,0.6)', badgeText: '#6b7280', badgeBorder: 'rgba(107,114,128,0.3)' };
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

// Pipeline toggle icons — lab members only, shown in each mutant row
const PL_ICON_ON = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <circle cx="4" cy="12" r="3" fill="#7c3aed"/>
  <line x1="7" y1="12" x2="9" y2="12" stroke="#7c3aed" stroke-width="2"/>
  <circle cx="12" cy="12" r="3" fill="#7c3aed"/>
  <line x1="15" y1="12" x2="17" y2="12" stroke="#7c3aed" stroke-width="2"/>
  <circle cx="20" cy="12" r="3" fill="#7c3aed"/>
</svg>`;

const PL_ICON_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <circle cx="4" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
  <line x1="7" y1="12" x2="9" y2="12" stroke="#d1d5db" stroke-width="2"/>
  <circle cx="12" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
  <line x1="15" y1="12" x2="17" y2="12" stroke="#d1d5db" stroke-width="2"/>
  <circle cx="20" cy="12" r="3" fill="none" stroke="#d1d5db" stroke-width="2"/>
</svg>`;

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
let _filters          = { favorites: false, type: null, strain: null, category: null, published: null, creator: null, marker: null };
let _moreOpen         = false;
let _expandedSections = { type: false, strain: false, function: false, published: false, creator: false, marker: false };
let _geneDataMap      = new Map();
let _creatorOptions   = [];  // cached distinct creator_name values for current collection
let _markerOptions    = [];  // cached distinct marker values for current collection

// ─── Mobile mutant constants ──────────────────────────────
const MOB_TYPE = {
  deletion:      { color: '#C0392B', glyph: 'Δ',  glyphSize: 19 },
  transposon:    { color: '#059669', glyph: '::',  glyphSize: 15 },
  chimera:       { color: '#8466C4', glyph: '×',   glyphSize: 20 },
  chemical:      { color: '#2563eb', glyph: '•',   glyphSize: 22 },
  intron:        { color: '#ca8a04', glyph: '⟂',   glyphSize: 16 },
  recombination: { color: '#8466C4', glyph: '×',   glyphSize: 20 },
};
const MOB_TYPE_DEFAULT = { color: '#8b958f', glyph: '?', glyphSize: 16 };

const MOB_GRP_COLOR = {
  CT_L2:    '#2f9e6e',
  CM:       '#3f7fc4',
  Lucky17:  '#C2912B',
  Chimeras: '#8466C4',
};

function _collLabelHTML(collId) {
  if (collId === 'CT_L2') return '<i>C. trachomatis</i> L2/434';
  if (collId === 'CM')    return '<i>C. muridarum</i> Nigg';
  if (collId === 'Lucky17') return 'Lucky 17';
  return 'Chimeras';
}

function _renderMobileMutantList(container) {
  const coll = COLLECTIONS.find(c => c.id === _collection) ?? COLLECTIONS[0];
  const collColor = MOB_GRP_COLOR[_collection] ?? '#2f9e6e';

  // Desktop sets height:100%;overflow:hidden on this container for the two-panel layout.
  // On mobile we need it to grow freely so the parent tab-panel can scroll.
  container.style.height = 'auto';
  container.style.overflow = 'visible';
  container.style.padding = '0';
  container.innerHTML = `
    <div class="mob-strain-ctx">
      <img src="${esc(coll.icon)}" alt="${esc(coll.id)}" style="width:38px;height:38px;object-fit:contain;" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0;">
        <div class="spc" style="color:${collColor};">${_collLabelHTML(_collection)}</div>
        <div class="cnt" id="mob-mut-count">Loading…</div>
      </div>
      <button class="mob-switch-btn" id="mob-mut-switch-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
        Switch
      </button>
    </div>

    <div class="mob-sticky-bar" id="mob-mut-toolbar">
      <div class="mob-search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa39c" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="mob-mut-search" type="search" autocomplete="off" placeholder="Search mutants, alleles, genes…" />
        <button id="mob-mut-search-clear" style="display:none;background:none;border:none;color:var(--mob-ink-3);cursor:pointer;padding:0;font-size:14px;">✕</button>
      </div>
      <div id="mut-filter-bar" style="flex-shrink:0;"></div>
    </div>

    <div id="mob-mut-list" style="background:var(--mob-bg);"></div>
    <div class="mob-pad-bottom"></div>`;

  onMobScroll(container, 60, 'Mutants');

  const searchInput = container.querySelector('#mob-mut-search');
  const searchClear = container.querySelector('#mob-mut-search-clear');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    _searchTerm = searchInput.value.trim();
    searchClear.style.display = _searchTerm ? '' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => _mobFetchMutants(container), 250);
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = ''; _searchTerm = '';
    searchClear.style.display = 'none';
    _mobFetchMutants(container);
  });

  // Dismiss sort dropdown on outside click
  document.addEventListener('click', () => {
    container.querySelector('#mob-mut-sort-drop')?.style.setProperty('display', 'none');
  });

  container.querySelector('#mob-mut-switch-btn').addEventListener('click', () => {
    _mobMutantCollectionSheet(container);
  });

  _mobMutantFilterBar(container, c => _mobFetchMutants(c));
  _mobFetchMutants(container);
}

async function _mobFetchMutants(container) {
  const list = container.querySelector('#mob-mut-list');
  if (!list) return;
  list.innerHTML = '<div style="padding:24px 20px;color:var(--mob-ink-3);font-size:14px;">Loading…</div>';

  let query = sb
    .from('mutants')
    .select('id,mutant_id,name,mutation_type,collection,is_published,show_in_pipeline,creator_name,target_gene_ids,marker,recombination_start,recombination_end,strains!background_strain_id(common_name)')
    .eq('collection', _collection)
    .limit(1000);

  if (_searchTerm) query = query.or(`mutant_id.ilike.%${_searchTerm}%,name.ilike.%${_searchTerm}%`);

  const { data: rows, error } = await query;

  if (error) {
    list.innerHTML = `<div style="padding:24px 20px;color:#ef4444;font-size:14px;">${esc(error.message)}</div>`;
    return;
  }
  if (!rows?.length) {
    const countEl = container.querySelector('#mob-mut-count');
    if (countEl) countEl.textContent = '0 mutants';
    list.innerHTML = '<div style="padding:28px 20px;text-align:center;color:var(--mob-ink-3);font-size:14px;">No mutants found.</div>';
    return;
  }

  // Bulk-fetch gene data for all target_gene_ids
  const allGeneIds = [...new Set(rows.flatMap(m => m.target_gene_ids ?? []))];
  _geneDataMap = new Map();
  if (allGeneIds.length) {
    const { data: geneData } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,functional_category')
      .in('id', allGeneIds);
    (geneData ?? []).forEach(g => _geneDataMap.set(g.id, g));
  }

  // Client-side filters (mirrors desktop fetchList)
  let displayRows = rows;
  if (_filters.favorites)        displayRows = displayRows.filter(m => state.favorites.mutants.has(String(m.id)));
  if (_filters.type)             displayRows = displayRows.filter(m => m.mutation_type === _filters.type);
  if (_filters.strain)           displayRows = displayRows.filter(m => m.strains?.common_name === _filters.strain);
  if (_filters.category)         displayRows = displayRows.filter(m => (m.target_gene_ids ?? []).some(id => _geneDataMap.get(id)?.functional_category === _filters.category));
  if (_filters.published !== null) displayRows = displayRows.filter(m => m.is_published === _filters.published);
  if (_filters.creator)          displayRows = displayRows.filter(m => m.creator_name === _filters.creator);
  if (_filters.marker)           displayRows = displayRows.filter(m => m.marker?.includes(_filters.marker));

  // Client-side sort
  const getFirstLocusTag = m => {
    const ids  = m.target_gene_ids ?? [];
    const tags = ids.map(id => _geneDataMap.get(id)?.locus_tag).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return tags[0] ?? '￿';
  };
  const getFirstGeneName = m => {
    const ids   = m.target_gene_ids ?? [];
    const names = ids.map(id => _geneDataMap.get(id)?.gene_name).filter(Boolean).sort();
    return names[0] ?? '￿';
  };
  displayRows = [...displayRows].sort((a, b) => {
    let va, vb;
    if (_sortField === 'locus_tag')  { va = getFirstLocusTag(a);  vb = getFirstLocusTag(b); }
    else if (_sortField === 'gene_name') { va = getFirstGeneName(a); vb = getFirstGeneName(b); }
    else                             { va = a.mutant_id ?? '';     vb = b.mutant_id ?? ''; }
    const cmp = va.localeCompare(vb, undefined, { numeric: true });
    return _sortAsc ? cmp : -cmp;
  });

  _total = displayRows.length;
  const countEl = container.querySelector('#mob-mut-count');
  if (countEl) countEl.textContent = `${_total.toLocaleString()} mutant${_total !== 1 ? 's' : ''}`;

  if (!displayRows.length) {
    list.innerHTML = '<div style="padding:28px 20px;text-align:center;color:var(--mob-ink-3);font-size:14px;">No mutants found.</div>';
    return;
  }

  const chevron = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  list.innerHTML = `<div style="background:var(--mob-paper);">${displayRows.map((m, i) => _mobMutantRowHTML(m, i, displayRows.length, chevron)).join('')}</div>`;

  // Wire row clicks
  list.querySelectorAll('.mob-grow[data-mut-id]').forEach(row => {
    row.addEventListener('click', () => _mobLoadMutantDetail(row.dataset.mutId));
  });

  // Wire star toggles
  list.querySelectorAll('.mob-star[data-fav-mid]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!state.user) { window.__showAuthModal?.('signin'); return; }
      const nowFav = await toggleFavoriteDB('mutant', btn.dataset.favMid);
      btn.classList.toggle('on', nowFav);
      const svg = btn.querySelector('svg');
      if (svg) { svg.setAttribute('fill', nowFav ? '#e8b400' : 'none'); svg.setAttribute('stroke', nowFav ? '#e8b400' : 'currentColor'); }
    });
  });
}

function _mobMutantRowHTML(m, idx, total, chevron) {
  const isChimeraOrLucky = m.collection === 'Chimeras' || m.collection === 'Lucky17';
  const mt      = MOB_TYPE[m.mutation_type] ?? MOB_TYPE_DEFAULT;
  const isFav   = state.favorites.mutants.has(String(m.id));
  const hasSep  = idx < total - 1;
  const isLab   = state.userRole === 'lab_member' || state.userRole === 'admin';

  // Primary display name
  const primaryText = isChimeraOrLucky
    ? `<span style="font-family:var(--mob-mono);font-weight:600;font-size:15px;">${esc(m.mutant_id)}</span>`
    : `<span style="font-weight:600;font-size:15px;">${esc(m.name || m.mutant_id)}</span>`;

  // Secondary line
  let secondary = '';
  if (isChimeraOrLucky && m.recombination_start && m.recombination_end) {
    secondary = `<span style="font-family:var(--mob-mono);font-size:12px;">${esc(m.recombination_start)}–${esc(m.recombination_end)}</span>`;
  } else {
    const ids  = m.target_gene_ids ?? [];
    const tags = ids.map(id => _geneDataMap.get(id)?.locus_tag).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (tags.length) secondary = `<span style="font-size:12px;font-family:var(--mob-mono);color:var(--mob-ink-3);">${esc(tags.slice(0,2).join(', '))}${tags.length > 2 ? ' +' + (tags.length - 2) : ''}</span>`;
  }

  // Type pill — only for CT_L2 and CM
  const typePill = (!isChimeraOrLucky && m.mutation_type)
    ? `<span style="display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:1px 5px;border-radius:4px;background:${mt.color}18;color:${mt.color};border:1px solid ${mt.color}40;white-space:nowrap;margin-left:5px;">${esc(TYPE_LABELS[m.mutation_type] ?? m.mutation_type)}</span>`
    : '';

  // Pipeline dot (lab+ only, when show_in_pipeline)
  const pipeDot = (isLab && m.show_in_pipeline)
    ? `<span style="width:7px;height:7px;border-radius:50%;background:#059669;flex-shrink:0;display:inline-block;" title="In pipeline"></span>`
    : '';

  // Star
  const star = state.user
    ? `<button class="mob-star${isFav ? ' on' : ''}" data-fav-mid="${m.id}" aria-label="Save">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? '#e8b400' : 'none'}" stroke="${isFav ? '#e8b400' : 'currentColor'}" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
       </button>`
    : '';

  return `
    <div class="mob-grow" data-mut-id="${m.id}">
      <div class="mob-bar" style="background:${mt.color};"></div>
      <div class="mob-meta">
        <div class="mob-gname" style="display:flex;align-items:center;flex-wrap:wrap;gap:3px;">
          ${primaryText}${typePill}
        </div>
        <div class="mob-gfunc" style="display:flex;align-items:center;gap:5px;margin-top:2px;">
          ${secondary}${pipeDot}
        </div>
      </div>
      ${star}
      <span class="mob-chev">${chevron ?? ''}</span>
      ${hasSep ? '<div class="mob-sep"></div>' : ''}
    </div>`;
}

function _mobMutantFilterBar(container, fetchFn) {
  const bar = container.querySelector('#mut-filter-bar');
  if (!bar) return;

  const isLab       = state.userRole === 'lab_member' || state.userRole === 'admin';
  const sortLabel   = SORT_OPTIONS.find(o => o.field === _sortField)?.label ?? 'Mutant ID';
  const typeOptions = COLLECTION_TYPES[_collection]   ?? [];
  const strainOpts  = COLLECTION_STRAINS[_collection] ?? [];
  const funcOptions = Object.entries(FUNC_LABELS).map(([cat, label]) => ({ value: cat, label }));
  const hasMore     = typeOptions.length > 0 || strainOpts.length > 0 || funcOptions.length > 0 || isLab;
  const secOpen     = { ..._expandedSections };

  const strainObj  = strainOpts.find(s => s.value === _filters.strain);
  const catLabel   = _filters.category ? (FUNC_LABELS[_filters.category] ?? _filters.category) : null;
  const typelabel  = _filters.type ? (TYPE_LABELS[_filters.type] ?? _filters.type) : null;
  const markerLabel = _filters.marker ?? null;

  // Chip builder
  const chip = (id, label, active) => `
    <button data-mob-filter="${id}"
      style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${active ? '#bbf7d0' : '#e5e7eb'};
             background:${active ? '#f0fdf4' : 'white'};color:${active ? '#16a34a' : '#9ca3af'};">
      ${label}${active ? ' ×' : ''}
    </button>`;

  const typeChip = v => {
    const a = _filters.type === v;
    return `<button data-mob-type-filter="${v}"
      style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
      ${esc(TYPE_LABELS[v] ?? v)}${a ? ' ×' : ''}
    </button>`;
  };

  const strainChip = s => {
    const a = _filters.strain === s.value;
    return `<button data-mob-strain-filter="${s.value}"
      style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
      ${esc(s.label)}${a ? ' ×' : ''}
    </button>`;
  };

  const catChip = (value, label) => {
    const a = _filters.category === value;
    return `<button data-mob-cat-filter="${value}"
      style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
             border:1px solid ${a ? '#fde68a' : '#e5e7eb'};background:${a ? '#fefce8' : 'white'};color:${a ? '#92400e' : '#9ca3af'};">
      ${esc(label)}${a ? ' ×' : ''}
    </button>`;
  };

  const groupHead = (id, icon, label, isOpen) => `
    <button data-mob-section="${id}"
      style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
             color:#888;width:100%;margin-top:6px;border-top:1px solid #efefef;padding-top:7px;
             padding-bottom:${isOpen ? '4px' : '2px'};background:none;border-left:none;border-right:none;border-bottom:none;
             cursor:pointer;text-align:left;font-family:inherit;">
      ${icon ? `<span>${icon}</span>` : ''}<span>${label}</span>
      <span style="margin-left:auto;font-size:10px;color:#ccc;">${isOpen ? '▾' : '▸'}</span>
    </button>`;

  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px;background:#fafafa;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;">
      <div style="position:relative;">
        <button id="mob-mut-sort-btn"
          style="font-size:12px;font-weight:500;color:#555;background:white;border:1px solid #e0e0e0;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit;">
          ⇅ ${esc(sortLabel)}
        </button>
        <div id="mob-mut-sort-drop" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:130px;overflow:hidden;">
          ${SORT_OPTIONS.map(o => `
            <button data-mob-sort-field="${o.field}"
              style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:12px;border:none;cursor:pointer;font-family:inherit;
                     font-weight:${o.field === _sortField ? '600' : '400'};
                     color:${o.field === _sortField ? '#16a34a' : '#333'};
                     background:${o.field === _sortField ? '#f0fdf4' : 'none'};">
              ${esc(o.label)}
            </button>`).join('')}
        </div>
      </div>
      ${chip('favorites', '★ Favorites', _filters.favorites)}
      ${typelabel   ? `<button data-mob-clear-type     style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-family:inherit;">${esc(typelabel)} ×</button>`  : ''}
      ${strainObj   ? `<button data-mob-clear-strain   style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;font-family:inherit;">${esc(strainObj.label)} ×</button>` : ''}
      ${catLabel    ? `<button data-mob-clear-category style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #fde68a;background:#fefce8;color:#92400e;cursor:pointer;white-space:nowrap;font-family:inherit;">⚙️ ${esc(catLabel)} ×</button>` : ''}
      ${_filters.published !== null ? `<button data-mob-clear-published style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-family:inherit;">${_filters.published ? 'Published' : 'Unpublished'} ×</button>` : ''}
      ${_filters.creator ? `<button data-mob-clear-creator style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #e9d5ff;background:#faf5ff;color:#6b21a8;cursor:pointer;white-space:nowrap;font-family:inherit;">👤 ${esc(_filters.creator)} ×</button>` : ''}
      ${markerLabel  ? `<button data-mob-clear-marker  style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #99f6e4;background:#f0fdfa;color:#0f766e;cursor:pointer;white-space:nowrap;font-family:inherit;">🏷 ${esc(markerLabel)} ×</button>` : ''}
      ${hasMore ? `<button id="mob-mut-more-btn"
        style="font-size:11px;font-weight:600;cursor:pointer;margin-left:auto;font-family:inherit;
               color:${_moreOpen ? '#16a34a' : '#9ca3af'};background:white;
               border:1px solid ${_moreOpen ? '#bbf7d0' : '#e5e7eb'};border-radius:6px;padding:3px 9px;">
        ${_moreOpen ? '− Less' : '+ More'}
      </button>` : ''}
    </div>
    <div id="mob-mut-more-panel" style="display:${_moreOpen ? 'block' : 'none'};padding:4px 12px 8px;background:#fafafa;border-bottom:1px solid #f0f0f0;overflow-y:auto;max-height:40vh;">
      ${typeOptions.length ? `
        ${groupHead('type', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>', 'Type', secOpen.type)}
        <div style="display:${secOpen.type ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
          ${typeOptions.map(t => typeChip(t)).join('')}
        </div>` : ''}
      ${strainOpts.length ? `
        ${groupHead('strain', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5h13"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="M3 10a2 2 0 0 0 2 2h3"/><path d="M3 5v12a2 2 0 0 0 2 2h3"/></svg>', 'Strain', secOpen.strain)}
        <div style="display:${secOpen.strain ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
          ${strainOpts.map(s => strainChip(s)).join('')}
        </div>` : ''}
      ${groupHead('function', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 10.27 7 3.34"/><path d="m11 13.73-4 6.93"/><path d="M12 22v-2"/><path d="M12 2v2"/><path d="M14 12h8"/><path d="m17 20.66-1-1.73"/><path d="m17 3.34-1 1.73"/><path d="M2 12h2"/><path d="m20.66 17-1.73-1"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m3.34 7 1.73 1"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="8"/></svg>', 'Function', secOpen.function)}
      <div style="display:${secOpen.function ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${funcOptions.map(f => catChip(f.value, f.label)).join('')}
      </div>
      ${isLab ? `
        ${groupHead('published', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>', 'Status', secOpen.published)}
        <div style="display:${secOpen.published ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
          ${['Published', 'Unpublished'].map(label => {
            const val = label === 'Published';
            const a   = _filters.published === val;
            return `<button data-mob-pub-filter="${val}"
              style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
                     border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
              ${label}${a ? ' ×' : ''}
            </button>`;
          }).join('')}
        </div>
        ${groupHead('creator', '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/></svg>', 'Creator', secOpen.creator)}
        <div style="display:${secOpen.creator ? 'block' : 'none'};padding-bottom:4px;">
          <div style="position:relative;display:inline-block;">
            <button id="mob-mut-creator-btn"
              style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap;cursor:pointer;font-family:inherit;
                     border:1px solid ${_filters.creator ? '#e9d5ff' : '#e5e7eb'};
                     background:${_filters.creator ? '#faf5ff' : 'white'};
                     color:${_filters.creator ? '#6b21a8' : '#9ca3af'};">
              ${_filters.creator ? `👤 ${esc(_filters.creator)}` : 'Select creator ▾'}
            </button>
            <div id="mob-mut-creator-drop" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:160px;overflow:hidden;">
              <div id="mob-mut-creator-list" style="padding:4px 0;"><div style="padding:8px 14px;font-size:12px;color:#9ca3af;">Loading…</div></div>
            </div>
          </div>
        </div>` : ''}
    </div>
  `;

  // Sort dropdown
  const sortBtn  = bar.querySelector('#mob-mut-sort-btn');
  const sortDrop = bar.querySelector('#mob-mut-sort-drop');
  if (sortBtn && sortDrop) {
    sortBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = sortDrop.style.display === 'none';
      sortDrop.style.display = open ? 'block' : 'none';
    });
    bar.querySelectorAll('[data-mob-sort-field]').forEach(btn => {
      btn.addEventListener('click', () => {
        _sortField = btn.dataset.mobSortField;
        sortDrop.style.display = 'none';
        _mobMutantFilterBar(container, fetchFn);
        fetchFn(container);
      });
    });
  }

  // Favorites chip
  bar.querySelector('[data-mob-filter="favorites"]')?.addEventListener('click', () => {
    _filters.favorites = !_filters.favorites;
    _mobMutantFilterBar(container, fetchFn);
    fetchFn(container);
  });

  // Clear chips
  bar.querySelector('[data-mob-clear-type]')?.addEventListener('click', ()      => { _filters.type = null;      _mobMutantFilterBar(container, fetchFn); fetchFn(container); });
  bar.querySelector('[data-mob-clear-strain]')?.addEventListener('click', ()    => { _filters.strain = null;    _mobMutantFilterBar(container, fetchFn); fetchFn(container); });
  bar.querySelector('[data-mob-clear-category]')?.addEventListener('click', ()  => { _filters.category = null;  _mobMutantFilterBar(container, fetchFn); fetchFn(container); });
  bar.querySelector('[data-mob-clear-published]')?.addEventListener('click', () => { _filters.published = null; _mobMutantFilterBar(container, fetchFn); fetchFn(container); });
  bar.querySelector('[data-mob-clear-creator]')?.addEventListener('click', ()   => { _filters.creator = null;   _mobMutantFilterBar(container, fetchFn); fetchFn(container); });
  bar.querySelector('[data-mob-clear-marker]')?.addEventListener('click', ()    => { _filters.marker = null;    _mobMutantFilterBar(container, fetchFn); fetchFn(container); });

  // More/Less toggle
  bar.querySelector('#mob-mut-more-btn')?.addEventListener('click', () => {
    _moreOpen = !_moreOpen;
    _mobMutantFilterBar(container, fetchFn);
  });

  // Section expand/collapse
  bar.querySelectorAll('[data-mob-section]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.mobSection;
      if (id in _expandedSections) _expandedSections[id] = !_expandedSections[id];
      if (id === 'marker' && _expandedSections.marker && !_markerOptions.length) {
        const { data } = await sb
          .from('mutants')
          .select('marker')
          .eq('collection', _collection)
          .not('marker', 'is', null);
        _markerOptions = [...new Set((data ?? []).flatMap(r => r.marker ?? []))].sort();
      }
      _mobMutantFilterBar(container, fetchFn);
    });
  });

  // Type filter chips
  bar.querySelectorAll('[data-mob-type-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.mobTypeFilter;
      _filters.type = _filters.type === val ? null : val;
      _mobMutantFilterBar(container, fetchFn);
      fetchFn(container);
    });
  });

  // Strain filter chips
  bar.querySelectorAll('[data-mob-strain-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.mobStrainFilter;
      _filters.strain = _filters.strain === val ? null : val;
      _mobMutantFilterBar(container, fetchFn);
      fetchFn(container);
    });
  });

  // Category filter chips
  bar.querySelectorAll('[data-mob-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.mobCatFilter;
      _filters.category = _filters.category === val ? null : val;
      _mobMutantFilterBar(container, fetchFn);
      fetchFn(container);
    });
  });

  // Published status chips
  bar.querySelectorAll('[data-mob-pub-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.mobPubFilter === 'true';
      _filters.published = _filters.published === val ? null : val;
      _mobMutantFilterBar(container, fetchFn);
      fetchFn(container);
    });
  });

  // Creator dropdown
  const creatorBtn  = bar.querySelector('#mob-mut-creator-btn');
  const creatorDrop = bar.querySelector('#mob-mut-creator-drop');
  const creatorList = bar.querySelector('#mob-mut-creator-list');
  if (creatorBtn && creatorDrop && creatorList) {
    creatorBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const open = creatorDrop.style.display === 'none';
      creatorDrop.style.display = open ? 'block' : 'none';
      if (!open) return;
      if (!_creatorOptions.length) {
        const { data } = await sb
          .from('mutants')
          .select('creator_name')
          .eq('collection', _collection)
          .not('creator_name', 'is', null);
        _creatorOptions = [...new Set((data ?? []).map(r => r.creator_name))].sort();
      }
      creatorList.innerHTML = _creatorOptions.length
        ? [
            ...(_filters.creator ? [`<button data-mob-creator-pick="" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:12px;border:none;cursor:pointer;font-family:inherit;color:#9ca3af;background:none;">Clear filter</button>`] : []),
            ..._creatorOptions.map(name => `
              <button data-mob-creator-pick="${esc(name)}"
                style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:12px;border:none;cursor:pointer;font-family:inherit;
                       font-weight:${_filters.creator === name ? '600' : '400'};
                       color:${_filters.creator === name ? '#6b21a8' : '#333'};
                       background:${_filters.creator === name ? '#faf5ff' : 'none'};">
                ${esc(name)}
              </button>`)
          ].join('')
        : `<div style="padding:8px 14px;font-size:12px;color:#9ca3af;">No creators found</div>`;

      creatorList.querySelectorAll('[data-mob-creator-pick]').forEach(row => {
        row.addEventListener('click', () => {
          _filters.creator = row.dataset.mobCreatorPick || null;
          creatorDrop.style.display = 'none';
          _mobMutantFilterBar(container, fetchFn);
          fetchFn(container);
        });
      });
      setTimeout(() => document.addEventListener('click', () => { creatorDrop.style.display = 'none'; }, { once: true }), 0);
    });
  }
}

function _mobMutantCollectionSheet(container) {
  document.getElementById('mob-mut-coll-sheet')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'mob-mut-coll-sheet';
  backdrop.className = 'mob-sheet-backdrop';
  backdrop.innerHTML = `
    <div class="mob-sheet" onclick="event.stopPropagation()">
      <div class="mob-sheet-handle"></div>
      <div class="mob-sheet-caption">Switch collection</div>
      ${COLLECTIONS.map(c => `
        <div class="mob-strain-sheet-row" data-coll-id="${c.id}"
          style="display:flex;align-items:center;gap:13px;padding:12px 8px;border-radius:14px;cursor:pointer;
                 background:${c.id === _collection ? '#f1f6f3' : 'transparent'};">
          <img src="${esc(c.icon)}" alt="${esc(c.id)}" style="width:38px;height:38px;object-fit:contain;">
          <div style="flex:1;font-size:16px;font-weight:700;color:${MOB_GRP_COLOR[c.id] ?? '#333'};">${_collLabelHTML(c.id)}</div>
          ${c.id === _collection ? '<span style="color:#2f9e6e;font-weight:800;font-size:18px;">✓</span>' : ''}
        </div>`).join('')}
    </div>`;

  backdrop.addEventListener('click', () => backdrop.remove());
  backdrop.querySelectorAll('.mob-strain-sheet-row').forEach(row => {
    row.addEventListener('click', () => {
      _collection = row.dataset.collId;
      window.__mutantCollection = _collection;
      backdrop.remove();
      // Reset filters and search when switching collection
      _filters = { favorites: false, type: null, strain: null, category: null, published: null, creator: null, marker: null };
      _searchTerm = '';
      _creatorOptions = [];
      _markerOptions = [];
      _moreOpen = false;
      _expandedSections = { type: false, strain: false, function: false, published: false, creator: false, marker: false };
      const searchInput = container.querySelector('#mob-mut-search');
      if (searchInput) searchInput.value = '';
      renderMutants(container);
    });
  });

  document.body.appendChild(backdrop);
}

export async function _mobLoadMutantDetail(mutantUUID) {
  pushMobileDetail({
    title: '…',
    render: (scroll) => {
      scroll.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--mob-ink-3);font-size:14px;">Loading…</div>';
    },
  });

  const [mutantRes, pipeRes, phenoRes] = await Promise.all([
    sb.from('mutants')
      .select(`id,mutant_id,name,mutation_type,mutation_method,plasmid_used,marker,
               creator,creator_name,background_strain_id,
               is_published,notes,target_gene_ids,
               recombination_start,recombination_end,ortholog_span_cm,collection,
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
  if (!m) return;

  let genes = [];
  if (m.target_gene_ids?.length) {
    const { data } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,functional_category,proteins(alphafold_results(thumbnail_path))')
      .in('id', m.target_gene_ids);
    genes = (data ?? []).sort((a, b) => (a.locus_tag ?? '').localeCompare(b.locus_tag ?? ''));
  }

  const title = m.name || m.mutant_id;
  const scroll = document.getElementById('mob-detail-scroll');
  if (scroll) {
    scroll.innerHTML = '';
    _renderMutantDetailMobileHTML(m, genes, phenoRes.data ?? [], pipeRes.data ?? null, scroll);
  }
  const titleEl = document.getElementById('mob-bar-title');
  if (titleEl) titleEl.textContent = title;
}

function _renderMutantDetailMobileHTML(m, genes, phenos, pipe, scroll) {
  const isChimera   = m.mutation_type === 'chimera';
  const isLabMember = state.userRole === 'lab_member' || state.userRole === 'admin';
  const mt          = MOB_TYPE[m.mutation_type] ?? MOB_TYPE_DEFAULT;
  const collColor   = MOB_GRP_COLOR[m.collection] ?? '#8b958f';
  const collIcon    = {
    CT_L2:    '/design/icons_transparent/L2icon_transparent.png',
    CM:       '/design/icons_transparent/CMicon_transparent.png',
    Lucky17:  '/design/icons_transparent/L17icon_transparent.png',
    Chimeras: '/design/icons_transparent/Chimeraicon_transparent.png',
  }[m.collection] ?? '';
  const isFav      = state.favorites.mutants.has(String(m.id));
  const typeLabel  = TYPE_LABELS[m.mutation_type] ?? m.mutation_type ?? '';
  const pubColor   = m.is_published ? '#1c8c7e' : '#d98a2b';
  const pubLabel   = m.is_published ? 'Published' : 'Unpublished';
  // KV row helper — no mono font anywhere in mutant detail
  const kv = (key, val) => val
    ? `<div class="mob-kv"><div class="mob-k">${key}</div><div class="mob-v sm">${val}</div></div>`
    : '';

  // Pipeline stage strip
  const pipelineHTML = (() => {
    if (!isLabMember) return '';
    if (!pipe) return `<div class="mob-det-sec"><div class="mob-det-h">Pipeline</div><div style="font-size:13px;color:var(--mob-ink-3);font-style:italic;">No pipeline record.</div></div>`;
    const stages = [
      { label: 'Transform',  done: !!pipe.transformed_date,    date: pipe.transformed_date },
      { label: 'Cloning',    done: !!pipe.plaque_cloned_date,  date: pipe.plaque_cloned_date },
      { label: 'Genotype',   done: !!pipe.genotyped_date,      date: pipe.genotyped_date },
      { label: 'In vitro',   done: !!pipe.in_vitro_date,       date: pipe.in_vitro_date },
      { label: 'In vivo',    done: !!pipe.in_vivo_date,        date: pipe.in_vivo_date },
    ];
    const stageEls = stages.map((s, i) => `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0;">
        <div style="width:14px;height:14px;border-radius:50%;flex-shrink:0;
             background:${s.done ? '#059669' : 'none'};
             border:2px solid ${s.done ? '#059669' : '#d1d5db'};
             position:relative;z-index:1;">
        </div>
        <div style="font-size:10px;font-weight:600;color:${s.done ? '#059669' : '#9ca3af'};text-align:center;line-height:1.2;">${s.label}</div>
        ${s.date ? `<div style="font-size:9px;color:var(--mob-ink-3);text-align:center;">${s.date.slice(0,10)}</div>` : ''}
      </div>
      ${i < stages.length - 1 ? `<div style="flex:1;height:2px;background:#e5e7eb;margin-top:6px;"></div>` : ''}`).join('');
    return `
      <div class="mob-det-sec">
        <div class="mob-det-h">Pipeline</div>
        <div style="display:flex;align-items:flex-start;gap:0;">${stageEls}</div>
      </div>`;
  })();

  // Phenotype section
  const phenoHTML = (() => {
    if (!phenos.length) {
      return `<div class="mob-det-sec"><div class="mob-det-h">Phenotype</div><div style="font-size:13px;color:var(--mob-ink-3);font-style:italic;">No phenotype data recorded.</div></div>`;
    }
    const phenoSections = phenos.map(ph => {
      const hasPhenoColor = ph.has_phenotype ? '#059669' : '#9ca3af';
      const hasPhenoBg    = ph.has_phenotype ? '#e6f4f0' : '#f3f4f6';
      const hasPhenoLabel = ph.has_phenotype ? 'Has phenotype' : 'No phenotype';
      const imgStrip = ph.image_paths?.length
        ? `<div style="display:flex;gap:8px;overflow-x:auto;padding:10px 16px 4px;-webkit-overflow-scrolling:touch;">
            ${ph.image_paths.map(src => `<img src="${esc(src)}" alt="" style="height:110px;width:auto;border-radius:8px;flex-shrink:0;object-fit:cover;">`).join('')}
           </div>`
        : `<div style="padding:8px 16px;"><span style="font-size:12px;color:var(--mob-ink-3);background:#f3f4f6;border-radius:8px;padding:5px 10px;display:inline-block;">📷 No image on file</span></div>`;
      return `
        ${imgStrip}
        ${ph.description ? `<div style="padding:8px 16px 4px;font-size:14px;line-height:1.6;color:var(--mob-ink);">${esc(ph.description)}</div>` : ''}
        <div style="padding:6px 16px 10px;">
          <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:12px;background:${hasPhenoBg};color:${hasPhenoColor};">${hasPhenoLabel}</span>
        </div>`;
    }).join('<hr style="border:none;border-top:1px solid #f0f0f0;margin:0;">');
    return `<div class="mob-det-sec"><div class="mob-det-h">Phenotype</div>${phenoSections}</div>`;
  })();

  const isPriority = isLabMember && !!pipe?.is_priority;
  const flameSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${collColor}" stroke="${collColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></svg>`;

  // Chimeras/Lucky17: mutant_id (RC###) is primary, name is secondary.
  // Tn/deletion (CT_L2, CM): name (Tn::gyrA) is primary, mutant_id is secondary.
  const isChimeraOrLucky = m.collection === 'Chimeras' || m.collection === 'Lucky17';
  const heroTitle    = isChimeraOrLucky ? m.mutant_id : (m.name || m.mutant_id);
  const heroSubtitle = isChimeraOrLucky ? m.name : (m.name ? m.mutant_id : null);

  scroll.innerHTML = `
    <!-- Header — bleeds to screen top matching gene detail pattern -->
    <div style="margin-top:calc(-1 * var(--mob-nav-h));padding-top:calc(var(--mob-nav-h) + 10px);
                background:linear-gradient(180deg,${collColor}28 0%,${collColor}08 100%);
                border-bottom:1px solid ${collColor}40;padding-bottom:14px;">
      <div class="mob-d-head" style="padding:0 12px 0 16px;align-items:center;">
        <img src="${esc(collIcon)}" alt="" style="width:52px;height:52px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'">
        <div class="mob-d-title-block">
          <div class="mob-d-title" style="display:flex;align-items:center;gap:6px;">
            ${esc(heroTitle)}
            ${isPriority ? `<span title="Priority">${flameSVG}</span>` : ''}
          </div>
          ${heroSubtitle ? `<span class="mob-d-loc" style="font-family:var(--mob-sans);">${esc(heroSubtitle)}</span>` : ''}
        </div>
        <div class="mob-d-actions" style="flex-shrink:0;display:flex;align-items:center;gap:2px;">
          ${isLabMember ? `<button class="mob-edit-btn" aria-label="Edit mutant"
              style="background:none;border:none;padding:8px 4px;cursor:pointer;color:var(--mob-ink-3);">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
            </button>` : ''}
          ${state.user ? `<button class="mob-fav-btn${isFav ? ' saved-on' : ''}" data-id="${m.id}" aria-label="Save mutant"
              style="background:none;border:none;padding:8px 4px;cursor:pointer;color:${isFav ? '#e8b400' : 'var(--mob-ink-3)'};">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="${isFav ? '#e8b400' : 'none'}" stroke="${isFav ? '#e8b400' : 'currentColor'}" stroke-width="2"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>
            </button>` : ''}
        </div>
      </div>
      <div class="mob-tags-row" style="padding:8px 16px 0;flex-wrap:wrap;">
        <span class="mob-tag" style="color:${mt.color};border-color:${mt.color};background:${mt.color}14;">${esc(typeLabel)}</span>
        <span class="mob-tag" style="color:${pubColor};border-color:${pubColor};background:${pubColor}14;">${esc(pubLabel)}</span>
        <span class="mob-tag" style="color:${collColor};border-color:${collColor};background:${collColor}14;">${esc(m.collection ?? '')}</span>
      </div>
    </div>

    <!-- Section: Targeted Genes / Recombined Region -->
    <div class="mob-det-sec" id="mob-mut-targets-card">
      <div class="mob-det-h">${isChimera ? 'Recombined Region' : 'Targeted Genes'}</div>
      ${isChimera
        ? `<div id="mob-chimera-placeholder" style="color:var(--mob-ink-3);font-size:13px;text-align:center;padding:6px 0;">Loading recombination data…</div>`
        : _mobTargetedGenesHTML(genes, m.mutation_type)}
    </div>

    <!-- Section: Gene Exchange (chimeras only) -->
    ${isChimera ? `
    <div class="mob-det-sec mob-det-sec--map" id="mob-gene-exchange-card">
      <div class="mob-det-h" style="padding:0 16px;">Gene Exchange</div>
      <div id="mob-exchange-placeholder" style="padding:6px 16px;color:var(--mob-ink-3);font-size:13px;text-align:center;">Loading…</div>
    </div>` : ''}

    <!-- Section: Mutation -->
    <div class="mob-det-sec">
      <div class="mob-det-h">Mutation</div>
      <div class="mob-kv-grid">
        ${kv('Type', esc(typeLabel))}
        ${kv('Allele', esc(m.mutant_id ?? '—'))}
        ${kv('Method', esc(m.mutation_method ?? ''))}
        ${kv('Marker', esc(m.marker ?? ''))}
        ${kv('Plasmid', esc(m.plasmid_used ?? ''))}
      </div>
    </div>

    <!-- Section: Background -->
    <div class="mob-det-sec">
      <div class="mob-det-h">Background</div>
      <div class="mob-kv-grid">
        ${kv('Strain', esc(m.strains?.common_name ?? '—'))}
        ${kv('Collection', esc(m.collection ?? '—'))}
        ${kv('Creator', esc(m.creator_name ?? ''))}
      </div>
    </div>

    <!-- Section: Phenotype -->
    ${phenoHTML}

    <!-- Section: Pipeline (lab+ only) -->
    ${pipelineHTML}

    <!-- Section: Source -->
    <div class="mob-det-sec">
      <div class="mob-det-h">Source</div>
      <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;
           background:${pubColor}14;color:${pubColor};border:1px solid ${pubColor}40;">${esc(pubLabel)}</span>
    </div>

    <!-- Section: Notes (lab+ only) -->
    ${isLabMember && m.notes ? `
    <div class="mob-det-sec">
      <div class="mob-det-h">Notes</div>
      <div style="font-size:14px;line-height:1.6;color:var(--mob-ink);">${esc(m.notes)}</div>
    </div>` : ''}

    <div class="mob-pad-bottom"></div>`;

  // Edit button — opens pull-up sheet, reloads detail on save
  scroll.querySelector('.mob-edit-btn')?.addEventListener('click', () => {
    openMutantEditModal(m, genes, null, () => _mobLoadMutantDetail(m.id));
  });

  // Favorite button
  scroll.querySelector('.mob-fav-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const nowFav = await toggleFavoriteDB('mutant', m.id);
    btn.classList.toggle('saved-on', nowFav);
    const svg = btn.querySelector('svg');
    if (svg) { svg.setAttribute('fill', nowFav ? '#e8b400' : 'none'); svg.setAttribute('stroke', nowFav ? '#e8b400' : 'currentColor'); }
  });

  // Targeted gene row navigation
  scroll.querySelectorAll('[data-tg-gene]').forEach(row => {
    row.addEventListener('click', () => {
      window.__openGeneId = row.dataset.tgGene;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
    });
  });

  // Targeted gene scroll fade
  const tgScroll = scroll.querySelector('#mob-tg-scroll');
  const tgFade   = scroll.querySelector('#mob-tg-fade');
  if (tgScroll && tgFade) {
    const updateFade = () => {
      tgFade.style.opacity = (tgScroll.scrollTop + tgScroll.clientHeight >= tgScroll.scrollHeight - 4) ? '0' : '1';
    };
    tgScroll.addEventListener('scroll', updateFade, { passive: true });
    updateFade();
  }

  // Inject chimera sections
  if (isChimera && m.recombination_start && m.recombination_end) {
    _mobInjectChimeraSections(m, scroll);
  }
}

function _mobTargetedGenesHTML(genes, mutationType) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  if (!genes.length) return '<div style="margin-top:10px;font-style:italic;color:var(--mob-ink-3);font-size:14px;">No target genes recorded.</div>';

  const ROLE = {
    deletion:      { color: '#c0392b', bg: '#fce8e8', label: 'Deleted' },
    transposon:    { color: '#059669', bg: '#e6f4f0', label: 'Insertion' },
    chimera:       { color: '#8466c4', bg: '#f0ecfb', label: 'Swapped in' },
    chemical:      { color: '#2563eb', bg: '#e8eefb', label: 'Point' },
    intron:        { color: '#ca8a04', bg: '#fdf3e0', label: 'Intron' },
    recombination: { color: '#8466c4', bg: '#f0ecfb', label: 'Recombined' },
  };
  const role = ROLE[mutationType] ?? { color: '#8b958f', bg: '#f4f4f4', label: 'Modified' };

  const rowsHTML = genes.map((g, i) => {
    const color   = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
    const thumb   = g.proteins?.alphafold_results?.find(r => r.thumbnail_path)?.thumbnail_path;
    const display = g.gene_name || g.locus_tag;
    const hasSep  = i < genes.length - 1;
    return `
      <div class="mob-tg-row" data-tg-gene="${g.id}">
        <div class="mob-tg-bar" style="background:${color};"></div>
        <div class="mob-stile" style="width:30px;height:30px;border-radius:7px;flex-shrink:0;">
          ${thumb ? `<img src="${esc(thumb)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>`}
        </div>
        <div class="mob-tg-meta">
          <div class="mob-tg-name">${esc(display)}<span class="loc">${g.gene_name ? esc(g.locus_tag) : ''}</span></div>
          <div class="mob-tg-func">${esc(g.functional_category ?? '')}</div>
        </div>
        <span class="mob-role-badge" style="color:${role.color};background:${role.bg};">${esc(role.label)}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c8cec9" stroke-width="2.2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        ${hasSep ? '<div style="position:absolute;left:0;right:0;bottom:0;height:.5px;background:var(--mob-line);"></div>' : ''}
      </div>`;
  }).join('');

  const needsScroll = genes.length > 4;
  return `
    <div class="mob-tg-win">
      <div class="mob-tg-scroll" id="mob-tg-scroll" style="max-height:${needsScroll ? '250px' : 'none'};overflow-y:${needsScroll ? 'auto' : 'visible'};">
        ${rowsHTML}
      </div>
      ${needsScroll ? `
        <div class="mob-tg-fade" id="mob-tg-fade"></div>
        <div class="mob-tg-count-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          ${genes.length} loci · scroll to see all
        </div>` : ''}
    </div>`;
}

async function _mobInjectChimeraSections(m, scroll) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const start = m.recombination_start;
  const end   = m.recombination_end;
  const backboneStrain = m.strains?.common_name ?? 'CT-L2';
  const isL2Backbone   = backboneStrain === 'CT-L2';
  const GENOME_LEN     = isL2Backbone ? 1_044_459 : 1_072_949;
  const BACKBONE_COLOR = isL2Backbone ? '#2f9e6e' : '#3f7fc4';
  const RECOMB_COLOR   = isL2Backbone ? '#3f7fc4' : '#2f9e6e';
  const BACKBONE_LABEL = isL2Backbone ? 'CT-L2' : 'CM';
  const RECOMB_LABEL   = isL2Backbone ? 'CM' : 'CT-L2';

  try {
    const [startRes, endRes] = await Promise.all([
      sb.from('genes').select('start_bp,end_bp,sort_index').eq('locus_tag', start).eq('strain_id', m.background_strain_id).maybeSingle(),
      sb.from('genes').select('start_bp,end_bp,sort_index').eq('locus_tag', end  ).eq('strain_id', m.background_strain_id).maybeSingle(),
    ]);

    const sg = startRes.data; const eg = endRes.data;
    const placeholder = scroll.querySelector('#mob-chimera-placeholder');

    if (sg && eg && placeholder) {
      const startBp = sg.start_bp ?? 0;
      const endBp   = eg.end_bp   ?? sg.end_bp ?? 0;
      const sizeKb  = Math.round(Math.abs(endBp - startBp) / 1000);
      const pct     = ((Math.abs(endBp - startBp) / GENOME_LEN) * 100).toFixed(1);
      const x0pct   = ((startBp / GENOME_LEN) * 100).toFixed(2);
      const wpct    = ((Math.abs(endBp - startBp) / GENOME_LEN) * 100).toFixed(2);

      const LANDMARKS = ['ompA', 'incA', 'gyrA', 'rpoB', 'secY'];
      const lmOr = LANDMARKS.map(n => `gene_name.eq.${n},gene_symbol.eq.${n}`).join(',');
      const { data: lmData } = await sb
        .from('genes').select('gene_name,gene_symbol,start_bp')
        .eq('strain_id', m.background_strain_id).or(lmOr);
      const landmarks = (lmData ?? [])
        .filter(g => g.start_bp != null)
        .map(g => ({ name: (g.gene_symbol || g.gene_name || '').replace(/\s+[A-Z]{2,4}L?\d{4,}$/i,'').trim() || (g.gene_symbol || g.gene_name || ''), bp: g.start_bp }))
        .filter((lm,i,arr) => arr.findIndex(x => x.name === lm.name) === i)
        .sort((a,b) => a.bp - b.bp);

      const rulerLandmarks = landmarks.map(lm => `
        <div class="mob-rr-lm" style="left:${((lm.bp/GENOME_LEN)*100).toFixed(2)}%">
          <div class="nm">${esc(lm.name)}</div><div class="tick"></div>
        </div>`).join('');

      placeholder.outerHTML = `
        <div class="mob-rr-ruler"><div class="base"></div>${rulerLandmarks}</div>
        <div class="mob-rr-barwrap">
          <div class="mob-rr-kb">${sizeKb.toLocaleString()} kb</div>
          <div class="mob-rr-bar">
            <div class="mob-rr-block" style="left:${x0pct}%;width:${wpct}%;background:${RECOMB_COLOR};"></div>
          </div>
        </div>
        <div class="mob-rr-span">${esc(start)}–${esc(end)}</div>
        <div class="mob-rr-legend">
          <div class="mob-rr-leg"><div class="sw" style="background:${BACKBONE_COLOR};"></div>${esc(BACKBONE_LABEL)} backbone</div>
          <div class="mob-rr-leg"><div class="sw" style="background:${RECOMB_COLOR};"></div>${esc(RECOMB_LABEL)} recombined</div>
          <div class="mob-rr-leg" style="font-weight:600;color:var(--mob-ink-3);">${sizeKb.toLocaleString()} kb · ${pct}% of genome</div>
        </div>`;
    }

    const otherStrain = backboneStrain === 'CT-L2' ? 'CM' : 'CT-L2';
    const { data: strainRows } = await sb.from('strains').select('id,common_name').in('common_name', [backboneStrain, otherStrain]);
    const strainById = Object.fromEntries((strainRows ?? []).map(s => [s.common_name, s.id]));
    const backboneId = strainById[backboneStrain];
    const otherId    = strainById[otherStrain];
    const exPlaceholder = scroll.querySelector('#mob-exchange-placeholder');
    if (!backboneId || !otherId || !exPlaceholder) return;

    const [siRes, eiRes] = await Promise.all([
      sb.from('genes').select('sort_index').eq('locus_tag', start).eq('strain_id', backboneId).maybeSingle(),
      sb.from('genes').select('sort_index').eq('locus_tag', end  ).eq('strain_id', backboneId).maybeSingle(),
    ]);
    const si = siRes.data?.sort_index; const ei = eiRes.data?.sort_index;
    if (si == null || ei == null) { exPlaceholder.textContent = 'Gene exchange data unavailable'; return; }

    const gf = 'id,locus_tag,gene_name,product,functional_category';
    const { data: backboneGenes } = await sb.from('genes').select(gf)
      .eq('strain_id', backboneId).gte('sort_index', Math.min(si,ei)).lte('sort_index', Math.max(si,ei)).order('sort_index');
    if (!backboneGenes?.length) { exPlaceholder.textContent = 'No genes in range'; return; }

    const backboneIds = backboneGenes.map(g => g.id);
    const [orthA, orthB] = await Promise.all([
      sb.from('orthologs').select('gene_id_a,genes!gene_id_b(id,locus_tag,gene_name,product,functional_category)').in('gene_id_a', backboneIds).eq('strain_id_b', otherId),
      sb.from('orthologs').select('gene_id_b,genes!gene_id_a(id,locus_tag,gene_name,product,functional_category)').in('gene_id_b', backboneIds).eq('strain_id_a', otherId),
    ]);
    const orthologMap = new Map();
    for (const o of (orthA.data ?? [])) if (o.genes) orthologMap.set(String(o.gene_id_a), o.genes);
    for (const o of (orthB.data ?? [])) if (o.genes) orthologMap.set(String(o.gene_id_b), o.genes);

    const withOrth    = backboneGenes.filter(g => orthologMap.has(String(g.id))).length;
    const withoutOrth = backboneGenes.length - withOrth;
    const swapIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b9c2bc" stroke-width="2" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>`;

    const colHead = `
      <div class="mob-gx-colhead">
        <div class="h" style="color:var(--mob-s-l2);"><b>${esc(isL2Backbone ? 'CT-L2' : 'CM')}</b><span style="color:var(--mob-ink-3);">backbone</span></div>
        <div style="flex:0 0 auto;color:var(--mob-ink-3);font-size:9px;">⇄</div>
        <div class="h" style="color:var(--mob-s-cm);justify-content:flex-end;"><span style="color:var(--mob-ink-3);">recombined</span><b>${esc(isL2Backbone ? 'CM' : 'CT-L2')}</b></div>
      </div>`;

    const gxRows = backboneGenes.map(g => {
      const ortho  = orthologMap.get(String(g.id));
      const color  = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
      const noOrth = !ortho;
      return `
        <div class="mob-gx-row${noOrth?' noortho':''}">
          <div class="mob-gx-bar" style="background:${noOrth?'#d99a3e':color};"></div>
          <div class="mob-gx-main">
            <div class="mob-gx-pair">
              <div class="mob-gx-side"><span class="mob-gx-loc">${esc(g.locus_tag)}</span>${g.gene_name?`<span class="mob-gx-sym">${esc(g.gene_name)}</span>`:''}</div>
              <div class="mob-gx-arrow">${swapIcon}</div>
              <div class="mob-gx-side r">${noOrth?`<span class="mob-gx-none">no CM ortholog</span>`:`<span class="mob-gx-loc">${esc(ortho.locus_tag)}</span>${ortho.gene_name?`<span class="mob-gx-sym">${esc(ortho.gene_name)}</span>`:''}`}</div>
            </div>
            <div class="mob-gx-prod">${esc(g.product ?? '')}</div>
          </div>
        </div>`;
    }).join('');

    const needsScroll = backboneGenes.length > 4;
    exPlaceholder.outerHTML = `
      <div style="margin-top:8px;font-size:12px;color:var(--mob-ink-3);">
        ${backboneGenes.length} genes · <span style="color:var(--mob-green-ink);">${withOrth} with ${esc(otherStrain)} orthologs</span>
        ${withoutOrth ? ` · <span style="color:#c2702b;">${withoutOrth} without ortholog</span>` : ''}
      </div>
      <div class="mob-tg-win" style="margin-top:10px;">
        ${colHead}
        <div style="max-height:${needsScroll?'250px':'none'};overflow-y:${needsScroll?'auto':'visible'};">
          ${gxRows}
        </div>
      </div>`;

  } catch (err) {
    console.error('[ChlamAtlas] _mobInjectChimeraSections:', err);
    const ph = scroll.querySelector('#mob-chimera-placeholder') ?? scroll.querySelector('#mob-exchange-placeholder');
    if (ph) ph.textContent = 'Error loading chimera data.';
  }
}

// ─── Entry point ──────────────────────────────────────────

export function renderMutants(container) {
  _container = container;
  _collection = window.__mutantCollection ?? 'CT_L2';
  _sortField = 'locus_tag';
  _sortAsc = true;
  _total = 0;
  _searchTerm = '';
  _selectedId = null;
  _filters = { favorites: false, type: null, strain: null, category: null, published: null, creator: null, marker: null };
  _creatorOptions = [];
  _markerOptions = [];
  _moreOpen = false;
  _expandedSections = { type: false, strain: false, function: false, published: false, creator: false, marker: false };
  _geneDataMap = new Map();

  if (isMobileViewport()) {
    _renderMobileMutantList(container);
    return;
  }

  // Pre-select a mutant navigated to from another tab (e.g. gene detail Mutants panel)
  if (window.__openMutantId) {
    _selectedId = window.__openMutantId;
    delete window.__openMutantId;
  }

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
        <div id="mut-filter-bar" style="flex-shrink:0;"></div>

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

  // Fav star delegation for mutant list rows
  document.getElementById('mut-list').addEventListener('click', async e => {
    const favBtn = e.target.closest('.fav-btn');
    if (!favBtn) return;
    e.stopPropagation();
    if (!state.user) { window.__showAuthModal?.('signin'); return; }
    const mutantId = favBtn.dataset.id;
    const nowFav   = await toggleFavoriteDB('mutant', mutantId);
    favBtn.textContent = nowFav ? '★' : '☆';
    favBtn.style.color = nowFav ? '#f59e0b' : '#e5e7eb';
    favBtn.title       = nowFav ? 'Remove from favorites' : 'Add to favorites';
    // Sync hero star if this mutant is open
    const heroFav = document.getElementById('mut-fav-btn');
    if (heroFav && String(heroFav.dataset.id) === String(mutantId)) {
      heroFav.textContent = nowFav ? '★' : '☆';
      heroFav.style.color = nowFav ? '#f59e0b' : '#e5e7eb';
    }
    // If favorites filter is active, remove unfavorited rows from view
    if (_filters.favorites && !nowFav) {
      favBtn.closest('.mut-row')?.remove();
    }
  });
}

function showCollectionDropdown(anchor) {
  const openPop = window.__openNavPopover;
  if (!openPop) return;

  openPop(anchor, `
    <div class="nav-popover-label">Collections</div>
    ${COLLECTIONS.map(c => `
      <button class="nav-popover-row" data-collection="${c.id}">
        <img style="width:24px;height:24px;object-fit:contain;" src="${c.icon}" alt="">
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
  const bar = document.getElementById('mut-filter-bar');
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
  const markerLabel  = _filters.marker ?? null;

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
      ${_filters.published !== null ? `<button data-clear-published style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-family:inherit;">${_filters.published ? 'Published' : 'Unpublished'} ×</button>` : ''}
      ${_filters.creator ? `<button data-clear-creator style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #e9d5ff;background:#faf5ff;color:#6b21a8;cursor:pointer;white-space:nowrap;font-family:inherit;">👤 ${esc(_filters.creator)} ×</button>` : ''}
      ${markerLabel  ? `<button data-clear-marker  style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;border:1px solid #99f6e4;background:#f0fdfa;color:#0f766e;cursor:pointer;white-space:nowrap;font-family:inherit;">🏷 ${esc(markerLabel)} ×</button>` : ''}
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
      ${groupHead('published', '🔒', 'Status', secOpen.published)}
      <div style="display:${secOpen.published ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;">
        ${['Published', 'Unpublished'].map(label => {
          const val = label === 'Published';
          const a   = _filters.published === val;
          return `<button data-pub-filter="${val}"
            style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:inherit;
                   border:1px solid ${a ? '#bbf7d0' : '#e5e7eb'};background:${a ? '#f0fdf4' : 'white'};color:${a ? '#16a34a' : '#9ca3af'};">
            ${label}${a ? ' ×' : ''}
          </button>`;
        }).join('')}
      </div>
      ${groupHead('creator', '👤', 'Creator', secOpen.creator)}
      <div style="display:${secOpen.creator ? 'block' : 'none'};padding-bottom:4px;">
        <div style="position:relative;display:inline-block;">
          <button id="mut-creator-btn"
            style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap;cursor:pointer;font-family:inherit;
                   border:1px solid ${_filters.creator ? '#e9d5ff' : '#e5e7eb'};
                   background:${_filters.creator ? '#faf5ff' : 'white'};
                   color:${_filters.creator ? '#6b21a8' : '#9ca3af'};">
            ${_filters.creator ? `👤 ${esc(_filters.creator)}` : 'Select creator ▾'}
          </button>
          <div id="mut-creator-drop" style="display:none;position:absolute;top:100%;left:0;margin-top:2px;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:50;min-width:160px;overflow:hidden;">
            <div id="mut-creator-list" style="padding:4px 0;"><div style="padding:8px 14px;font-size:11px;color:#9ca3af;">Loading…</div></div>
          </div>
        </div>
      </div>
      ${groupHead('marker', '🏷', 'Marker', secOpen.marker)}
      <div style="display:${secOpen.marker ? 'flex' : 'none'};flex-wrap:wrap;gap:5px;padding-bottom:4px;" id="mut-marker-chips">
        ${_markerOptions.length
          ? _markerOptions.map(mk => {
              const a = _filters.marker === mk;
              return `<button data-marker-chip="${esc(mk)}"
                style="font-size:10.5px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap;cursor:pointer;font-family:'DM Mono',ui-monospace,monospace;
                       border:1px solid ${a ? '#99f6e4' : '#e5e7eb'};background:${a ? '#f0fdfa' : 'white'};color:${a ? '#0f766e' : '#9ca3af'};">
                ${esc(mk)}${a ? ' ×' : ''}
              </button>`;
            }).join('')
          : secOpen.marker ? `<span style="font-size:11px;color:#9ca3af;padding:2px 0;">Loading…</span>` : ''
        }
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
  bar.querySelector('[data-clear-type]')?.addEventListener('click', ()      => { _filters.type = null;      renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-strain]')?.addEventListener('click', ()    => { _filters.strain = null;    renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-category]')?.addEventListener('click', ()  => { _filters.category = null;  renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-published]')?.addEventListener('click', () => { _filters.published = null; renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-creator]')?.addEventListener('click', ()   => { _filters.creator = null;   renderFilterBar(); fetchList(); });
  bar.querySelector('[data-clear-marker]')?.addEventListener('click', ()    => { _filters.marker = null;    renderFilterBar(); fetchList(); });

  // More/Less toggle
  bar.querySelector('#mut-more-btn')?.addEventListener('click', () => {
    _moreOpen = !_moreOpen;
    renderFilterBar();
  });

  // Section expand/collapse — lazy-loads marker options on first open
  bar.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.section;
      if (id in _expandedSections) _expandedSections[id] = !_expandedSections[id];
      if (id === 'marker' && _expandedSections.marker && !_markerOptions.length) {
        const { data } = await sb
          .from('mutants')
          .select('marker')
          .eq('collection', _collection)
          .not('marker', 'is', null);
        _markerOptions = [...new Set((data ?? []).flatMap(r => r.marker ?? []))].sort();
      }
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

  // Published status chips
  bar.querySelectorAll('[data-pub-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.pubFilter === 'true';
      _filters.published = _filters.published === val ? null : val;
      renderFilterBar();
      fetchList();
    });
  });

  // Creator dropdown
  const creatorBtn  = bar.querySelector('#mut-creator-btn');
  const creatorDrop = bar.querySelector('#mut-creator-drop');
  const creatorList = bar.querySelector('#mut-creator-list');
  if (creatorBtn && creatorDrop && creatorList) {
    creatorBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const open = creatorDrop.style.display === 'none';
      creatorDrop.style.display = open ? 'block' : 'none';
      if (!open) return;

      // Lazy-load distinct creators for this collection
      if (!_creatorOptions.length) {
        const { data } = await sb
          .from('mutants')
          .select('creator_name')
          .eq('collection', _collection)
          .not('creator_name', 'is', null);
        _creatorOptions = [...new Set((data ?? []).map(r => r.creator_name))].sort();
      }

      creatorList.innerHTML = _creatorOptions.length
        ? [
            ...(_filters.creator ? [`<button data-creator-pick="" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:11.5px;border:none;cursor:pointer;font-family:inherit;color:#9ca3af;background:none;">Clear filter</button>`] : []),
            ..._creatorOptions.map(name => `
              <button data-creator-pick="${esc(name)}"
                style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:11.5px;border:none;cursor:pointer;font-family:inherit;
                       font-weight:${_filters.creator === name ? '600' : '400'};
                       color:${_filters.creator === name ? '#6b21a8' : '#333'};
                       background:${_filters.creator === name ? '#faf5ff' : 'none'};">
                ${esc(name)}
              </button>`)
          ].join('')
        : `<div style="padding:8px 14px;font-size:11px;color:#9ca3af;">No creators found</div>`;

      creatorList.querySelectorAll('[data-creator-pick]').forEach(row => {
        row.addEventListener('click', () => {
          _filters.creator = row.dataset.creatorPick || null;
          creatorDrop.style.display = 'none';
          renderFilterBar();
          fetchList();
        });
      });

      setTimeout(() => document.addEventListener('click', () => { creatorDrop.style.display = 'none'; }, { once: true }), 0);
    });
  }

  // Marker chips
  bar.querySelectorAll('[data-marker-chip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.markerChip;
      _filters.marker = _filters.marker === val ? null : val;
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
    .select('id,mutant_id,name,mutation_type,is_published,show_in_pipeline,creator_name,target_gene_ids,marker,recombination_start,recombination_end,strains!background_strain_id(common_name)')
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
    displayRows = displayRows.filter(m => state.favorites.mutants.has(String(m.id)));
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
  if (_filters.published !== null) {
    displayRows = displayRows.filter(m => m.is_published === _filters.published);
  }
  if (_filters.creator) {
    displayRows = displayRows.filter(m => m.creator_name === _filters.creator);
  }
  if (_filters.marker) {
    displayRows = displayRows.filter(m => m.marker?.includes(_filters.marker));
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

  // Auto-select first row on initial load, or re-select a pre-chosen ID
  if (!_selectedId && displayRows.length) {
    const first = listEl.querySelector('.mut-row');
    if (first) { first.classList.add('selected'); _selectedId = first.dataset.id; loadDetail(first.dataset.id); }
  } else if (_selectedId) {
    const sel = listEl.querySelector(`[data-id="${_selectedId}"]`);
    if (sel) { sel.classList.add('selected'); loadDetail(_selectedId); }
  }
}

function mutantRowHTML(m, locusTagStr = '') {
  const isChimera   = m.mutation_type === 'chimera';
  const displayName = m.name || m.mutant_id;
  const locusLabel  = locusTagStr
    ? `<div style="font-size:0.625rem;font-family:'DM Mono',ui-monospace,monospace;color:#9ca3af;margin-top:1px;">${locusTagStr}</div>`
    : '';

  // Type pill — shown for CT_L2 and CM where type varies; suppressed for Chimeras/Lucky17
  const showTypePill = m.mutation_type && _collection !== 'Chimeras' && _collection !== 'Lucky17';
  const typeAccent   = showTypePill ? (TYPE_ACCENT[m.mutation_type] ?? DEFAULT_ACCENT) : null;
  const typePill     = showTypePill
    ? `<span style="display:inline-block;font-size:0.5rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:1px 5px;border-radius:4px;background:${typeAccent.badgeBg};color:${typeAccent.badgeText};border:1px solid ${typeAccent.badgeBorder};white-space:nowrap;flex-shrink:0;">${TYPE_LABELS[m.mutation_type] ?? m.mutation_type}</span>`
    : '';

  // Chimera locus span: recombination_start–recombination_end
  const chimeraLocus = isChimera && m.recombination_start && m.recombination_end
    ? `<div style="font-size:0.625rem;font-family:'DM Mono',ui-monospace,monospace;color:#9ca3af;margin-top:1px;">${m.recombination_start}–${m.recombination_end}</div>`
    : '';

  const labPill = !m.is_published
    ? `<span class="mut-lab-pill" style="flex-shrink:0;">🔒 Lab</span>`
    : '';
  const isFav = state.favorites.mutants.has(String(m.id));
  const starEl = state.user
    ? `<button class="fav-btn" data-id="${m.id}"
         style="font-size:11px;color:${isFav ? '#f59e0b' : '#e5e7eb'};background:none;border:none;cursor:pointer;flex-shrink:0;padding:0 0 0 4px;"
         title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '★' : '☆'}</button>`
    : '';

  // Pipeline toggle button — lab members and admins only
  const pipelineBtn = (['lab_member','admin'].includes(state.userRole)) ? `
    <button
      style="display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:4px;cursor:pointer;border-radius:5px;flex-shrink:0;line-height:1;"
      title="${m.show_in_pipeline ? 'In pipeline — click to remove' : 'Not in pipeline — click to add'}"
      data-pipeline-btn="${esc(m.mutant_id)}"
      data-pipeline-val="${m.show_in_pipeline ? '1' : '0'}"
      onclick="event.stopPropagation();window.__mutPipelineToggle('${esc(m.mutant_id)}',${m.show_in_pipeline ? 'true' : 'false'})">
      ${m.show_in_pipeline ? PL_ICON_ON : PL_ICON_OFF}
    </button>` : '';

  // Chimeras: mutant_id (RC1203) is primary, locus span secondary, name tertiary.
  // Other types: long name is primary, mutant_id is the small label above.
  // Type pill lives at row level (not inside name div) to avoid flex-overflow conflicts.
  const nameBlock = isChimera
    ? `<div class="mut-row-name">${m.mutant_id}</div>
       ${chimeraLocus}
       ${m.name && m.name !== m.mutant_id ? `<div style="font-size:0.6875rem;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.name)}</div>` : ''}`
    : `${m.name ? `<div class="mut-row-id">${m.mutant_id}</div>` : ''}
       <div class="mut-row-name">${esc(displayName)}</div>
       ${locusLabel}`;
  return `
    <div class="mut-row" data-id="${m.id}" role="button" tabindex="0">
      <div style="flex:1;min-width:0;overflow:hidden;">
        ${nameBlock}
      </div>
      ${typePill}
      ${labPill}
      ${starEl}
      ${pipelineBtn}
    </div>`;
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
               creator,creator_name,contributed_by,background_strain_id,
               is_published,notes,target_gene_ids,
               recombination_start,recombination_end,ortholog_span_cm,
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
  let neighborhood  = [];
  let neighborhoods = [];
  if (m.target_gene_ids?.length) {
    const { data: geneData } = await sb
      .from('genes')
      .select(`id,locus_tag,gene_name,product,functional_category,is_characterized,sort_index,strain_id,
               proteins(id,localization,
                 alphafold_results(thumbnail_path))`)
      .in('id', m.target_gene_ids);
    genes = (geneData ?? []).sort((a, b) => (a.locus_tag ?? '').localeCompare(b.locus_tag ?? ''));

    // Fetch genomic neighborhood for locus map.
    // 1 gene: ±4 flanking (full-width standalone map).
    // 2 genes: ±2 flanking per gene (compact embedded maps — zoomed in for readability).
    // 3+ genes: no fetch (list layout, no maps).
    if (genes.length === 1 || genes.length === 2) {
      const flank = genes.length === 2 ? 2 : 4;
      const fetchNb = async (g) => {
        if (g.sort_index == null || !g.strain_id) return [];
        const isPlasmid = g.sort_index >= 873;
        const lo = isPlasmid ? 873 : Math.max(0, g.sort_index - flank);
        const hi = isPlasmid ? 880 : g.sort_index + flank;
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
  }

  const isMobile  = window.innerWidth < 768;
  const isChimera = m.mutation_type === 'chimera';

  const chimeraPlaceholder = isChimera
    ? `<div id="chimera-sections-placeholder">
         <div style="padding:10px 16px 14px;font-size:0.8125rem;color:#9ca3af;">Loading recombination data…</div>
       </div>`
    : '';

  rightEl.innerHTML = `
    ${isMobile ? `<div class="mut-mobile-back"><button class="back-btn" id="mut-back-btn">‹ Back</button></div>` : ''}

    ${heroHTML(m, genes)}
    ${isChimera
      ? chimeraPlaceholder
      : geneCardsHTML(genes, neighborhoods, m.mutation_type) +
        (genes.length === 1 ? geneLociMapHTML(genes, neighborhood, m.mutation_type) : '')}
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

  // Async: inject chimera genome map + gene exchange panel, then wire nav
  if (isChimera) {
    const placeholder = document.getElementById('chimera-sections-placeholder');
    if (placeholder) {
      const [mapHTML, exchangeHTML] = await Promise.all([
        chimeraGenomeMapHTML(m),
        chimeraGeneExchangeHTML(m),
      ]);
      placeholder.outerHTML = mapHTML + exchangeHTML;
    }
    // Wire locus-tag navigation for chimera gene exchange panel
    rightEl.querySelectorAll('[data-gene-nav]').forEach(el => {
      el.addEventListener('click', () => {
        window.__geneDetailId = el.dataset.geneNav;
        window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
      });
    });
  } else {
    // Wire "View in Genomes →" buttons for non-chimera mutants
    rightEl.querySelectorAll('[data-gene-nav]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const geneId = btn.dataset.geneNav;
        window.__geneDetailId = geneId;
        window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
      });
    });
  }

  // Edit button — wire to modal; visibility revealed by getSession check
  const editBtn = rightEl.querySelector('#mut-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (!state.user) { window.__showAuthModal?.('signin'); return; }
      openMutantEditModal(m, genes, rightEl);
    });
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid       = session.user.id;
      const isLabPlus = state.userRole === 'admin' || state.userRole === 'lab_member';
      const isOwner   = String(m.creator ?? '') === uid || String(m.contributed_by ?? '') === uid;
      if (isLabPlus || isOwner) editBtn.style.display = 'inline-flex';
    });
  }

  // Wire favorites star
  rightEl.querySelector('#mut-fav-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    if (!state.user) { window.__showAuthModal?.('signin'); return; }
    const btn    = e.currentTarget;
    const id     = btn.dataset.id;
    const nowFav = await toggleFavoriteDB('mutant', id);
    btn.textContent = nowFav ? '★' : '☆';
    btn.title       = nowFav ? 'Remove from favorites' : 'Add to favorites';
    btn.style.color = nowFav ? '#f59e0b' : '#e5e7eb';
    // Sync list row star
    const listFav = document.querySelector(`#mut-list .fav-btn[data-id="${id}"]`);
    if (listFav) {
      listFav.textContent = nowFav ? '★' : '☆';
      listFav.style.color = nowFav ? '#f59e0b' : '#e5e7eb';
      listFav.title       = nowFav ? 'Remove from favorites' : 'Add to favorites';
    }
  });

}

// ─── Detail section builders ──────────────────────────────

function heroHTML(m, genes = []) {
  const displayName  = m.name || m.mutant_id;
  const hasName      = !!m.name;
  const accent       = TYPE_ACCENT[m.mutation_type] ?? DEFAULT_ACCENT;
  const strainLabel  = m.strains?.common_name ?? m.strains?.species ?? '';
  const typeLabel    = TYPE_LABELS[m.mutation_type] ?? m.mutation_type ?? '';
  const isFav        = state.favorites.mutants.has(String(m.id));
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
    ? `<img src="${col.icon}" alt="" style="width:48px;height:48px;object-fit:contain;flex-shrink:0;">`
    : '';

  return `
    <div style="padding:16px 20px 14px;border-bottom:3px solid ${accent.color};background:linear-gradient(150deg,${accent.heroBg} 0%,#ffffff 65%);">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
        ${collIcon}
        <div style="flex:1;min-width:0;">
          ${m.mutation_type === 'chimera'
            ? `<div style="font-size:24px;font-weight:700;color:#111;line-height:1.1;">${m.mutant_id}</div>
               ${m.name ? `<div style="font-size:11px;color:#9ca3af;margin-top:3px;line-height:1.3;word-break:break-all;">${esc(m.name)}</div>` : ''}`
            : `<div style="font-size:24px;font-weight:700;color:#111;line-height:1.1;">${esc(displayName)}</div>
               ${hasName ? `<div style="font-size:10px;font-family:'DM Mono',ui-monospace,monospace;color:#888;margin-top:2px;letter-spacing:0.02em;">${m.mutant_id}</div>` : ''}
               ${locusTagStr ? `<div style="font-size:10px;font-family:'DM Mono',ui-monospace,monospace;color:#aaa;margin-top:1px;letter-spacing:0.02em;">${locusTagStr}</div>` : ''}`}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;padding-top:2px;">
          <button id="mut-edit-btn" style="${btnBase}color:#9ca3af;display:none;" title="Edit">${pencilSvg}</button>
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

function geneCardsHTML(genes, neighborhoods = [], mutationType = '') {
  if (!genes.length) return '';

  const title = `Target Gene${genes.length > 1 ? `s (${genes.length})` : ''}`;

  // 1–2 genes: full cards (side by side if 2)
  if (genes.length <= 2) {
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

// ─── Single-gene map SVG (used inside 2-gene card strips) ────────────────────
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

  // VB_W=300 (half the standalone's 600) so that font sizes render at the same
  // physical pixel size when the card occupies ~half the panel width.
  const VB_W    = 300;
  const VB_H    = 110;
  const SPINE_Y = 52;
  const P_TOP   = 40; const P_BOT = 52;
  const N_TOP   = 54; const N_BOT = 66;
  const TGT_PAD = 3;
  const TIP     = 6;
  const MIN_W   = 18;

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
    const staggerLevels = w < 20 ? 4 : 2;
    const level         = idx % staggerLevels;
    const aboveStagger  = -(level * 11);
    const belowStagger  =   level * 11;
    const nameY  = isPlus ? ktop - 4 + aboveStagger : kbot + 10 + belowStagger;
    const locusY = isPlus ? kbot + 10 + belowStagger  : ktop - 4 + aboveStagger;

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

// ─── Chimera genome map ───────────────────────────────────
// Shows the backbone genome as a full-width bar with the recombined block
// overlaid at the proportional genomic position. Handles circular chromosomes
// (block wraps end→start) by drawing two segments.
async function chimeraGenomeMapHTML(m) {
  const start = m.recombination_start;
  const end   = m.recombination_end;
  if (!start || !end) return '';

  const backboneStrain = m.strains?.common_name ?? 'CT-L2';
  const isL2Backbone   = backboneStrain === 'CT-L2';

  const GENOME_LEN      = isL2Backbone ? 1_044_459 : 1_072_949;
  const BACKBONE_COLOR  = isL2Backbone ? '#16a34a' : '#2563eb';
  const RECOMB_COLOR    = isL2Backbone ? '#2563eb' : '#16a34a';
  const BACKBONE_LABEL  = isL2Backbone ? 'CT-L2' : 'CM';
  const RECOMB_LABEL    = isL2Backbone ? 'CM' : 'CT-L2';

  // Fetch start gene and end gene positions
  const strainColName = 'strains!inner(common_name)';
  const [startRes, endRes] = await Promise.all([
    sb.from('genes')
      .select(`start_bp,end_bp,sort_index,${strainColName}`)
      .eq('locus_tag', start)
      .eq('strains.common_name', backboneStrain)
      .single(),
    sb.from('genes')
      .select(`start_bp,end_bp,sort_index,${strainColName}`)
      .eq('locus_tag', end)
      .eq('strains.common_name', backboneStrain)
      .single(),
  ]);

  const startGene = startRes.data;
  const endGene   = endRes.data;
  if (!startGene || !endGene) return '';

  // Fetch landmark gene positions for ruler using strain_id directly (avoids join filter issues).
  // Query by both gene_name and gene_symbol to maximize hit rate.
  const LANDMARKS = ['ompA', 'incA', 'gyrA', 'rpoB', 'secY'];
  const lmOr = LANDMARKS.map(n => `gene_name.eq.${n},gene_symbol.eq.${n}`).join(',');
  const { data: lmData } = await sb
    .from('genes')
    .select('gene_name,gene_symbol,start_bp')
    .eq('strain_id', m.background_strain_id)
    .or(lmOr);

  // For landmark labels prefer gene_symbol (short, e.g. "ompA") over gene_name which
  // may contain the locus_tag appended (e.g. "ompA CTL0368").
  const landmarks = (lmData ?? [])
    .filter(g => g.start_bp != null)
    .map(g => {
      const raw = g.gene_symbol || g.gene_name || '';
      // Strip trailing locus-tag-like token (e.g. "ompA CTL0368" → "ompA")
      const name = raw.replace(/\s+[A-Z]{2,4}L?\d{4,}$/i, '').trim() || raw;
      return { name, bp: g.start_bp };
    })
    .filter((lm, i, arr) => arr.findIndex(x => x.name === lm.name) === i) // deduplicate
    .sort((a, b) => a.bp - b.bp);

  const startBp = startGene.start_bp ?? 0;
  const endBp   = endGene.end_bp   ?? startGene.end_bp ?? 0;

  // Detect circular wrap: end gene sorts before start gene
  const isCircular = endGene.sort_index < startGene.sort_index;

  // SVG dimensions
  const W      = 560;
  const BAR_Y  = 38;
  const BAR_H  = 18;
  const RULER_Y = BAR_Y - 8;

  const bpToX = bp => Math.round((bp / GENOME_LEN) * W);

  // Build recombined block(s)
  let blocks = '';
  if (isCircular) {
    const x1 = bpToX(startBp);
    const x4 = bpToX(endBp);
    blocks = `
      <rect x="${x1}" y="${BAR_Y}" width="${W - x1}" height="${BAR_H}" fill="${RECOMB_COLOR}" rx="2"/>
      <rect x="0" y="${BAR_Y}" width="${x4}" height="${BAR_H}" fill="${RECOMB_COLOR}" rx="2"/>`;
  } else {
    const x1 = bpToX(startBp);
    const x2 = bpToX(endBp);
    blocks = `<rect x="${x1}" y="${BAR_Y}" width="${Math.max(x2 - x1, 4)}" height="${BAR_H}" fill="${RECOMB_COLOR}" rx="2"/>`;
  }

  // Ruler tick marks + labels — stagger adjacent labels that would overlap.
  const lmXs = landmarks.map(lm => bpToX(lm.bp));
  const rulerTicks = landmarks.map((lm, i) => {
    const x = lmXs[i];
    // Alternate label rows when previous landmark is within 55px
    const tooClose = i > 0 && Math.abs(x - lmXs[i - 1]) < 42;
    const labelY   = tooClose ? RULER_Y - 13 : RULER_Y - 3;
    const anchor   = x < 20 ? 'start' : x > W - 20 ? 'end' : 'middle';
    return `
      <line x1="${x}" y1="${RULER_Y}" x2="${x}" y2="${RULER_Y + 5}" stroke="#bbb" stroke-width="1"/>
      <text x="${x}" y="${labelY}" text-anchor="${anchor}"
            font-family="DM Sans,sans-serif" font-size="7.5" font-style="italic" fill="#888">${lm.name}</text>`;
  }).join('');

  const kbLabel = `${(GENOME_LEN / 1000).toFixed(0)} kb`;

  const spanBp = isCircular
    ? (GENOME_LEN - startBp) + endBp
    : endBp - startBp;
  const pct    = ((spanBp / GENOME_LEN) * 100).toFixed(1);
  const spanKb = (spanBp / 1000).toFixed(0);

  const lx1  = bpToX(startBp);
  const lx2  = bpToX(endBp);
  const tagY = BAR_Y + BAR_H + 12;

  // Stagger labels vertically if they'd overlap, and anchor edge labels to stay in-bounds.
  const labelsOverlap = Math.abs(lx2 - lx1) < 70;
  const anchor1 = lx1 < 35 ? 'start' : 'middle';
  const anchor2 = lx2 > W - 35 ? 'end' : 'middle';
  const tagY2   = labelsOverlap ? tagY + 11 : tagY;

  const tagLabels = `
    <text x="${lx1}" y="${tagY}" text-anchor="${anchor1}"
          font-family="DM Sans,sans-serif" font-size="7.5" fill="#555">${start}</text>
    <text x="${lx2}" y="${tagY2}" text-anchor="${anchor2}"
          font-family="DM Sans,sans-serif" font-size="7.5" fill="#555">${end}</text>`;

  const svgH = BAR_Y + BAR_H + (labelsOverlap ? 38 : 26);

  const svg = `<svg viewBox="0 0 ${W} ${svgH}" xmlns="http://www.w3.org/2000/svg"
                    style="width:100%;height:auto;display:block;overflow:visible;">
    <line x1="0" y1="${RULER_Y}" x2="${W}" y2="${RULER_Y}" stroke="#d1d5db" stroke-width="1.5"/>
    ${rulerTicks}
    <text x="${W}" y="${RULER_Y - 2}" text-anchor="end"
          font-family="DM Mono,monospace" font-size="7" fill="#bbb">${kbLabel}</text>
    <rect x="0" y="${BAR_Y}" width="${W}" height="${BAR_H}" fill="${BACKBONE_COLOR}" rx="3" opacity="0.85"/>
    ${blocks}
    ${tagLabels}
  </svg>`;

  const legend = `
    <div style="display:flex;gap:12px;align-items:center;margin-top:6px;font-size:0.625rem;color:#6b7280;">
      <span style="display:flex;align-items:center;gap:4px;">
        <span style="display:inline-block;width:12px;height:8px;background:${BACKBONE_COLOR};border-radius:2px;"></span>
        ${BACKBONE_LABEL} backbone
      </span>
      <span style="display:flex;align-items:center;gap:4px;">
        <span style="display:inline-block;width:12px;height:8px;background:${RECOMB_COLOR};border-radius:2px;"></span>
        ${RECOMB_LABEL} recombined
      </span>
      <span style="color:#9ca3af;">${spanKb} kb · ${pct}% of genome${isCircular ? ' · circular wrap' : ''}</span>
    </div>`;

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Recombined Region')}
    <div style="padding:10px 16px 14px;">
      <div class="chimera-map-wrap">
        ${svg}
        ${legend}
      </div>
    </div>
  </div>`;
}

// ─── Chimera gene exchange panel ─────────────────────────────────
async function chimeraGeneExchangeHTML(m) {
  const startTag = m.recombination_start;
  const endTag   = m.recombination_end;
  if (!startTag || !endTag) return '';

  const backboneStrain = m.strains?.common_name ?? 'CT-L2';
  const otherStrain    = backboneStrain === 'CT-L2' ? 'CM' : 'CT-L2';
  const isL2Backbone   = backboneStrain === 'CT-L2';

  // Fetch both strain UUIDs
  const { data: strainRows } = await sb
    .from('strains')
    .select('id,common_name')
    .in('common_name', [backboneStrain, otherStrain]);

  const strainById = Object.fromEntries((strainRows ?? []).map(s => [s.common_name, s.id]));
  const backboneId = strainById[backboneStrain];
  const otherId    = strainById[otherStrain];
  if (!backboneId || !otherId) return '';

  // Resolve sort_index range for start/end locus tags
  const [startRes, endRes] = await Promise.all([
    sb.from('genes').select('sort_index').eq('locus_tag', startTag).eq('strain_id', backboneId).single(),
    sb.from('genes').select('sort_index').eq('locus_tag', endTag  ).eq('strain_id', backboneId).single(),
  ]);

  const si = startRes.data?.sort_index;
  const ei = endRes.data?.sort_index;
  if (si == null || ei == null) return '';

  const isCircular = ei < si;

  // Fetch backbone genes in range — two queries for circular case
  const geneFields = 'id,locus_tag,gene_name,product,functional_category';
  let backboneGenes = [];

  if (isCircular) {
    const { data: maxRow } = await sb
      .from('genes')
      .select('sort_index')
      .eq('strain_id', backboneId)
      .order('sort_index', { ascending: false })
      .limit(1)
      .single();
    const maxIdx = maxRow?.sort_index ?? 872;

    const [segA, segB] = await Promise.all([
      sb.from('genes').select(geneFields).eq('strain_id', backboneId)
        .gte('sort_index', si).lte('sort_index', maxIdx).order('sort_index'),
      sb.from('genes').select(geneFields).eq('strain_id', backboneId)
        .gte('sort_index', 0).lte('sort_index', ei).order('sort_index'),
    ]);
    backboneGenes = [...(segA.data ?? []), ...(segB.data ?? [])];
  } else {
    const { data } = await sb.from('genes').select(geneFields)
      .eq('strain_id', backboneId)
      .gte('sort_index', si).lte('sort_index', ei)
      .order('sort_index');
    backboneGenes = data ?? [];
  }

  if (!backboneGenes.length) return '';

  const backboneGeneIds = backboneGenes.map(g => g.id);

  // Batch-fetch orthologs in both directions (orthologs table has no enforced direction)
  const [orthA, orthB] = await Promise.all([
    sb.from('orthologs')
      .select('gene_id_a,genes!gene_id_b(id,locus_tag,gene_name,product,functional_category)')
      .in('gene_id_a', backboneGeneIds)
      .eq('strain_id_b', otherId),
    sb.from('orthologs')
      .select('gene_id_b,genes!gene_id_a(id,locus_tag,gene_name,product,functional_category)')
      .in('gene_id_b', backboneGeneIds)
      .eq('strain_id_a', otherId),
  ]);

  // Build map: backbone gene UUID → ortholog gene data
  const orthologMap = new Map();
  for (const o of (orthA.data ?? [])) {
    if (o.genes) orthologMap.set(o.gene_id_a, o.genes);
  }
  for (const o of (orthB.data ?? [])) {
    if (o.genes) orthologMap.set(o.gene_id_b, o.genes);
  }

  const withOrtholog    = backboneGenes.filter(g => orthologMap.has(g.id)).length;
  const withoutOrtholog = backboneGenes.length - withOrtholog;

  const BACKBONE_COLOR = isL2Backbone ? '#16a34a' : '#2563eb';
  const OTHER_COLOR    = isL2Backbone ? '#2563eb' : '#16a34a';
  const BACKBONE_ICON  = isL2Backbone
    ? '/design/icons_transparent/L2icon_transparent.png'
    : '/design/icons_transparent/CMicon_transparent.png';
  const OTHER_ICON     = isL2Backbone
    ? '/design/icons_transparent/CMicon_transparent.png'
    : '/design/icons_transparent/L2icon_transparent.png';

  const iconStyle = 'width:24px;height:24px;object-fit:contain;vertical-align:middle;';

  const catCell = (g, side) => {
    const isRight = side === 'right';
    // Both columns use border-left for the category color accent.
    if (!g) {
      return isRight
        ? `<div class="chimera-gene-cell right" style="border-left-color:#f3f4f6;justify-content:center;">
             <span class="chimera-no-ortholog-pill">no ortholog</span>
           </div>`
        : `<div class="chimera-gene-cell" style="border-left-color:#f3f4f6;"></div>`;
    }
    const catColor = CATEGORY_COLORS[g.functional_category] ?? CATEGORY_COLOR_DEFAULT;
    // Gene names in CT-L2 are often stored as "geneName locusTag" (e.g. "map CTL0224").
    // Extract just the gene name part by stripping any trailing locus-tag-like token.
    let cleanName = g.gene_name ?? '';
    if (g.locus_tag && cleanName.endsWith(g.locus_tag)) {
      cleanName = cleanName.slice(0, -g.locus_tag.length).trim();
    }
    if (!cleanName || cleanName === g.locus_tag) cleanName = '';
    const nameInline = cleanName
      ? `<span class="chimera-gene-name-inline">${esc(cleanName)}</span>` : '';
    const productEl = g.product
      ? `<div class="chimera-gene-product">${esc(g.product.substring(0, 50))}${g.product.length > 50 ? '…' : ''}</div>` : '';
    return `
      <div class="chimera-gene-cell${isRight ? ' right' : ''}" style="border-left-color:${catColor};">
        <div style="display:flex;align-items:baseline;gap:5px;flex-wrap:nowrap;overflow:hidden;">
          <span class="chimera-gene-locus" data-gene-nav="${g.id}">${esc(g.locus_tag ?? '?')}</span>
          ${nameInline}
        </div>
        ${productEl}
      </div>`;
  };

  const rows = backboneGenes.map(bg => {
    const og     = orthologMap.get(bg.id) ?? null;
    const noOrth = !og;
    return `
      <div class="chimera-exchange-row${noOrth ? ' no-ortholog' : ''}">
        ${catCell(bg, 'left')}
        <div class="chimera-exchange-divider">↔</div>
        ${catCell(og, 'right')}
      </div>`;
  }).join('');

  const noOrthLabel = withoutOrtholog
    ? ` · <span style="color:#92400e;">${withoutOrtholog} without ortholog</span>`
    : '';
  const summary = `<span style="font-size:0.75rem;color:#6b7280;font-weight:400;">
    ${backboneGenes.length} genes · ${withOrtholog} with ${otherStrain} ortholog${withOrtholog !== 1 ? 's' : ''}${noOrthLabel}
  </span>`;

  const header = `
    <div class="chimera-exchange-header">
      <div class="chimera-exchange-col-head">
        <img src="${BACKBONE_ICON}" alt="" style="${iconStyle}">
        <span style="color:${BACKBONE_COLOR};font-size:0.8125rem;">${backboneStrain}</span>
        <span style="color:#9ca3af;font-weight:400;font-size:0.75rem;">backbone</span>
      </div>
      <div></div>
      <div class="chimera-exchange-col-head">
        <img src="${OTHER_ICON}" alt="" style="${iconStyle}">
        <span style="color:${OTHER_COLOR};font-size:0.8125rem;">${otherStrain}</span>
        <span style="color:#9ca3af;font-weight:400;font-size:0.75rem;">recombined in</span>
      </div>
    </div>`;

  return `
  <div style="background:white;border-bottom:1px solid #f0f0f0;">
    ${mutSectionHead('Gene Exchange Region', summary)}
    <div style="padding:0 16px 14px;">
      <div class="chimera-exchange-panel">
        ${header}
        ${rows}
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

// ─── Mutant edit modal ────────────────────────────────────

async function openMutantEditModal(m, genes, rightEl, afterSaveFn = null) {
  document.getElementById('mut-edit-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mut-edit-overlay';

  if (isMobileViewport()) {
    overlay.className = 'mob-sheet-backdrop';
    overlay.style.cssText = 'z-index:2000;';
  } else {
    overlay.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;',
      'display:flex;align-items:center;justify-content:center;padding:16px;',
    ].join('');
  }

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.innerHTML = buildMutantEditHtml(m, genes);
  document.body.appendChild(overlay);

  const onSave = afterSaveFn ?? (() => loadDetail(m.id));
  wireMutantEditEvents(overlay, m, genes, closeModal, rightEl, onSave);
}

function buildMutantEditHtml(m, genes) {
  const isAdmin = state.userRole === 'admin';

  const field = (label, name, value, extra = '') =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <input name="${name}" value="${esc(value ?? '')}" ${extra}
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
    </div>`;

  const selectEl = (label, name, options, current) =>
    `<div>
      <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
        letter-spacing:.05em;color:#64748b;margin-bottom:4px;">${label}</label>
      <select name="${name}"
        style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
        font-size:12px;color:#111;box-sizing:border-box;background:#fff;">
        <option value="" ${!current ? 'selected' : ''}>— not set —</option>
        ${options.map(([val, label]) =>
          `<option value="${esc(val)}" ${current === val ? 'selected' : ''}>${esc(label)}</option>`
        ).join('')}
      </select>
    </div>`;

  const markerDisplay = Array.isArray(m.marker) ? m.marker.join(', ') : (m.marker ?? '');

  const existingGeneRows = genes.map(g => `
    <div class="mem-gene-existing" data-gene-id="${esc(g.id)}"
      style="display:flex;align-items:center;justify-content:space-between;
             background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;
             padding:5px 8px;margin-bottom:4px;">
      <span style="font-size:10px;font-family:'DM Mono',monospace;color:#111;">${esc(g.locus_tag)}</span>
      <span style="font-size:10px;color:#6b7280;">${esc(g.gene_name ?? '')}</span>
      <button type="button" class="mem-gene-remove" data-gene-id="${esc(g.id)}"
        style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;line-height:1;padding:0 2px;">×</button>
    </div>`).join('');

  const adminSection = isAdmin ? `
    <!-- Admin: contributed_by -->
    <div style="border-top:1px solid #f0f0f0;margin-top:4px;padding-top:12px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px;">Admin</div>
      <div>
        <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
          letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Contributed By (user)</label>
        <div id="mem-contrib-display" style="font-size:10px;color:#6b7280;margin-bottom:6px;">
          ${m.contributed_by ? `UUID: ${esc(m.contributed_by)}` : '— not set —'}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="mem-contrib-search" placeholder="Search by email…"
            style="flex:1;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 9px;
            font-size:11px;color:#111;box-sizing:border-box;">
          <button type="button" id="mem-contrib-lookup"
            style="background:#0f172a;border:none;border-radius:7px;padding:6px 12px;
            font-size:10px;color:white;font-weight:600;cursor:pointer;white-space:nowrap;">
            Look up
          </button>
        </div>
        <div id="mem-contrib-result" style="margin-top:6px;display:none;"></div>
        <input type="hidden" id="mem-contrib-value" value="${esc(m.contributed_by ?? '')}">
      </div>
    </div>
    <!-- Admin: publish toggle -->
    <div style="margin-top:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="mem-published" ${m.is_published ? 'checked' : ''}>
        <span style="font-size:11px;font-weight:600;color:#374151;">Published (visible to public)</span>
      </label>
    </div>` : '';

  return `
    <div id="mut-edit-modal"
      style="background:white;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.25);
             width:440px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;
             font-size:12px;overflow:hidden;">

      <!-- Header -->
      <div style="padding:16px 18px 12px;border-bottom:1px solid #f0f0f0;
        display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#111;">Edit Mutant</div>
          <div style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:1px;">
            ${esc(m.mutant_id)}
          </div>
        </div>
        <button id="mem-close"
          style="font-size:18px;color:#d1d5db;background:none;border:none;cursor:pointer;line-height:1;padding:0;">✕</button>
      </div>

      <!-- Body (scrollable) -->
      <div style="padding:16px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">

        ${field('Name', 'name', m.name)}
        ${field('Creator Name', 'creator_name', m.creator_name)}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${selectEl('Mutation Type', 'mutation_type', [
            ['transposon','Transposon'],['deletion','Deletion'],
            ['chemical','Chemical'],['intron','Intron'],['recombination','Recombination']
          ], m.mutation_type)}
          ${selectEl('Collection', 'collection', [
            ['CT_L2','CT/L2'],['CM','C. muridarum'],
            ['Lucky17','Lucky 17'],['Chimeras','Chimeras']
          ], m.collection)}
        </div>

        ${field('Plasmid Used', 'plasmid_used', m.plasmid_used)}
        ${field('Marker(s)', 'marker', markerDisplay, 'placeholder="e.g. aadA, gfp"')}

        <div>
          <label style="display:block;font-size:9px;font-weight:700;text-transform:uppercase;
            letter-spacing:.05em;color:#64748b;margin-bottom:4px;">Notes</label>
          <textarea name="notes" rows="3"
            style="width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:7px 9px;
            font-size:12px;color:#111;box-sizing:border-box;resize:vertical;">${esc(m.notes ?? '')}</textarea>
        </div>

        <!-- Target Genes -->
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
            color:#64748b;margin-bottom:6px;">Target Genes</div>
          <div id="mem-gene-list" style="margin-bottom:8px;">
            ${existingGeneRows}
          </div>
          <!-- Gene search -->
          <div style="display:flex;gap:6px;margin-bottom:4px;">
            <input id="mem-gene-input" placeholder="Locus tag (e.g. CT142)"
              style="flex:1;border:1.5px solid #e2e8f0;border-radius:7px;padding:6px 9px;
              font-size:11px;color:#111;box-sizing:border-box;">
            <button type="button" id="mem-gene-lookup"
              style="background:#0f172a;border:none;border-radius:7px;padding:6px 12px;
              font-size:10px;color:white;font-weight:600;cursor:pointer;white-space:nowrap;">
              Look up
            </button>
          </div>
          <div id="mem-gene-error" style="font-size:10px;color:#dc2626;display:none;margin-bottom:4px;"></div>
          <div id="mem-gene-result" style="display:none;"></div>
        </div>

        ${adminSection}

      </div>

      <!-- Footer -->
      <div style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;
        justify-content:flex-end;gap:8px;flex-shrink:0;">
        <button id="mem-cancel"
          style="border:1.5px solid #e2e8f0;border-radius:8px;padding:7px 16px;
          font-size:11px;font-weight:600;color:#374151;background:white;cursor:pointer;">
          Cancel
        </button>
        <button id="mem-save"
          style="background:#059669;border:none;border-radius:8px;padding:7px 16px;
          font-size:11px;font-weight:600;color:white;cursor:pointer;">
          Save
        </button>
      </div>
    </div>`;
}

function wireMutantEditEvents(overlay, m, initialGenes, closeModal, rightEl, afterSaveFn = null) {
  overlay.querySelector('#mem-close')?.addEventListener('click', closeModal);
  overlay.querySelector('#mem-cancel')?.addEventListener('click', closeModal);

  const isAdmin = state.userRole === 'admin';

  // Track staged gene changes
  const stagedGenes = [...initialGenes];  // mutable copy reflecting current desired state

  // Remove existing gene
  overlay.querySelector('#mem-gene-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.mem-gene-remove');
    if (!btn) return;
    const geneId = btn.dataset.geneId;
    const idx = stagedGenes.findIndex(g => g.id === geneId);
    if (idx !== -1) stagedGenes.splice(idx, 1);
    btn.closest('.mem-gene-existing')?.remove();
  });

  // Gene lookup
  overlay.querySelector('#mem-gene-lookup')?.addEventListener('click', async () => {
    const input    = overlay.querySelector('#mem-gene-input');
    const errorEl  = overlay.querySelector('#mem-gene-error');
    const resultEl = overlay.querySelector('#mem-gene-result');
    const rawTag   = (input?.value ?? '').trim().toUpperCase();

    errorEl.style.display  = 'none';
    resultEl.style.display = 'none';
    resultEl.innerHTML     = '';

    if (!rawTag) {
      errorEl.textContent   = 'Enter a locus tag.';
      errorEl.style.display = 'block';
      return;
    }

    const lookupBtn = overlay.querySelector('#mem-gene-lookup');
    lookupBtn.textContent = 'Looking up…';
    lookupBtn.disabled    = true;

    try {
      const { data: geneMatches } = await sb
        .from('genes')
        .select('id, locus_tag, gene_name, strains(common_name)')
        .ilike('locus_tag', rawTag)
        .eq('strain_id', m.background_strain_id)
        .limit(5);

      const found = geneMatches?.[0] ?? null;
      if (!found) {
        errorEl.textContent   = `No gene found with locus tag "${rawTag}" in this strain.`;
        errorEl.style.display = 'block';
        return;
      }

      if (stagedGenes.some(g => g.id === found.id)) {
        errorEl.textContent   = 'This gene is already in the target list.';
        errorEl.style.display = 'block';
        return;
      }

      resultEl.innerHTML = `
        <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:5px;padding:7px 9px;">
          <div style="font-size:9px;font-weight:600;color:#065f46;">✓ Found: ${esc(found.locus_tag)}</div>
          <div style="font-size:9px;color:#047857;margin-top:2px;">
            ${esc(found.gene_name ?? 'Hypothetical protein')} · ${esc(found.strains?.common_name ?? '')}
          </div>
          <button type="button" id="mem-gene-add"
            data-gene-id="${esc(found.id)}"
            data-locus-tag="${esc(found.locus_tag)}"
            data-gene-name="${esc(found.gene_name ?? '')}"
            style="margin-top:6px;background:#059669;border:none;border-radius:4px;
            padding:3px 9px;font-size:9px;color:white;font-weight:600;cursor:pointer;">
            Add this gene
          </button>
        </div>`;
      resultEl.style.display = 'block';

      resultEl.querySelector('#mem-gene-add')?.addEventListener('click', e => {
        const b = e.currentTarget;
        const newGene = { id: b.dataset.geneId, locus_tag: b.dataset.locusTag, gene_name: b.dataset.geneName };
        stagedGenes.push(newGene);

        const listEl = overlay.querySelector('#mem-gene-list');
        const row = document.createElement('div');
        row.className = 'mem-gene-existing';
        row.dataset.geneId = newGene.id;
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#f0fdf4;border:1px solid #6ee7b7;border-radius:5px;padding:5px 8px;margin-bottom:4px;';
        row.innerHTML = `
          <span style="font-size:10px;font-family:'DM Mono',monospace;color:#111;">${esc(newGene.locus_tag)}</span>
          <span style="font-size:10px;color:#6b7280;">${esc(newGene.gene_name)}</span>
          <button type="button" class="mem-gene-remove" data-gene-id="${esc(newGene.id)}"
            style="font-size:12px;color:#ef4444;background:none;border:none;cursor:pointer;line-height:1;padding:0 2px;">×</button>`;
        listEl?.appendChild(row);

        input.value            = '';
        resultEl.style.display = 'none';
        resultEl.innerHTML     = '';
      });
    } finally {
      lookupBtn.textContent = 'Look up';
      lookupBtn.disabled    = false;
    }
  });

  // Admin: contributed_by user lookup
  if (isAdmin) {
    overlay.querySelector('#mem-contrib-lookup')?.addEventListener('click', async () => {
      const input    = overlay.querySelector('#mem-contrib-search');
      const resultEl = overlay.querySelector('#mem-contrib-result');
      const query    = (input?.value ?? '').trim();
      if (!query) return;

      resultEl.style.display = 'none';
      resultEl.innerHTML     = '';

      const safeQuery = query.replace(/[%_]/g, '\\$&');
      const { data: users } = await sb
        .from('users')
        .select('id, display_name, email')
        .or(`email.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
        .limit(5);

      if (!users?.length) {
        resultEl.innerHTML     = `<div style="font-size:10px;color:#dc2626;">No users found.</div>`;
        resultEl.style.display = 'block';
        return;
      }

      resultEl.innerHTML = users.map(u => `
        <button type="button" class="mem-contrib-pick"
          data-uid="${esc(u.id)}" data-label="${esc(u.display_name || u.email)}"
          style="display:block;width:100%;text-align:left;background:#f8fafc;
                 border:1px solid #e2e8f0;border-radius:5px;padding:5px 9px;
                 margin-bottom:3px;font-size:10px;cursor:pointer;">
          ${esc(u.display_name || u.email)}
          <span style="color:#9ca3af;font-size:9px;margin-left:4px;">${esc(u.email)}</span>
        </button>`).join('');
      resultEl.style.display = 'block';

      resultEl.querySelectorAll('.mem-contrib-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelector('#mem-contrib-value').value = btn.dataset.uid;
          overlay.querySelector('#mem-contrib-display').textContent = btn.dataset.label;
          resultEl.style.display = 'none';
          input.value            = '';
        });
      });
    });
  }

  // Save (pipeline toggle is handled globally via window.__mutPipelineToggle)
  overlay.querySelector('#mem-save')?.addEventListener('click', async () => {
    const saveBtn = overlay.querySelector('#mem-save');
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;

    const modal = overlay.querySelector('#mut-edit-modal');
    const diff  = {};

    // Collect changed scalar fields
    const scalarFields = ['name','creator_name','mutation_type','collection','plasmid_used','notes'];
    scalarFields.forEach(f => {
      const el = modal.querySelector(`[name="${f}"]`);
      if (!el) return;
      const val = el.value.trim() || null;
      if (val !== (m[f] ?? null)) diff[f] = val;
    });

    // marker: comma-split → array
    const markerRaw  = (modal.querySelector('[name="marker"]')?.value ?? '').trim();
    const markerArr  = markerRaw ? markerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const origMarker = Array.isArray(m.marker) ? [...m.marker].sort().join(',') : (m.marker ?? '');
    if (markerArr.slice().sort().join(',') !== origMarker) diff.marker = markerArr;

    // target_gene_ids: replace full array if changed
    const newGeneIds = stagedGenes.map(g => g.id);
    const oldGeneIds = (m.target_gene_ids ?? []).slice().sort().join(',');
    if (newGeneIds.slice().sort().join(',') !== oldGeneIds) {
      diff.target_gene_ids = newGeneIds.length ? newGeneIds : null;
    }

    // contributed_by (admin only)
    if (isAdmin) {
      const newContrib = overlay.querySelector('#mem-contrib-value')?.value || null;
      if (newContrib !== (m.contributed_by ?? null)) diff.contributed_by = newContrib;
    }

    let saveError = null;

    // PATCH scalar + array fields
    if (Object.keys(diff).length) {
      diff.updated_by = state.user.id;
      const { error } = await sb.from('mutants').update(diff).eq('id', m.id);
      if (error) saveError = error.message;
    }

    // is_published RPC (admin only, if changed)
    if (isAdmin && !saveError) {
      const newPub = overlay.querySelector('#mem-published')?.checked ?? m.is_published;
      if (newPub !== m.is_published) {
        const { error } = await sb.rpc('set_mutant_published', {
          target_mutant_id: m.id,
          published: newPub,
        });
        if (error) saveError = error.message;
      }
    }

    saveBtn.textContent = 'Save';
    saveBtn.disabled    = false;

    if (saveError) {
      alert(`Save failed: ${saveError}`);
      return;
    }

    closeModal();
    // Re-render the detail panel with fresh data
    if (afterSaveFn) afterSaveFn();
    else loadDetail(m.id);
  });
}

// ─── Pipeline toggle (global handler for inline onclick) ──────────────────────
window.__mutPipelineToggle = async function(mutantId, currentlyIn) {
  const newVal = !currentlyIn;
  const msg = newVal
    ? `Add ${mutantId} to the Pipeline tab?`
    : `Remove ${mutantId} from the Pipeline tab?`;
  if (!confirm(msg)) return;

  const { error } = await sb.from('mutants')
    .update({ show_in_pipeline: newVal })
    .eq('mutant_id', mutantId);

  if (error) { alert('Error: ' + error.message); return; }

  // Update the icon in place without re-rendering the whole list
  document.querySelectorAll(`[data-pipeline-btn="${mutantId}"]`).forEach(btn => {
    btn.title = newVal ? 'In pipeline — click to remove' : 'Not in pipeline — click to add';
    btn.dataset.pipelineVal = newVal ? '1' : '0';
    btn.innerHTML = newVal ? PL_ICON_ON : PL_ICON_OFF;
    btn.setAttribute('onclick', `event.stopPropagation();window.__mutPipelineToggle('${mutantId}',${newVal})`);
  });
};
