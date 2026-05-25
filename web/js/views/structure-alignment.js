// ChlamAtlas — Structure Alignment tool
import { sb, state } from '../client.js?v=80';

// ── Constants ─────────────────────────────────────────────────
const STRAIN_COLORS = { 'CT-L2': '#16a34a', 'CT-D': '#4b2e83', 'CM': '#2563eb' };
const MAX_STRUCTURES = 3;

// ── Module state ──────────────────────────────────────────────
let strState = {
  entries: [],        // { id, gene, modelType, urlData, status, isPrimary }
  loaded: false,      // true = viewer phase; false = picker phase
  bgDark: true,
  hintDismissed: false,
  viewer: null,
};
let _container = null;
let _strainMap = new Map();           // uuid → { name, color }
let _clickOutsideController = null;

// ── Strain lookup ─────────────────────────────────────────────
async function loadStrains() {
  if (_strainMap.size) return;
  const { data } = await sb.from('strains').select('id,common_name');
  for (const s of data || []) {
    _strainMap.set(s.id, {
      name:  s.common_name,
      color: STRAIN_COLORS[s.common_name] ?? '#64748b',
    });
  }
}

function strainColor(strainId) {
  return _strainMap.get(strainId)?.color ?? '#64748b';
}
function strainName(strainId) {
  return _strainMap.get(strainId)?.name ?? '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Entry point ───────────────────────────────────────────────
export function renderStructureAlignment(container) {
  _container = container;
  strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
  loadStrains().then(() => render()).catch(() => render());
}

// ── Top-level render ──────────────────────────────────────────
function render() {
  _container.innerHTML = strState.loaded ? renderLoadedPhase() : renderBuildingPhase();
  wireEvents();
}

// ── Building phase ────────────────────────────────────────────
function renderBuildingPhase() {
  const canLoad = strState.entries.filter(e => e.status === 'confirmed').length >= 2;
  return `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px 64px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin:0;">
          Structure Alignment
        </h1>
        ${strState.entries.length > 0 ? `
        <button onclick="window._strAlnReset()"
          style="flex-shrink:0;margin-top:6px;display:inline-flex;align-items:center;gap:5px;
                 font-size:11px;font-weight:600;color:#64748b;background:white;
                 border:1.5px solid #e2e8f0;border-radius:7px;padding:5px 12px;cursor:pointer;
                 font-family:'DM Sans',sans-serif;"
          onmouseover="this.style.borderColor='#cbd5e1'"
          onmouseout="this.style.borderColor='#e2e8f0'">
          ↺ Start over
        </button>` : ''}
      </div>
      <p style="color:#64748b;font-size:13px;margin-bottom:28px;">
        Load 2–3 AlphaFold or crystal structures into an interactive 3D viewer. Right-click any chain to superpose.
      </p>

      ${renderPickerSection()}

      <div style="margin-top:20px;">
        <button id="str-load-btn" ${canLoad ? '' : 'disabled'}
          onclick="window._strAlnLoad()"
          style="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;
                 padding:11px 22px;font-size:14px;font-weight:700;cursor:${canLoad ? 'pointer' : 'not-allowed'};
                 font-family:'DM Sans',sans-serif;
                 background:${canLoad ? '#0f4530' : '#e2e8f0'};color:${canLoad ? 'white' : '#94a3b8'};">
          ▶ Load structures
        </button>
        ${strState.entries.filter(e => e.status === 'confirmed').length < 2
          ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;">Add at least 2 structures to load</div>`
          : ''}
      </div>
    </div>
  `;
}

function renderPickerSection() {
  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
                  color:#94a3b8;margin-bottom:10px;">Structures to compare</div>

      <div style="position:relative;margin-bottom:14px;">
        <input id="str-search" type="text" placeholder="Search by locus tag or gene name…"
          autocomplete="off"
          style="width:100%;max-width:480px;border:1.5px solid #cbd5e1;border-radius:8px;
                 padding:10px 12px;font-size:13px;color:#1e293b;outline:none;
                 font-family:'DM Sans',sans-serif;"/>
        <div id="str-search-results"
          style="display:none;position:absolute;top:100%;left:0;width:100%;max-width:480px;
                 background:white;border:1.5px solid #0f4530;border-top:none;
                 border-radius:0 0 8px 8px;z-index:50;max-height:220px;overflow-y:auto;"></div>
      </div>

      <div id="str-entry-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
        ${strState.entries.length === 0
          ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">
               Search above to add the first structure…
             </div>`
          : strState.entries.map(renderEntryCard).join('')}
      </div>

      <div id="str-suggestion-panel" style="margin-bottom:14px;"></div>
    </div>
  `;
}

// ── Loaded phase ──────────────────────────────────────────────
function renderLoadedPhase() {
  return `<div style="max-width:900px;margin:0 auto;padding:20px 16px 64px;">
    <div style="font-size:13px;color:#94a3b8;padding:32px 0;text-align:center;">Loading viewer…</div>
  </div>`;
}

// ── Wire events ───────────────────────────────────────────────
function wireEvents() {
  window._strAlnReset = () => {
    strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
    render();
  };
  window._strAlnLoad = () => {
    strState.loaded = true;
    render();
  };

  // Typeahead (building phase only)
  const input = document.getElementById('str-search');
  const results = document.getElementById('str-search-results');
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
    if (!input.contains(e.target) && !results?.contains(e.target)) {
      results.style.display = 'none';
    }
  }, { capture: true, signal: _clickOutsideController.signal });
}

// Placeholder — implemented in Task 3
function searchGenes(q) {}

// ── Entry card ────────────────────────────────────────────────
function renderEntryCard(entry) {
  const g = entry.gene;
  const label = [g.locus_tag, g.gene_name].filter(Boolean).join(' · ');
  const sc = strainColor(g.strain_id);
  const sn = strainName(g.strain_id);
  const modelLabel = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' }[entry.modelType] ?? entry.modelType;
  const modelColors = {
    af2:     { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    af3:     { bg: '#fdf4ff', color: '#7c3aed', border: '#e9d5ff' },
    crystal: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  };
  const mc = modelColors[entry.modelType] ?? { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  const isPrimary = entry.isPrimary;

  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
                border:1.5px solid #86efac;background:#f0fdf4;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#0f4530;">${esc(label)}</div>
        <div style="font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${sc};display:inline-block;"></span>
          <span>${esc(sn)}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;
                       background:${mc.bg};color:${mc.color};border:1.5px solid ${mc.border};">
            ${modelLabel}
          </span>
          ${isPrimary ? `<span style="font-size:9px;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:99px;font-weight:700;">your pick</span>` : ''}
        </div>
      </div>
      ${!isPrimary ? `
        <button onclick="window._strAlnRemove('${esc(entry.id)}')"
          title="Remove"
          style="width:28px;height:28px;border-radius:50%;border:1.5px solid #fca5a5;background:white;
                 font-size:13px;color:#dc2626;cursor:pointer;display:flex;align-items:center;justify-content:center;
                 flex-shrink:0;">✕</button>
      ` : ''}
    </div>
  `;
}
