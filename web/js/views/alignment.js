// ChlamAtlas — Sequence Alignment tool
import { sb } from '../client.js?v=80';

// ── Local state ──────────────────────────────────────────────
let alignState = {
  seqType: 'dna',       // 'dna' | 'aa'
  entries: [],          // { gene: GeneRow, status: 'confirmed'|'suggested', id: string }
  results: null,        // parsed alignment results or null
  running: false,
};
let _container = null;
let _clickOutsideController = null;

export function renderAlignment(container) {
  _container = container;
  alignState = { seqType: 'dna', entries: [], results: null, running: false };
  render();
}

function render() {
  _container.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px 64px;">
      <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin-bottom:6px;">
        Sequence Alignment
      </h1>
      <p style="color:#64748b;font-size:13px;margin-bottom:28px;">
        Align orthologous or arbitrary Chlamydia gene sequences using Clustal Omega.
      </p>

      ${renderSeqTypeToggle()}
      ${renderPicker()}
      ${renderResults()}
    </div>
  `;
  wirePickerEvents();
}

// ── Sequence type toggle ─────────────────────────────────────
function renderSeqTypeToggle() {
  return `
    <div style="display:inline-flex;background:#f1f5f9;border-radius:99px;padding:3px;gap:2px;margin-bottom:24px;">
      <button id="aln-type-dna" onclick="window._alnSetType('dna')"
        style="padding:6px 18px;border-radius:99px;border:none;font-size:13px;font-weight:600;cursor:pointer;
               ${alignState.seqType==='dna' ? 'background:white;color:#0f4530;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#94a3b8;'}">
        DNA
      </button>
      <button id="aln-type-aa" onclick="window._alnSetType('aa')"
        style="padding:6px 18px;border-radius:99px;border:none;font-size:13px;font-weight:600;cursor:pointer;
               ${alignState.seqType==='aa' ? 'background:white;color:#0f4530;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#94a3b8;'}">
        Amino Acid
      </button>
    </div>
  `;
}

// ── Gene list entries ────────────────────────────────────────
function strainColor(strainId) {
  if (!strainId) return '#64748b';
  const s = strainId.toUpperCase();
  if (s.includes('L2')) return '#16a34a';
  if (s.includes('CT-D') || s === 'CT-D') return '#4b2e83';
  if (s.includes('CM'))  return '#2563eb';
  return '#64748b';
}

function renderEntryRow(entry) {
  const g = entry.gene;
  const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
  const sc = strainColor(g.strain_id);
  const isConfirmed = entry.status === 'confirmed';
  const border = isConfirmed
    ? '1.5px solid #86efac'
    : '1.5px dashed #fde68a';
  const bg = isConfirmed ? '#f0fdf4' : '#fffbeb';
  const badge = isConfirmed
    ? (entry.isPrimary
        ? `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">your pick</span>`
        : `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">confirmed ✓</span>`)
    : `<span style="font-size:9px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:99px;font-weight:700;">suggested ortholog</span>`;

  const lockBtn = (!entry.isPrimary && entry.status === 'suggested')
    ? `<button onclick="window._alnLock('${entry.id}')"
         title="Keep this sequence"
         style="width:28px;height:28px;border-radius:50%;border:1.5px solid #86efac;background:white;
                font-size:13px;color:#16a34a;cursor:pointer;display:flex;align-items:center;justify-content:center;">✓</button>`
    : '';
  const removeBtn = !entry.isPrimary
    ? `<button onclick="window._alnRemove('${entry.id}')"
         title="Remove"
         style="width:28px;height:28px;border-radius:50%;border:1.5px solid #fca5a5;background:white;
                font-size:13px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>`
    : '';

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                border:${border};background:${bg};">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#0f4530;">${label}</div>
        <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${sc};display:inline-block;"></span>
          <span>${g.strain_id}</span>
          ${badge}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${lockBtn}
        ${removeBtn}
      </div>
    </div>
  `;
}

// ── Picker section ───────────────────────────────────────────
function renderPicker() {
  const canRun = alignState.entries.length >= 2 && !alignState.running;
  return `
    <div style="margin-bottom:28px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px;">
        Sequences to align
      </div>

      <!-- Typeahead search -->
      <div style="position:relative;margin-bottom:14px;">
        <input id="aln-search" type="text" placeholder="Search by locus tag or gene name…"
          autocomplete="off"
          style="width:100%;max-width:440px;border:1.5px solid #cbd5e1;border-radius:8px;
                 padding:10px 12px;font-size:13px;color:#1e293b;outline:none;
                 font-family:'DM Sans',sans-serif;"/>
        <div id="aln-search-results"
          style="display:none;position:absolute;top:100%;left:0;width:100%;max-width:440px;
                 background:white;border:1.5px solid #0f4530;border-top:none;
                 border-radius:0 0 8px 8px;z-index:50;max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- Entry list -->
      <div id="aln-entry-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        ${alignState.entries.length === 0
          ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">
               Search above to add sequences…
             </div>`
          : alignState.entries.map(renderEntryRow).join('')}
      </div>

      <!-- Add another -->
      ${alignState.entries.length > 0 ? `
        <button id="aln-add-another"
          style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#64748b;
                 border:1.5px dashed #cbd5e1;border-radius:8px;padding:7px 14px;cursor:pointer;
                 background:none;margin-bottom:16px;font-family:'DM Sans',sans-serif;">
          ＋ Add another gene
        </button>
      ` : ''}

      <!-- Run button -->
      <div>
        <button id="aln-run-btn" ${canRun ? '' : 'disabled'}
          onclick="window._alnRun()"
          style="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;
                 padding:11px 22px;font-size:14px;font-weight:700;cursor:${canRun?'pointer':'not-allowed'};
                 font-family:'DM Sans',sans-serif;
                 background:${canRun?'#0f4530':'#e2e8f0'};color:${canRun?'white':'#94a3b8'};">
          ▶ Run alignment
        </button>
        ${alignState.entries.length < 2
          ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Add at least 2 sequences to run</div>`
          : ''}
      </div>
    </div>
  `;
}

function renderResults() { return ''; } // placeholder until Task 4

function wirePickerEvents() {
  // expose globals for inline onclick handlers
  window._alnSetType = (type) => {
    alignState.seqType = type;
    alignState.results = null;
    render();
  };
  window._alnLock = (id) => {
    const e = alignState.entries.find(x => x.id === id);
    if (e) e.status = 'confirmed';
    reRenderEntries();
  };
  window._alnRemove = (id) => {
    alignState.entries = alignState.entries.filter(x => x.id !== id);
    reRenderEntries();
  };
  window._alnRun = () => runAlignment();

  // Search input
  const input = document.getElementById('aln-search');
  const results = document.getElementById('aln-search-results');
  if (!input) return;

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    searchTimer = setTimeout(() => searchGenes(q), 220);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) results.style.display = 'block';
  });
  if (_clickOutsideController) _clickOutsideController.abort();
  _clickOutsideController = new AbortController();
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = 'none';
    }
  }, { capture: true, signal: _clickOutsideController.signal });

  // "Add another gene" re-focuses search
  document.getElementById('aln-add-another')?.addEventListener('click', () => {
    input.value = '';
    input.focus();
  });
}

function reRenderEntries() {
  const list = document.getElementById('aln-entry-list');
  if (!list) return;
  list.innerHTML = alignState.entries.length === 0
    ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">Search above to add sequences…</div>`
    : alignState.entries.map(renderEntryRow).join('');

  // also update run button state
  const btn = document.getElementById('aln-run-btn');
  const hint = btn?.nextElementSibling;
  const canRun = alignState.entries.length >= 2 && !alignState.running;
  if (btn) {
    btn.disabled = !canRun;
    btn.style.background = canRun ? '#0f4530' : '#e2e8f0';
    btn.style.color = canRun ? 'white' : '#94a3b8';
    btn.style.cursor = canRun ? 'pointer' : 'not-allowed';
  }
  if (hint) hint.style.display = alignState.entries.length < 2 ? 'block' : 'none';

  // show/hide "add another"
  const addBtn = document.getElementById('aln-add-another');
  if (!addBtn && alignState.entries.length > 0) {
    render();
  }
}

// ── Gene search ──────────────────────────────────────────────
async function searchGenes(q) {
  const resultsEl = document.getElementById('aln-search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:#94a3b8;">Searching…</div>`;
  resultsEl.style.display = 'block';

  const term = q.toLowerCase();
  const { data, error } = await sb
    .from('genes')
    .select('id,locus_tag,gene_name,gene_symbol,strain_id')
    .or(`locus_tag.ilike.%${term}%,gene_name.ilike.%${term}%,gene_symbol.ilike.%${term}%`)
    .order('strain_id')
    .limit(20);

  if (error || !data?.length) {
    resultsEl.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:#94a3b8;">No genes found</div>`;
    return;
  }

  resultsEl.innerHTML = data.map(g => {
    const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
    const sc = strainColor(g.strain_id);
    return `
      <div data-gene-id="${g.id}" style="padding:9px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;
           display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
           onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'"
           onclick="window._alnPickGene(${JSON.stringify(JSON.stringify(g))})">
        <div>
          <span style="font-weight:700;color:#0f4530;">${g.locus_tag}</span>
          ${g.gene_name ? `<span style="color:#64748b;margin-left:5px;">${g.gene_name}</span>` : ''}
        </div>
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:${sc};padding:2px 7px;border-radius:4px;">
          ${g.strain_id}
        </span>
      </div>
    `;
  }).join('');

  window._alnPickGene = (gStr) => {
    const g = JSON.parse(gStr);
    document.getElementById('aln-search').value = '';
    document.getElementById('aln-search-results').style.display = 'none';
    addGeneWithOrthologs(g);
  };
}

// ── Ortholog auto-fill ───────────────────────────────────────
async function addGeneWithOrthologs(gene) {
  // Don't add duplicates
  if (alignState.entries.find(e => e.gene.id === gene.id)) return;

  const isPrimary = alignState.entries.length === 0 || !alignState.entries.some(e => e.isPrimary);
  const primaryId = `entry-${Date.now()}-${gene.id}`;

  alignState.entries.push({ id: primaryId, gene, status: 'confirmed', isPrimary });
  reRenderEntries();

  if (!isPrimary) return; // manual additions don't trigger ortholog fetch

  // Fetch orthologs
  const { data: orthoRows } = await sb
    .from('orthologs')
    .select('gene_id,ortholog_gene_id')
    .or(`gene_id.eq.${gene.id},ortholog_gene_id.eq.${gene.id}`);

  if (!orthoRows?.length) return;

  const orthologGeneIds = orthoRows
    .map(r => r.gene_id === gene.id ? r.ortholog_gene_id : r.gene_id)
    .filter(id => id !== gene.id);

  if (!orthologGeneIds.length) return;

  const { data: orthoGenes } = await sb
    .from('genes')
    .select('id,locus_tag,gene_name,gene_symbol,strain_id')
    .in('id', orthologGeneIds);

  if (!orthoGenes?.length) return;

  for (const og of orthoGenes) {
    if (alignState.entries.find(e => e.gene.id === og.id)) continue;
    alignState.entries.push({
      id: `entry-${Date.now()}-${og.id}`,
      gene: og,
      status: 'suggested',
      isPrimary: false,
    });
  }
  reRenderEntries();
}

// ── Stub for Task 4 ──────────────────────────────────────────
function runAlignment() { console.warn('runAlignment not yet implemented'); }
