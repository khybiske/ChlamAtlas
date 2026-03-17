// ChlamAtlas — Genomes tab
import { sb } from '../app.js';

const STRAINS = [
  { id: 'CT-D',  name: 'C. trachomatis D',   sub: 'D/UW-3 strain',      icon: '/design/CTDicon.jpg' },
  { id: 'CT-L2', name: 'C. trachomatis L2',  sub: 'L2/434 strain',      icon: '/design/L2icon.jpg'  },
  { id: 'CM',    name: 'C. muridarum',        sub: 'Nigg strain',        icon: '/design/CMicon.jpg'  },
];

const PAGE_SIZE = 50;

// Module-level state (reset on each renderGenomes call)
let _strain = null;
let _page   = 0;
let _total  = 0;
let _search = '';
let _searchTimer = null;

export function renderGenomes(container) {
  _strain = window.__preferredStrain ?? null;
  delete window.__preferredStrain;
  _page = 0; _search = '';

  if (_strain) {
    showGeneList(container);
  } else {
    showStrainSelector(container);
  }
}

// ─── Strain selector ──────────────────────────────────────

function showStrainSelector(container) {
  container.innerHTML = `
    <div class="mt-4 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      ${STRAINS.map(s => `
        <button class="selector-row w-full text-left" data-strain="${s.id}">
          <img src="${s.icon}" alt="${s.name}" class="selector-icon" />
          <div>
            <div class="font-semibold text-gray-900 text-base">${s.name}</div>
            <div class="text-sm text-gray-400">${s.sub}</div>
          </div>
          <span class="ml-auto text-gray-300 text-lg">›</span>
        </button>`).join('')}
    </div>`;

  container.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      _strain = btn.dataset.strain;
      _page = 0; _search = '';
      showGeneList(container);
    });
  });
}

// ─── Gene list ────────────────────────────────────────────

function showGeneList(container) {
  const strain = STRAINS.find(s => s.id === _strain);
  container.innerHTML = `
    <!-- Back -->
    <div class="back-btn mt-3" id="genes-back">‹ Genomes</div>

    <!-- Strain header -->
    <div class="flex items-center gap-3 mb-4">
      <img src="${strain.icon}" alt="" class="w-10 h-10 rounded-full object-cover" />
      <div>
        <div class="font-semibold text-gray-900">${strain.name}</div>
        <div class="text-xs text-gray-400">${strain.sub}</div>
      </div>
    </div>

    <!-- Search -->
    <div class="relative mb-3">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      <input id="gene-search" type="search" placeholder="Search locus tag, gene name, product…"
        class="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl
               focus:outline-none focus:ring-2 focus:ring-blue-200" />
    </div>

    <!-- Gene list -->
    <div id="gene-list" class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm"></div>

    <!-- Pagination -->
    <div id="gene-pg" class="flex justify-between items-center mt-3 text-sm text-gray-500 px-1"></div>

    <!-- Detail panel -->
    <div id="gene-detail"></div>
  `;

  container.querySelector('#genes-back').addEventListener('click', () => showStrainSelector(container));

  container.querySelector('#gene-search').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _search = e.target.value.trim();
    _searchTimer = setTimeout(() => { _page = 0; fetchGenes(container); }, 280);
  });

  fetchGenes(container);
}

async function fetchGenes(container) {
  const list = container.querySelector('#gene-list');
  list.innerHTML = skeletonRows(8);

  const from = _page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const base = sb.from('genes')
    .select('id,locus_tag,gene_name,product,af_image_url,is_hypothetical,microarray_category', { count: 'exact' })
    .eq('strain_id', _strain)
    .order('sort_index', { ascending: true, nullsFirst: false })
    .range(from, to);

  const query = _search
    ? sb.from('genes')
        .select('id,locus_tag,gene_name,product,af_image_url,is_hypothetical,microarray_category', { count: 'exact' })
        .eq('strain_id', _strain)
        .or(`locus_tag.ilike.%${_search}%,gene_name.ilike.%${_search}%,product.ilike.%${_search}%`)
        .order('sort_index', { ascending: true, nullsFirst: false })
        .range(from, to)
    : base;

  const { data: genes, count, error } = await query;
  _total = count ?? 0;

  if (error) { list.innerHTML = `<div class="p-6 text-red-500 text-sm">${error.message}</div>`; return; }
  if (!genes?.length) { list.innerHTML = `<div class="p-8 text-center text-gray-400 text-sm">No genes found.</div>`; renderPg(container); return; }

  list.innerHTML = genes.map(geneRow).join('');
  list.querySelectorAll('.gene-row').forEach(row =>
    row.addEventListener('click', () => showGeneDetail(Number(row.dataset.id), container))
  );
  renderPg(container);
}

function geneRow(g) {
  const img = g.af_image_url
    ? `<img src="${g.af_image_url}" loading="lazy" class="gene-thumb"
           onerror="this.style.display='none'" />`
    : `<div class="gene-thumb bg-gray-100 flex items-center justify-center text-gray-300 text-xl">⬡</div>`;

  const nameEl = g.gene_name
    ? `<span class="gene-named">${g.gene_name}</span>
       <span class="gene-locus ml-1.5">${g.locus_tag}</span>`
    : `<span class="gene-unnamed">${g.locus_tag}</span>`;

  return `
    <div class="gene-row" data-id="${g.id}">
      ${img}
      <div class="flex-1 min-w-0">
        <div class="text-sm">${nameEl}</div>
        <div class="gene-product">${g.product ?? 'Hypothetical protein'}</div>
      </div>
      ${g.microarray_category ? `<span class="text-[10px] text-gray-300 flex-shrink-0 pr-1">${g.microarray_category}</span>` : ''}
      <span class="text-gray-300 flex-shrink-0">›</span>
    </div>`;
}

function renderPg(container) {
  const pg = container.querySelector('#gene-pg');
  const totalPages = Math.ceil(_total / PAGE_SIZE);
  const from = _page * PAGE_SIZE + 1;
  const to   = Math.min((_page + 1) * PAGE_SIZE, _total);
  pg.innerHTML = `
    <button id="pg-prev" ${_page === 0 ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition text-sm">← Prev</button>
    <span class="text-xs text-gray-400">${from}–${to} of ${_total.toLocaleString()}</span>
    <button id="pg-next" ${_page >= totalPages - 1 ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition text-sm">Next →</button>`;
  pg.querySelector('#pg-prev')?.addEventListener('click', () => { _page--; fetchGenes(container); window.scrollTo(0,0); });
  pg.querySelector('#pg-next')?.addEventListener('click', () => { _page++; fetchGenes(container); window.scrollTo(0,0); });
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
  return `<div class="space-y-0">${Array.from({length:n}, () => `
    <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
      <div class="skeleton w-10 h-10 rounded-lg flex-shrink-0"></div>
      <div class="flex-1 space-y-2"><div class="skeleton h-3 w-24 rounded"></div><div class="skeleton h-2.5 w-48 rounded"></div></div>
    </div>`).join('')}</div>`;
}
