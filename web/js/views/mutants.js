// ChlamAtlas — Mutants tab
import { sb, state } from '../app.js';

const COLLECTIONS = [
  { id: 'C. trachomatis', name: 'C. trachomatis', sub: 'Pathogenic human strain',  icon: '/design/L2icon.jpg'      },
  { id: 'C. muridarum',   name: 'C. muridarum',   sub: 'Mouse adapted strain',     icon: '/design/CMicon.jpg'      },
  { id: 'Lucky 17',       name: 'Lucky 17',        sub: 'Screening collection',     icon: '/design/L17icon.jpg'     },
  { id: 'Chimeras',       name: 'Chimeras',        sub: 'Cross-species hybrids',    icon: '/design/Chimeraicon.jpg' },
];

const PAGE_SIZE = 50;
let _collection = null;
let _page = 0;
let _total = 0;

export function renderMutants(container) {
  _collection = null; _page = 0;
  showCollectionSelector(container);

  // If navigated from pipeline with a specific mutant
  if (window.__openMutant) {
    const id = window.__openMutant;
    delete window.__openMutant;
    // Brief delay so DOM is ready
    setTimeout(() => showMutantDetail(id, container), 50);
  }
}

// ─── Collection selector ──────────────────────────────────

function showCollectionSelector(container) {
  container.innerHTML = `
    <div class="mt-4 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      ${COLLECTIONS.map(c => `
        <button class="selector-row w-full text-left" data-collection="${c.id}">
          <img src="${c.icon}" alt="${c.name}" class="selector-icon" />
          <div>
            <div class="font-semibold text-gray-900 text-base">${c.name}</div>
            <div class="text-sm text-gray-400">${c.sub}</div>
          </div>
          <span class="ml-auto text-gray-300 text-lg">›</span>
        </button>`).join('')}
    </div>`;

  container.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      _collection = btn.dataset.collection;
      _page = 0;
      showMutantList(container);
    });
  });
}

// ─── Mutant list ──────────────────────────────────────────

function showMutantList(container) {
  const col = COLLECTIONS.find(c => c.id === _collection);
  container.innerHTML = `
    <div class="back-btn mt-3" id="mut-back">‹ Collections</div>
    <div class="flex items-center gap-3 mb-4">
      <img src="${col.icon}" alt="" class="w-10 h-10 rounded-full object-cover" />
      <div>
        <div class="font-semibold text-gray-900">${col.name}</div>
        <div class="text-xs text-gray-400">${col.sub}</div>
      </div>
    </div>
    <div id="mutant-list" class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm"></div>
    <div id="mutant-pg" class="flex justify-between items-center mt-3 text-sm text-gray-500 px-1"></div>
    <div id="mutant-detail"></div>
  `;
  container.querySelector('#mut-back').addEventListener('click', () => showCollectionSelector(container));
  fetchMutants(container);
}

async function fetchMutants(container) {
  const list = container.querySelector('#mutant-list');
  list.innerHTML = skeletonRows(6);

  const from = _page * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const { data: mutants, count, error } = await sb
    .from('mutants')
    .select('mutant_id,mutant_name,target_genes,mutation_type,status,is_published,invitro_phenotype,invivo_phenotype,strain_id', { count: 'exact' })
    .eq('category', _collection)
    .eq('is_archived', false)
    .order('mutant_id', { ascending: true })
    .range(from, to);

  _total = count ?? 0;
  if (error) { list.innerHTML = `<div class="p-6 text-red-500 text-sm">${error.message}</div>`; return; }
  if (!mutants?.length) { list.innerHTML = `<div class="p-8 text-center text-gray-400 text-sm">No mutants found.</div>`; return; }

  list.innerHTML = mutants.map(mutantRow).join('');
  list.querySelectorAll('.mutant-row').forEach(row =>
    row.addEventListener('click', () => showMutantDetail(row.dataset.id, container))
  );
  renderPg(container);
}

function mutantRow(m) {
  const dots = [
    m.invitro_phenotype === true  ? `<span class="w-2 h-2 rounded-full bg-green-500 inline-block" title="In vitro +"></span>` : '',
    m.invitro_phenotype === false ? `<span class="w-2 h-2 rounded-full bg-gray-300 inline-block" title="In vitro –"></span>` : '',
    m.invivo_phenotype  === true  ? `<span class="w-2 h-2 rounded-full bg-blue-500 inline-block" title="In vivo +"></span>` : '',
  ].filter(Boolean).join('');

  const genes = (m.target_genes || []).slice(0, 3).join(', ') + (m.target_genes?.length > 3 ? '…' : '');

  return `
    <div class="mutant-row" data-id="${m.mutant_id}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-gray-900 text-sm">${m.mutant_id}</span>
          ${m.mutant_name ? `<span class="text-xs text-gray-400">${m.mutant_name}</span>` : ''}
        </div>
        ${genes ? `<div class="text-xs text-gray-400 font-mono mt-0.5">${genes}</div>` : ''}
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        ${dots}
        ${m.is_published ? '' : `<span class="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Unpub.</span>`}
        <span class="text-gray-300">›</span>
      </div>
    </div>`;
}

function renderPg(container) {
  const pg = container.querySelector('#mutant-pg');
  const totalPages = Math.ceil(_total / PAGE_SIZE);
  const from = _page * PAGE_SIZE + 1;
  const to   = Math.min((_page + 1) * PAGE_SIZE, _total);
  pg.innerHTML = `
    <button id="mpg-prev" ${_page === 0 ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition text-sm">← Prev</button>
    <span class="text-xs text-gray-400">${from}–${to} of ${_total.toLocaleString()}</span>
    <button id="mpg-next" ${_page >= totalPages - 1 ? 'disabled' : ''}
      class="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition text-sm">Next →</button>`;
  pg.querySelector('#mpg-prev')?.addEventListener('click', () => { _page--; fetchMutants(container); window.scrollTo(0,0); });
  pg.querySelector('#mpg-next')?.addEventListener('click', () => { _page++; fetchMutants(container); window.scrollTo(0,0); });
}

// ─── Mutant detail ────────────────────────────────────────

async function showMutantDetail(mutantId, container) {
  // Make sure there's a detail container
  let detail = container.querySelector('#mutant-detail');
  if (!detail) {
    container.innerHTML += `<div id="mutant-detail"></div>`;
    detail = container.querySelector('#mutant-detail');
  }
  detail.innerHTML = skeletonRows(6);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const [{ data: m }, { data: pipe }] = await Promise.all([
    sb.from('mutants').select('*').eq('mutant_id', mutantId).single(),
    sb.from('mutant_pipeline').select('*').eq('mutant_id', mutantId).single(),
  ]);

  if (!m) { detail.innerHTML = '<p class="text-red-500 p-4 text-sm">Not found.</p>'; return; }

  const STAGES = [
    { key: 'plasmid_complete',        label: 'Plasmid' },
    { key: 'transformation_complete', label: 'Transform' },
    { key: 'cloning_complete',        label: 'Cloning' },
    { key: 'genotyping_complete',     label: 'Genotyping' },
    { key: 'invitro_test_complete',   label: 'In vitro' },
    { key: 'invivo_test_complete',    label: 'In vivo' },
  ];

  const pipeDots = pipe
    ? STAGES.map(s => `
        <div class="flex flex-col items-center gap-1">
          <div class="pdot ${pipe[s.key] ? 'pdot-done' : 'pdot-pending'}"></div>
          <span class="text-[9px] text-gray-400 text-center leading-tight">${s.label}</span>
        </div>`).join('')
    : '';

  // Image URLs — stored as comma-separated or single URL
  const invitroImgs = (m.invitro_data || '').split(/,|\n/).map(s => s.trim()).filter(s => s.startsWith('http'));
  const invivoImgs  = (m.invivo_data  || '').split(/,|\n/).map(s => s.trim()).filter(s => s.startsWith('http'));

  detail.innerHTML = `
    <div class="back-btn mt-4" id="mut-detail-back">‹ ${_collection ?? 'Mutants'}</div>

    <!-- Title -->
    <h2 class="text-2xl font-bold text-gray-900 mb-0.5">${m.mutant_id}${m.mutant_name ? ` <span class="text-lg font-normal text-gray-500">${m.mutant_name}</span>` : ''}</h2>

    <!-- Top fields -->
    ${row('Target Genes', (m.target_genes || []).join(', ') || null)}
    ${row('Background Strain', m.strain_id)}
    ${row('Type', m.mutation_type)}

    <!-- 🎯 Targeted Genes (linked) -->
    ${m.target_genes?.length ? `
      <div class="section-head">🎯 Targeted Genes <span class="text-sm font-normal text-gray-400 ml-1">${m.target_genes.length}</span></div>
      <div id="target-gene-list">
        ${m.target_genes.map(lt => `
          <div class="detail-row target-gene-btn cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" data-locus="${lt}" data-strain="${m.strain_id}">
            <div class="detail-value text-blue-500 font-medium">${lt}</div>
            <span class="text-gray-300">›</span>
          </div>`).join('')}
      </div>
    ` : ''}

    <!-- ℹ️ Recombinant info -->
    <div class="section-head">ℹ️ Recombinant info</div>
    ${row('MutantID', m.mutant_id)}
    ${row('Creator', m.creator)}
    ${row('Plasmid used', m.plasmid_used)}
    ${row('Marker(s)', m.selection_markers)}
    ${row('Tn insert positions', m.tn_insert_positions)}
    ${m.recombined_start_gene ? row('Recombined region', `${m.recombined_start_gene} → ${m.recombined_end_gene}`) : ''}

    <!-- ⚙️ Pipeline -->
    ${pipe ? `
      <div class="section-head">⚙️ Pipeline</div>
      <div class="py-3 border-b border-gray-100">
        <div class="flex items-end gap-5">${pipeDots}</div>
        ${m.status ? `<div class="text-xs text-gray-400 mt-2">Current stage: ${m.status}</div>` : ''}
      </div>
      ${row('Plasmid made', pipe.plasmid_complete ? 'Complete' : 'Pending')}
    ` : ''}

    <!-- 🧬 Genotyping -->
    <div class="section-head">🧬 Genotyping</div>
    ${checkRow('Sequenced', m.sequenced)}
    ${row('Method', m.sequencing_type)}

    <!-- 🔬 In vitro testing -->
    <div class="section-head">🔬 In vitro testing</div>
    ${checkRow('In vitro phenotype?', m.invitro_phenotype)}
    ${invitroImgs.length ? `
      <div class="py-3 border-b border-gray-100">
        <div class="text-gray-400 text-sm mb-2">In vitro data</div>
        <div class="flex gap-2 flex-wrap">
          ${invitroImgs.map(u => `<img src="${u}" class="phenotype-img" />`).join('')}
        </div>
      </div>` : ''}
    ${row('In vitro Notes', m.invitro_notes)}

    <!-- 🐭 In vivo testing -->
    <div class="section-head">🐭 In vivo testing</div>
    ${checkRow('In vivo phenotype?', m.invivo_phenotype)}
    ${invivoImgs.length ? `
      <div class="py-3 border-b border-gray-100">
        <div class="text-gray-400 text-sm mb-2">In vivo data</div>
        <div class="flex gap-2 flex-wrap">
          ${invivoImgs.map(u => `<img src="${u}" class="phenotype-img" />`).join('')}
        </div>
      </div>` : ''}
    ${row('In vivo Notes', m.invivo_notes)}

    <!-- 📝 Other notes -->
    <div class="section-head">📝 Other notes</div>
    ${row('Stocks available at', m.stock_locations ?? (m.stock_locations === null ? '❌ No stocks recorded' : null))}
    ${row('Publicly available', m.is_published ? 'Yes' : 'No')}
    ${row('Shared with', m.shared_with)}
    ${state.userRole !== 'public' && m.notes ? row('Lab notes', m.notes) : ''}
    ${row('Edited by', m.last_edited_by)}

    <div class="h-16"></div>
  `;

  detail.querySelector('#mut-detail-back').addEventListener('click', () => {
    detail.innerHTML = '';
    container.querySelector('#mutant-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Wire target gene links → Genomes tab
  detail.querySelectorAll('.target-gene-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data } = await sb.from('genes')
        .select('id')
        .eq('locus_tag', btn.dataset.locus)
        .eq('strain_id', btn.dataset.strain)
        .single();
      if (data) {
        window.__geneDetailId = data.id;
        window.__preferredStrain = btn.dataset.strain;
        document.querySelector('[data-tab="genomes"]').click();
      }
    });
  });
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

function checkRow(label, value) {
  if (value === null || value === undefined) return row(label, '—');
  return `
    <div class="detail-row">
      <div class="detail-label">${label}</div>
      <div class="detail-value ${value ? 'text-green-600 font-medium' : 'text-gray-500'}">
        ${value ? '✅ Yes' : 'No'}
      </div>
    </div>`;
}

function skeletonRows(n) {
  return `<div>${Array.from({length:n}, () => `
    <div class="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
      <div class="flex-1 space-y-2"><div class="skeleton h-3 w-24 rounded"></div><div class="skeleton h-2.5 w-40 rounded"></div></div>
    </div>`).join('')}</div>`;
}
