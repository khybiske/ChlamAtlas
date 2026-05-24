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

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

function renderResults() {
  if (alignState.running) {
    return `
      <div style="padding:32px 0;display:flex;align-items:center;gap:14px;">
        <div style="width:20px;height:20px;border:2px solid #0f4530;border-top-color:transparent;
                    border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <span id="aln-spinner-msg" style="font-size:13px;color:#64748b;">Submitting…</span>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
  }
  if (!alignState.results) return '';
  if (alignState.results.error) {
    return `
      <div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:10px;padding:14px 16px;color:#be123c;font-size:13px;">
        ⚠ ${escHtml(alignState.results.error)}
        <button onclick="window._alnRun()"
          style="margin-left:12px;background:#0f4530;color:white;border:none;border-radius:6px;
                 padding:4px 12px;font-size:12px;cursor:pointer;">Retry</button>
      </div>
    `;
  }
  return renderAlignmentResults(alignState.results);
}

// ── Alignment parsing ────────────────────────────────────────
function parseClustalAlignment(clustalText) {
  const seqMap = {};
  const labels = [];

  for (const line of clustalText.split('\n')) {
    if (line.startsWith('CLUSTAL') || line.startsWith(' ') || line.trim() === '') continue;
    const match = line.match(/^(\S+)\s+([A-Za-z\-]+)/);
    if (!match) continue;
    const [, label, seq] = match;
    if (!seqMap[label]) { seqMap[label] = ''; labels.push(label); }
    seqMap[label] += seq;
  }

  const sequences = labels.map(label => ({ label, seq: seqMap[label] }));
  const alnLength = sequences[0]?.seq.length ?? 0;

  let identical = 0, comparable = 0;
  for (let i = 0; i < alnLength; i++) {
    const col = sequences.map(s => s.seq[i]);
    if (col.some(c => c === '-')) continue;
    comparable++;
    if (col.every(c => c === col[0])) identical++;
  }
  const identity = comparable > 0 ? ((identical / comparable) * 100).toFixed(1) : '0.0';

  const gapCount = sequences.reduce((acc, s) =>
    acc + (s.seq.match(/-/g)?.length ?? 0), 0);

  return { sequences, alnLength, identity: parseFloat(identity), gapCount, labels };
}

// ── Stats cards ──────────────────────────────────────────────
function identityStyle(pct) {
  if (pct >= 90) return { bg: '#f0fdf4', border: '#86efac', color: '#15803d' };
  if (pct >= 70) return { bg: '#fffbeb', border: '#fde68a', color: '#b45309' };
  return { bg: '#fff1f2', border: '#fecdd3', color: '#be123c' };
}

function renderStatsCards(parsed) {
  const s = identityStyle(parsed.identity);
  const statCard = (val, label, bg='#f8fafc', border='#e2e8f0', color='#374151') => `
    <div style="border-radius:12px;padding:12px 18px;background:${bg};border:2px solid ${border};min-width:80px;text-align:center;">
      <div style="font-size:24px;font-weight:900;color:${color};line-height:1;">${val}</div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${color};opacity:0.7;margin-top:3px;">${label}</div>
    </div>
  `;
  return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      ${statCard(parsed.identity + '%', 'Identity', s.bg, s.border, s.color)}
      ${statCard(parsed.alnLength, 'Aln. length')}
      ${statCard(parsed.gapCount, 'Gaps')}
      ${statCard(parsed.sequences.length, 'Sequences')}
    </div>
  `;
}

function renderLegend(parsed) {
  return `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">
      ${parsed.sequences.map(s => {
        const entry = alignState.entries.find(e => e.gene.locus_tag === s.label);
        const color = entry ? strainColor(entry.gene.strain_id) : '#64748b';
        const strainId = entry?.gene.strain_id ?? '';
        return `
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#374151;">
            <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-weight:600;">${escHtml(s.label)}</span>
            ${strainId ? `<span style="color:#94a3b8;">${escHtml(strainId)}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── DNA/AA base colors ───────────────────────────────────────
const DNA_COLORS = { A: '#16a34a', T: '#dc2626', G: '#d97706', C: '#2563eb' };
const AA_COLORS = {
  G:'#f97316',P:'#f97316',
  A:'#64748b',V:'#64748b',L:'#64748b',I:'#64748b',M:'#64748b',
  F:'#8b5cf6',Y:'#8b5cf6',W:'#8b5cf6',
  K:'#ef4444',R:'#ef4444',H:'#ef4444',
  D:'#f59e0b',E:'#f59e0b',
  S:'#22c55e',T:'#22c55e',N:'#22c55e',Q:'#22c55e',
  C:'#eab308',
};

function colorBase(ch, seqType) {
  const c = seqType === 'dna' ? DNA_COLORS[ch.toUpperCase()] : AA_COLORS[ch.toUpperCase()];
  return c ?? '#64748b';
}

function renderAlignmentPanel(parsed, diffOnly) {
  const BLOCK = 60;
  const seqType = alignState.results.seqType;
  let html = '';

  for (let start = 0; start < parsed.alnLength; start += BLOCK) {
    const end = Math.min(start + BLOCK, parsed.alnLength);
    html += `<div style="margin-bottom:14px;">`;
    html += `<div style="font-size:9px;color:#94a3b8;margin-bottom:4px;">${start + 1} – ${end}</div>`;

    const variableCols = new Set();
    for (let i = start; i < end; i++) {
      const col = parsed.sequences.map(s => s.seq[i]);
      if (!col.every(c => c === col[0])) variableCols.add(i);
    }

    for (const { label, seq } of parsed.sequences) {
      const entry = alignState.entries.find(e => e.gene.locus_tag === label);
      const color = entry ? strainColor(entry.gene.strain_id) : '#64748b';
      const block = seq.slice(start, end);

      let seqHtml = '';
      for (let i = 0; i < block.length; i++) {
        const ch = block[i];
        const colIdx = start + i;
        const isVar = variableCols.has(colIdx);
        const isGap = ch === '-';

        if (diffOnly) {
          if (isVar && !isGap) {
            seqHtml += `<span style="background:#fef3c7;color:${colorBase(ch, seqType)};font-weight:800;padding:0 1px;">${ch}</span>`;
          } else if (isVar && isGap) {
            seqHtml += `<span style="color:#cbd5e1;">-</span>`;
          } else {
            seqHtml += `<span style="color:#d1d5db;">·</span>`;
          }
        } else {
          if (isGap) {
            seqHtml += `<span style="color:#cbd5e1;">-</span>`;
          } else {
            seqHtml += `<span style="color:${colorBase(ch, seqType)};font-weight:700;">${ch}</span>`;
          }
        }
      }

      html += `
        <div style="display:flex;align-items:center;gap:10px;line-height:1.6;">
          <span style="width:100px;flex-shrink:0;font-size:10px;color:${color};font-weight:600;
                       text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                       font-family:'DM Mono',monospace;">${escHtml(label)}</span>
          <span style="font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.04em;">${seqHtml}</span>
        </div>
      `;
    }

    if (!diffOnly) {
      let consHtml = '<div style="display:flex;gap:1px;height:5px;align-items:flex-end;margin-left:110px;margin-top:2px;">';
      for (let i = start; i < end; i++) {
        const col = parsed.sequences.map(s => s.seq[i]).filter(c => c !== '-');
        const allSame = col.length > 0 && col.every(c => c === col[0]);
        const anyMatch = col.length > 0 && col.filter(c => c === col[0]).length > 1;
        const h = allSame ? 5 : anyMatch ? 3 : 1;
        const bg = allSame ? '#0f4530' : anyMatch ? '#86efac' : '#e2e8f0';
        consHtml += `<div style="width:7.6px;height:${h}px;background:${bg};border-radius:1px;"></div>`;
      }
      consHtml += '</div>';
      html += consHtml;
    }

    html += '</div>';
  }

  return html;
}

async function exportAlignment(results, format) {
  console.warn('exportAlignment not yet implemented', format);
}

function renderAlignmentResults(results) {
  const parsed = parseClustalAlignment(results.clustalText);
  const diffOnly = alignState.diffOnly !== false;

  window._alnToggleView = () => {
    alignState.diffOnly = !diffOnly;
    render();
  };
  window._alnExport = (format) => exportAlignment(results, format);

  return `
    ${renderStatsCards(parsed)}
    ${renderLegend(parsed)}

    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button onclick="window._alnToggleView()"
        style="font-size:11px;color:#64748b;background:white;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">
        ${diffOnly ? 'Show full color view' : 'Show differences only'}
      </button>
    </div>

    <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:16px;
                overflow-x:auto;">
      ${renderAlignmentPanel(parsed, diffOnly)}
      ${diffOnly ? '<div style="font-size:9px;color:#94a3b8;margin-top:6px;text-align:right;">amber = diverges from consensus · · = identical</div>' : ''}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button onclick="window._alnExport('fasta')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ FASTA</button>
      <button onclick="window._alnExport('clustal')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ Clustal</button>
      <button onclick="window._alnExport('phylip')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">⬇ Phylip</button>
      <button onclick="window._alnExport('clipboard')"
        style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid #e2e8f0;
               border-radius:7px;padding:6px 12px;font-size:12px;color:#64748b;cursor:pointer;
               background:white;font-family:'DM Sans',sans-serif;">📋 Copy</button>
    </div>
  `;
}

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

  const batchTs = Date.now();
  for (const og of orthoGenes) {
    if (alignState.entries.find(e => e.gene.id === og.id)) continue;
    alignState.entries.push({
      id: `entry-${batchTs}-${og.id}`,
      gene: og,
      status: 'suggested',
      isPrimary: false,
    });
  }
  reRenderEntries();
}

// ── Sequence fetching from Supabase ──────────────────────────
async function fetchSequences() {
  const geneIds = alignState.entries.map(e => e.gene.id);
  const missing = [];

  if (alignState.seqType === 'dna') {
    const { data, error: dnaErr } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,dna_sequence')
      .in('id', geneIds);
    if (dnaErr) throw new Error(`Failed to fetch sequences: ${dnaErr.message}`);

    const seqMap = Object.fromEntries((data || []).map(r => [r.id, r]));
    for (const entry of alignState.entries) {
      const row = seqMap[entry.gene.id];
      if (!row?.dna_sequence) missing.push(entry.gene.locus_tag);
    }
    if (missing.length) throw new Error(`No DNA sequence on file for: ${missing.join(', ')}`);

    return alignState.entries.map(e => {
      const row = seqMap[e.gene.id];
      const seqId = row.locus_tag.replace(/[^A-Za-z0-9_\-.]/g, '_');
      return `>${seqId}\n${row.dna_sequence}`;
    }).join('\n');

  } else {
    // AA: join through proteins table
    const { data: geneRows, error: aaErr } = await sb
      .from('genes')
      .select('id,locus_tag,proteins(id,aa_sequence)')
      .in('id', geneIds);
    if (aaErr) throw new Error(`Failed to fetch sequences: ${aaErr.message}`);

    const seqMap = Object.fromEntries((geneRows || []).map(r => [r.id, r]));
    for (const entry of alignState.entries) {
      const row = seqMap[entry.gene.id];
      if (!row?.proteins?.[0]?.aa_sequence) missing.push(entry.gene.locus_tag);
    }
    if (missing.length) throw new Error(`No amino acid sequence on file for: ${missing.join(', ')}`);

    return alignState.entries.map(e => {
      const row = seqMap[e.gene.id];
      const seq = row.proteins[0].aa_sequence;
      const seqId = row.locus_tag.replace(/[^A-Za-z0-9_\-.]/g, '_');
      return `>${seqId}\n${seq}`;
    }).join('\n');
  }
}

// ── EMBL-EBI Clustal Omega REST API ─────────────────────────
const EBI_BASE = 'https://www.ebi.ac.uk/Tools/services/rest/clustalo';
const EBI_EMAIL = 'chlamatlas@chlamatlas.org';

async function submitToEBI(fasta) {
  const body = new URLSearchParams({
    email:    EBI_EMAIL,
    sequence: fasta,
    stype:    alignState.seqType === 'dna' ? 'dna' : 'protein',
    outfmt:   'clustal_num',
  });
  const res = await fetch(`${EBI_BASE}/run`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/plain' },
    body,
  });
  if (!res.ok) throw new Error(`EBI submission failed: ${res.status}`);
  return (await res.text()).trim(); // returns jobId
}

async function pollEBI(jobId, onStatus) {
  const MAX_POLLS = 40; // 40 × 3s = 2 min max
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${EBI_BASE}/status/${jobId}`, { headers: { Accept: 'text/plain' } });
    if (!res.ok) throw new Error(`EBI status check failed: ${res.status}`);
    const status = (await res.text()).trim();
    onStatus(status, i);
    if (status === 'FINISHED') return;
    if (status === 'ERROR' || status === 'FAILURE') throw new Error(`EBI job ${status}`);
  }
  throw new Error('Alignment timed out after 2 minutes');
}

async function fetchEBIResult(jobId, resultType = 'aln-clustal_num') {
  const res = await fetch(`${EBI_BASE}/result/${jobId}/${resultType}`, {
    headers: { Accept: 'text/plain' },
  });
  if (!res.ok) throw new Error(`Failed to fetch result ${resultType}: ${res.status}`);
  return res.text();
}

// ── Run orchestration ────────────────────────────────────────
async function runAlignment() {
  alignState.running = true;
  alignState.results = null;
  render();

  try {
    setSpinner('Fetching sequences…');
    const fasta = await fetchSequences();

    setSpinner('Submitting to Clustal Omega…');
    const jobId = await submitToEBI(fasta);

    await pollEBI(jobId, (status, poll) => {
      setSpinner(`Waiting for alignment… (${poll * 3}s)`);
    });

    setSpinner('Retrieving results…');
    const [clustalText, fastaText] = await Promise.all([
      fetchEBIResult(jobId, 'aln-clustal_num'),
      fetchEBIResult(jobId, 'aln-fasta'),
    ]);
    alignState.results = { jobId, clustalText, fastaText, seqType: alignState.seqType };

  } catch (err) {
    alignState.results = { error: err.message };
  }

  alignState.running = false;
  render();
}

function setSpinner(msg) {
  const el = document.getElementById('aln-spinner-msg');
  if (el) el.textContent = msg;
}
