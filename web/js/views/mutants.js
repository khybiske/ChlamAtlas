// ChlamAtlas — Mutants tab (full two-panel view)
import { sb, state } from '../client.js?v=63';

const PAGE_SIZE = 50;

const COLLECTIONS = [
  { id: 'CT_L2',    label: 'C. trachomatis', icon: '/design/L2icon.jpg' },
  { id: 'CM',       label: 'C. muridarum',   icon: '/design/CMicon.jpg' },
  { id: 'Lucky17',  label: 'Lucky 17',        icon: '/design/L17icon.jpg' },
  { id: 'Chimeras', label: 'Chimeras',        icon: '/design/Chimeraicon.jpg' },
];

const TYPE_LABELS = { transposon: 'Transposon', chimera: 'Chimera', deletion: 'Deletion', chemical: 'Chemical' };
const FUNC_CLASSES = ['Hypothetical', 'Inc protein', 'T3 secreted', 'Characterized'];

// Module state
let _collection  = 'CT_L2';
let _typeFilter  = 'all';
let _sortCol     = 'mutant_id';
let _sortAsc     = true;
let _page        = 0;
let _total       = 0;
let _searchTerm  = '';
let _selectedId  = null;
let _container   = null;
let _searchTimer = null;
let _activeFilters = {};

// ─── Entry point ──────────────────────────────────────────

export function renderMutants(container) {
  _container = container;
  _collection = window.__mutantCollection ?? 'CT_L2';
  _typeFilter = 'all';
  _sortCol = 'mutant_id';
  _sortAsc = true;
  _page = 0;
  _total = 0;
  _searchTerm = '';
  _selectedId = null;
  _activeFilters = {};

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
        <div style="padding:0.625rem 0.75rem;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
          <input id="mut-search" type="search" placeholder="Search mutants…"
            style="width:100%;padding:0.375rem 0.625rem;border:1px solid #e5e7eb;border-radius:0.5rem;
                   font-size:0.8125rem;outline:none;background:#f9fafb;" />
        </div>

        <!-- Type filter pills -->
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
          ${['all','transposon','deletion','chemical'].map(t => `
            <button class="mut-type-pill ${t === _typeFilter ? 'active' : ''}" data-type="${t}">
              ${t === 'all' ? 'All' : TYPE_LABELS[t]}
            </button>`).join('')}
        </div>

        <!-- Sort row -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.75rem;
                    border-bottom:1px solid #e5e7eb;flex-shrink:0;font-size:0.75rem;color:#6b7280;">
          <span>Sort:</span>
          <select id="mut-sort" style="font-size:0.75rem;border:1px solid #e5e7eb;border-radius:0.375rem;
                  padding:0.1875rem 0.375rem;color:#374151;background:#fff;cursor:pointer;">
            <option value="mutant_id">Mutant ID</option>
            <option value="name">Name</option>
          </select>
          <button id="mut-sort-dir" title="Toggle sort direction"
            style="border:1px solid #e5e7eb;border-radius:0.375rem;padding:0.1875rem 0.5rem;
                   background:#fff;cursor:pointer;font-size:0.75rem;">
            ${_sortAsc ? 'A→Z' : 'Z→A'}
          </button>
        </div>

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
  fetchList();
}

// ─── Controls wiring ──────────────────────────────────────

function wireControls() {
  // Switch collection button
  document.getElementById('mut-switch-btn').addEventListener('click', (e) => {
    showCollectionDropdown(e.currentTarget);
  });

  // Search
  document.getElementById('mut-search').addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _searchTerm = e.target.value.trim();
      _page = 0;
      fetchList();
    }, 300);
  });

  // Type filter pills
  document.getElementById('mut-left').querySelectorAll('.mut-type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _typeFilter = pill.dataset.type;
      _page = 0;
      document.querySelectorAll('.mut-type-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      fetchList();
    });
  });

  // Sort select
  document.getElementById('mut-sort').addEventListener('change', (e) => {
    _sortCol = e.target.value;
    _page = 0;
    fetchList();
  });

  // Sort direction toggle
  document.getElementById('mut-sort-dir').addEventListener('click', (btn) => {
    _sortAsc = !_sortAsc;
    btn.currentTarget.textContent = _sortAsc ? 'A→Z' : 'Z→A';
    _page = 0;
    fetchList();
  });
}

function showCollectionDropdown(anchor) {
  const existing = document.getElementById('mut-coll-dd');
  if (existing) { existing.remove(); return; }

  const dd = document.createElement('div');
  dd.id = 'mut-coll-dd';
  dd.className = 'mut-nav-dropdown';
  dd.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:300;min-width:14rem;';
  dd.innerHTML = `
    <div class="mut-nav-dropdown-header">Collections</div>
    ${COLLECTIONS.map(c => `
      <button class="mut-nav-row" data-collection="${c.id}">
        <img class="mut-nav-icon" src="${c.icon}" alt="">
        <span class="mut-nav-label">${c.label}</span>
      </button>`).join('')}
  `;

  const strip = document.querySelector('.mut-strip');
  strip.style.position = 'relative';
  strip.appendChild(dd);

  dd.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      _collection = btn.dataset.collection;
      window.__mutantCollection = _collection;
      dd.remove();
      _page = 0;
      _selectedId = null;
      renderMutants(_container);
    });
  });

  const dismiss = (e) => {
    if (!dd.contains(e.target) && e.target !== anchor) { dd.remove(); document.removeEventListener('click', dismiss); }
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

// ─── Fetch + render list ──────────────────────────────────

async function fetchList() {
  const listEl = document.getElementById('mut-list');
  if (!listEl) return;
  listEl.innerHTML = skeletonRows(8);

  let query = sb
    .from('mutants')
    .select('id,mutant_id,name,mutation_type,is_published', { count: 'exact' })
    .eq('collection', _collection)
    .order(_sortCol, { ascending: _sortAsc })
    .limit(1000);

  if (_typeFilter !== 'all') query = query.eq('mutation_type', _typeFilter);
  if (_searchTerm) query = query.or(`mutant_id.ilike.%${_searchTerm}%,name.ilike.%${_searchTerm}%`);

  const { data: rows, count, error } = await query;

  _total = count ?? 0;
  const col = COLLECTIONS.find(c => c.id === _collection);
  const countEl = document.getElementById('strip-count');
  if (countEl) countEl.textContent = `${_total.toLocaleString()} mutants`;

  if (error) {
    listEl.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:0.8125rem;">${error.message}</div>`;
    return;
  }
  if (!rows?.length) {
    listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:#9ca3af;font-size:0.875rem;">No mutants found.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(m => mutantRowHTML(m)).join('');
  listEl.querySelectorAll('.mut-row').forEach(row => {
    row.addEventListener('click', () => {
      document.querySelectorAll('.mut-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      _selectedId = row.dataset.id;
      loadDetail(row.dataset.id);
    });
  });

  // Auto-select first row on initial load
  if (!_selectedId && rows.length) {
    const first = listEl.querySelector('.mut-row');
    if (first) { first.classList.add('selected'); _selectedId = first.dataset.id; loadDetail(first.dataset.id); }
  } else if (_selectedId) {
    const sel = listEl.querySelector(`[data-id="${_selectedId}"]`);
    if (sel) sel.classList.add('selected');
  }
}

function mutantRowHTML(m) {
  const displayName = m.name || m.mutant_id;
  const showId = m.name ? `<div class="mut-row-id">${m.mutant_id}</div>` : '';
  const unpub = !m.is_published ? `<span class="mut-unpub">unpub</span>` : '';
  return `
    <button class="mut-row" data-id="${m.id}">
      ${showId}
      <div class="mut-row-name">${displayName}${unpub}</div>
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
      .select(`id,locus_tag,gene_name,product,is_characterized,sort_index,strain_id,
               proteins(id,localization,
                 alphafold_results(thumbnail_path))`)
      .in('id', m.target_gene_ids);
    genes = geneData ?? [];

    // Fetch genomic neighborhood (±6 flanking) for the locus map
    if (genes.length) {
      const strainId  = genes[0].strain_id;
      const validIdx  = genes.map(g => g.sort_index).filter(i => i != null);
      if (validIdx.length && strainId) {
        const minIdx = Math.min(...validIdx);
        const maxIdx = Math.max(...validIdx);
        // Plasmid genes cluster at high sort_index — show all 8; chromosome: ±6
        const isPlasmid  = minIdx >= 871;
        const lo = isPlasmid ? 871 : Math.max(0, minIdx - 6);
        const hi = isPlasmid ? 878 : maxIdx + 6;
        const { data: nbData } = await sb
          .from('genes')
          .select('id,locus_tag,gene_name,is_characterized,sort_index')
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

    ${heroHTML(m)}
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
}

// ─── Detail section builders ──────────────────────────────

function heroHTML(m) {
  const displayName = m.name || m.mutant_id;
  const idLine = m.name ? `<div class="mut-hero-id">${m.mutant_id}</div>` : '';
  const strainLabel = m.strains?.common_name ?? m.strains?.species ?? '';
  const typeLabel = TYPE_LABELS[m.mutation_type] ?? m.mutation_type ?? '';
  const pubBadge = m.is_published
    ? `<span class="mut-badge mut-badge-pub">Published</span>`
    : `<span class="mut-badge mut-badge-unpub">Unpublished</span>`;

  return `
    <div style="padding:1.75rem 1.5rem 1.25rem;background:#fff;border-bottom:1px solid #e5e7eb;">
      <div class="mut-hero-name">${displayName}</div>
      ${idLine}
      <div style="display:flex;flex-wrap:wrap;gap:0.375rem;margin-top:0.75rem;">
        ${strainLabel ? `<span class="mut-badge mut-badge-strain">${strainLabel}</span>` : ''}
        ${typeLabel  ? `<span class="mut-badge mut-badge-type">${typeLabel}</span>` : ''}
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
      const funcBadge = g.is_characterized
        ? `<span class="func-badge func-badge-char">Characterized</span>`
        : `<span class="func-badge func-badge-hypo">Hypothetical</span>`;
      return `
        <div class="mut-gene-card" style="flex:1;min-width:0;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div class="mut-gene-tag">${g.locus_tag}</div>
            ${g.product ? `<div class="mut-gene-desc">${g.product}</div>` : ''}
            ${funcBadge}
            <button class="mut-gene-link" data-gene-nav="${g.id}">View in Genomes →</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="mut-card">
        <div class="mut-card-title">${title}</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">${cards}</div>
      </div>`;
  }

  // 3+ genes: compact scrollable list
  const rows = genes.map(g => {
    const funcBadge = g.is_characterized
      ? `<span class="func-badge func-badge-char" style="font-size:0.5625rem;">Characterized</span>`
      : `<span class="func-badge func-badge-hypo" style="font-size:0.5625rem;">Hypothetical</span>`;
    return `
      <div style="display:flex;align-items:center;gap:0.625rem;padding:0.375rem 0;border-bottom:1px solid #f3f4f6;">
        <span class="mut-gene-tag" style="min-width:5.5rem;flex-shrink:0;">${g.locus_tag}</span>
        <span style="flex:1;min-width:0;font-size:0.75rem;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.product ?? ''}</span>
        ${funcBadge}
        <button class="mut-gene-link" style="flex-shrink:0;font-size:0.6875rem;" data-gene-nav="${g.id}">→</button>
      </div>`;
  }).join('');

  return `
    <div class="mut-card">
      <div class="mut-card-title">${title}</div>
      <div style="max-height:12rem;overflow-y:auto;">${rows}</div>
    </div>`;
}

// ─── Genomic locus map ────────────────────────────────────

function geneLociMapHTML(genes, neighborhood, mutationType) {
  if (!neighborhood.length) return '';

  const targetIds = new Set(genes.map(g => g.id));

  // Color per mutation type for target gene highlight
  const typeColors = {
    transposon: { fill: '#059669', border: '#047857' },
    deletion:   { fill: '#ef4444', border: '#dc2626' },
    chemical:   { fill: '#8b5cf6', border: '#7c3aed' },
    chimera:    { fill: '#0891b2', border: '#0e7490' },
  };
  const hitColor = typeColors[mutationType] ?? typeColors.deletion;

  // Gene block dimensions
  const BLOCK_W  = 56;  // px per gene
  const BLOCK_H  = 28;
  const GAP      = 6;
  const LABEL_H  = 16;
  const TRACK_H  = BLOCK_H + LABEL_H + 8; // total row height
  const totalW   = neighborhood.length * (BLOCK_W + GAP) - GAP;
  const svgH     = TRACK_H + 4;

  const svgParts = neighborhood.map((g, i) => {
    const isTarget = targetIds.has(g.id);
    const x = i * (BLOCK_W + GAP);
    const y = 0;

    const fill   = isTarget ? hitColor.fill
                 : g.is_characterized ? '#16a34a'
                 : '#d1d5db';
    const stroke = isTarget ? hitColor.border : 'none';
    const sw     = isTarget ? 2 : 0;

    // Arrow-chevron shape: slightly pointed on right (placeholder for strand direction)
    const pt = `${x},${y} ${x + BLOCK_W - 7},${y} ${x + BLOCK_W},${y + BLOCK_H / 2} ${x + BLOCK_W - 7},${y + BLOCK_H} ${x},${y + BLOCK_H}`;

    const labelColor = isTarget ? '#111827' : '#6b7280';
    const labelWeight = isTarget ? '700' : '400';
    const labelY = BLOCK_H + 12;
    const label = g.locus_tag.length > 8 ? g.locus_tag.slice(-6) : g.locus_tag;

    // Tooltip via <title>
    const tip = `${g.locus_tag}${g.gene_name && g.gene_name !== g.locus_tag ? ': ' + g.gene_name : ''}`;

    return `
      <g class="gene-block" style="cursor:default;" data-locus="${g.locus_tag}">
        <title>${tip}</title>
        <polygon points="${pt}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="3"/>
        <text x="${x + BLOCK_W / 2 - 3}" y="${labelY}"
              text-anchor="middle" font-size="8" font-family="ui-monospace,monospace"
              fill="${labelColor}" font-weight="${labelWeight}">${label}</text>
      </g>`;
  }).join('');

  // Connecting track line at mid-block
  const trackLine = `<line x1="0" y1="${BLOCK_H / 2}" x2="${totalW}" y2="${BLOCK_H / 2}"
                           stroke="#e5e7eb" stroke-width="2" stroke-dasharray="none"/>`;

  // Legend items
  const typeLabel = TYPE_LABELS[mutationType] ?? (mutationType ?? 'Target');
  const legend = `
    <div style="margin-top:0.625rem;display:flex;gap:1rem;flex-wrap:wrap;font-size:0.6875rem;color:#6b7280;align-items:center;">
      <span style="display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12"><polygon points="0,0 9,0 12,6 9,12 0,12" fill="${hitColor.fill}"/></svg>
        ${typeLabel}
      </span>
      <span style="display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12"><polygon points="0,0 9,0 12,6 9,12 0,12" fill="#16a34a"/></svg>
        Characterized
      </span>
      <span style="display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12"><polygon points="0,0 9,0 12,6 9,12 0,12" fill="#d1d5db"/></svg>
        Hypothetical
      </span>
      <span style="margin-left:auto;font-style:italic;color:#9ca3af;">↑ genomic order · strand direction pending coordinate import</span>
    </div>`;

  return `
    <div class="mut-card">
      <div class="mut-card-title">Genomic Locus</div>
      <div style="overflow-x:auto;padding-bottom:0.25rem;">
        <svg width="${totalW}" height="${svgH}" style="overflow:visible;display:block;">
          ${trackLine}
          ${svgParts}
        </svg>
      </div>
      ${legend}
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

  const gridStyle = rightCol ? 'class="mut-info-grid"' : 'style="display:block;"';
  return `
    <div class="mut-card">
      <div class="mut-card-title">Recombinant Info${isLabMember && pipe ? ' &amp; Genotyping' : ''}</div>
      <div ${gridStyle}>${leftCol}${rightCol}</div>
    </div>`;
}

function pipelineHTML(pipe, isLabMember) {
  if (!isLabMember) return '';
  if (!pipe) {
    return `
      <div class="mut-card">
        <div class="mut-card-title">Pipeline</div>
        <div style="font-size:0.8125rem;color:#9ca3af;">No pipeline record.</div>
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
    <div class="mut-card">
      <div class="mut-card-title">Pipeline</div>
      <div class="mut-pipeline">${bars}</div>
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
    <div class="mut-card">
      <div class="mut-card-title">Phenotypes</div>
      <div class="mut-pheno-grid">
        ${card('In vitro', vitro)}
        ${card('In vivo', vivo)}
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
    <div class="mut-card">
      <div class="mut-card-title">Stocks</div>
      <div class="mut-stocks-grid">${items}</div>
    </div>`;
}

// ─── Helpers ──────────────────────────────────────────────

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
