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

// Maps geneId (string) → gene object from the last list fetch
const _geneCache = new Map();

// Which detail sections are expanded (resets on new gene selection)
let _sectionOpen = {
  gene: true, protein: true, structure: true,
  transcriptomics: true, proteomics: true,
  localization: false, interactions: false,
};

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
      'strains!inner(common_name,color_hex)',
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

  // af_image_url lives in alphafold_results (joined in Task 6+); placeholder for now
  const thumb = `<div style="width:28px;height:28px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:12px;color:#d1d5db;flex-shrink:0;">⬡</div>`;

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

// ─── Gene detail ──────────────────────────────────────────

async function showGeneDetail(geneId, container) {
  const detail = container.querySelector('#gene-detail');
  detail.innerHTML = skeletonRows(6);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const [{ data: g }, { data: orthoRows }] = await Promise.all([
    sb.from('genes').select('*').eq('id', geneId).single(),
    sb.from('orthologs')
      .select('gene_id,ortholog_gene_id')
      .or(`gene_id.eq.${geneId},ortholog_gene_id.eq.${geneId}`),
  ]);

  if (!g) { detail.innerHTML = '<p class="text-red-500 p-4 text-sm">Gene not found.</p>'; return; }

  // Fetch ortholog details
  const orthoIds = (orthoRows || []).map(r => r.gene_id === geneId ? r.ortholog_gene_id : r.gene_id);
  let orthoGenes = [];
  if (orthoIds.length) {
    const { data } = await sb.from('genes').select('id,locus_tag,gene_name,strain_id').in('id', orthoIds);
    orthoGenes = data || [];
  }

  const strainLabel = { 'CT-D': 'D ortholog', 'CT-L2': 'L2 ortholog', 'CM': 'CM ortholog' };

  detail.innerHTML = `
    <div class="back-btn mt-4" id="detail-back">‹ Gene list</div>

    <!-- Gene title -->
    <div class="flex items-start gap-4 mb-1">
      ${g.af_image_url ? `
        <img src="${g.af_image_url}" alt="AlphaFold model"
          class="w-16 h-16 rounded-xl object-cover flex-shrink-0 cursor-pointer border border-gray-100"
          id="af-thumb" title="Tap to open 3D viewer" />` : ''}
      <div>
        <h2 class="text-2xl font-bold text-gray-900">${g.gene_name ?? g.locus_tag}</h2>
        ${g.gene_name ? `<div class="text-sm text-gray-400 font-mono">${g.locus_tag}</div>` : ''}
        <div class="text-sm text-gray-500 mt-0.5">${g.product ?? 'Hypothetical protein'}</div>
      </div>
    </div>

    <!-- Property rows -->
    <div class="mt-3">
      ${row('Length', g.length_bp ? `${g.length_bp} bp` : null)}
      ${row('Mass', g.mass_kd ? `${g.mass_kd} kDa` : null)}
      ${row('Function', g.function)}
      ${row('Protein family', g.protein_family)}
      ${row('Subcellular location', g.subcellular_location)}
    </div>

    <!-- Orthologs -->
    ${orthoGenes.length ? `
      <div class="section-head">Orthologs</div>
      ${orthoGenes.map(o => `
        <div class="detail-row cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 ortholog-btn" data-id="${o.id}">
          <div class="detail-label">${strainLabel[o.strain_id] ?? o.strain_id}</div>
          <div class="detail-value">
            <span class="${o.gene_name ? 'text-green-700 font-semibold' : 'text-rose-400 font-medium'}">${o.gene_name ?? o.locus_tag}</span>
            ${o.gene_name ? `<span class="text-gray-400 text-xs ml-1">${o.locus_tag}</span>` : ''}
          </div>
          <span class="text-gray-300">›</span>
        </div>`).join('')}
    ` : ''}

    <!-- Protein information -->
    <div class="section-head">Protein information</div>
    ${row('Product', g.product)}
    ${row('Mass (kD)', g.mass_kd)}
    ${row('Function', g.function)}
    ${row('Protein family', g.protein_family)}
    ${g.is_inc     ? row('Inc protein', '✓ Yes') : ''}
    ${g.is_membrane? row('Membrane', '✓ Yes') : ''}
    ${g.is_secreted? row('Secreted', '✓ Yes') : ''}

    <!-- Structure -->
    <div class="section-head">Structure</div>
    ${g.af_image_url ? `
      <div class="py-3 border-b border-gray-100">
        <div class="text-gray-400 text-sm mb-2">Predicted Model</div>
        <img src="${g.af_image_url}" alt="AlphaFold model" class="w-32 h-32 rounded-xl object-cover border border-gray-100" />
      </div>` : ''}
    ${row('Version', g.af_version ?? 'AF3')}
    ${row('Structural homology inferred function', g.structural_homology_function)}

    <!-- Expression Data -->
    ${renderExpr(g)}

    <!-- External Databases -->
    <div class="section-head">External Databases</div>
    ${extRow('UniProt', g.uniprot_id, g.uniprot_id ? `https://www.uniprot.org/uniprot/${g.uniprot_id}` : null)}
    ${extRow('AlphaFold ID', g.alphafold_id, g.alphafold_id ? `https://alphafold.ebi.ac.uk/entry/${g.alphafold_id}` : null)}
    ${extRow('PDB', g.pdb_id, g.pdb_id ? `https://www.rcsb.org/structure/${g.pdb_id}` : null)}
    <div class="detail-row">
      <div class="detail-label">NCBI</div>
      <div class="detail-value">
        <a href="https://www.ncbi.nlm.nih.gov/protein/?term=${g.locus_tag}" target="_blank" class="ext-link">${g.locus_tag} ↗</a>
      </div>
    </div>

    <!-- GO -->
    ${g.biological_process || g.molecular_function || g.cellular_component ? `
      <div class="section-head">GO Annotations</div>
      ${row('Biological process', g.biological_process)}
      ${row('Molecular function', g.molecular_function)}
      ${row('Cellular component', g.cellular_component)}
    ` : ''}

    <!-- Mol* viewer -->
    ${g.mmcif_path ? `
      <div class="section-head">🧊 3D Structure Viewer</div>
      <div id="molstar-wrap" class="pb-4">
        <button id="btn-molstar"
          class="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400
                 hover:border-gray-300 hover:text-gray-500 transition"
          data-url="${g.mmcif_path}">
          Tap to load interactive 3D viewer
        </button>
      </div>
    ` : ''}

    <div class="h-16"></div>
  `;

  detail.querySelector('#detail-back').addEventListener('click', () => {
    detail.innerHTML = '';
    container.querySelector('#gene-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  detail.querySelectorAll('.ortholog-btn').forEach(btn =>
    btn.addEventListener('click', () => showGeneDetail(Number(btn.dataset.id), container))
  );

  detail.querySelector('#af-thumb')?.addEventListener('click', () => loadMolstar(detail, g.mmcif_path));
  detail.querySelector('#btn-molstar')?.addEventListener('click', e => loadMolstar(detail, e.currentTarget.dataset.url));
}

// ─── Expression chart ─────────────────────────────────────

function renderExpr(g) {
  const timepoints = [
    { label: 'T0', val: g.expr_eb  },
    { label: 'T1', val: g.expr_1h  },
    { label: 'T2', val: g.expr_3h  },
    { label: 'T3', val: g.expr_8h  },
    { label: 'T4', val: g.expr_16h },
    { label: 'T5', val: g.expr_24h },
  ].filter(t => t.val !== null && t.val !== undefined);

  const ebRb = [
    g.expr_eb !== null && g.expr_eb !== undefined ? `EB: ${g.expr_eb}` : 'EB: NQ',
    g.expr_rb !== null && g.expr_rb !== undefined ? `RB: ${g.expr_rb}` : 'RB: ND',
  ];

  const hasChart = timepoints.length > 0;

  let chart = '';
  if (hasChart) {
    const max = Math.max(...timepoints.map(t => t.val), 1);
    chart = `
      <div class="py-3 border-b border-gray-100">
        <div class="text-gray-400 text-sm mb-3">Microarray</div>
        <div class="flex items-end gap-2 h-16">
          ${timepoints.map(t => {
            const pct = (t.val / max) * 100;
            return `
              <div class="flex flex-col items-center gap-1 flex-1">
                <div class="w-full bg-blue-400 rounded-t" style="height:${Math.max(pct, 4)}%;min-height:4px;max-height:52px;"></div>
                <span class="text-[10px] text-gray-400">${t.label}</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="section-head">Expression Data</div>
    ${chart}
    ${row('EB', g.expr_eb ?? 'NQ')}
    ${row('RB', g.expr_rb ?? 'ND')}
    ${g.microarray_category ? row('Category', g.microarray_category) : ''}
  `;
}

// ─── Mol* loader ──────────────────────────────────────────

async function loadMolstar(detail, url) {
  const wrap = detail.querySelector('#molstar-wrap');
  wrap.innerHTML = `<div id="molstar-vp" style="width:100%;height:480px;position:relative;border-radius:12px;overflow:hidden;"></div>`;

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

function row(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value}</div>
    </div>`;
}

function extRow(label, text, href) {
  if (!text) return row(label, '—');
  return `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value">
        ${href ? `<a href="${href}" target="_blank" class="ext-link">${text} ↗</a>` : text}
      </div>
    </div>`;
}

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

// Stubs — implemented in Tasks 3 and 10
function showGeneDetailDesktop(gene, container) { /* stub — implemented in Task 3 */ }
function showGeneDetailMobile(gene, container)  { /* stub — implemented in Task 10 */ }
