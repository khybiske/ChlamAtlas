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

function hexToMolColor(hex) {
  // Mol* Color is just a branded integer (RGB packed as 0xRRGGBB)
  return parseInt((hex || '#64748b').replace('#',''), 16);
}

// ── Entry point ───────────────────────────────────────────────
export function renderStructureAlignment(container) {
  _container = container;
  strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
  loadStrains().then(() => render()).catch(() => render());

  if (state.structureAlignmentSeedGeneId) {
    const seedId = state.structureAlignmentSeedGeneId;
    state.structureAlignmentSeedGeneId = null;
    sb.from('genes')
      .select('id,locus_tag,gene_name,gene_symbol,strain_id')
      .eq('id', seedId)
      .single()
      .then(({ data }) => { if (data) addPrimaryGene(data); })
      .catch(err => console.error('[StructureAlignment] seed fetch failed:', err));
  }
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
  const confirmedEntries = strState.entries.filter(e => e.status === 'confirmed');
  const modelLabels = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' };

  const chips = confirmedEntries.map(e => {
    const sc = strainColor(e.gene.strain_id);
    const sn = strainName(e.gene.strain_id);
    const ml = modelLabels[e.modelType] ?? e.modelType;
    return `
      <div style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;
                  border:1.5px solid #86efac;border-radius:99px;padding:5px 12px;
                  font-size:12px;font-weight:700;color:#0f4530;white-space:nowrap;">
        <span style="width:7px;height:7px;border-radius:50%;background:${sc};display:inline-block;"></span>
        ${esc(e.gene.locus_tag)} · ${esc(sn)}
        <span style="font-size:9px;background:white;border-radius:4px;padding:1px 5px;
                     color:${sc};border:1px solid ${sc}30;">${esc(ml)}</span>
      </div>
    `;
  }).join('');

  const hintDismissed = strState.hintDismissed || (function(){ try { return sessionStorage.getItem('str-hint-dismissed') === '1'; } catch { return false; } }());
  const hint = hintDismissed ? '' : `
    <div id="str-superpose-hint"
         style="display:flex;align-items:flex-start;gap:10px;background:#fffbeb;
                border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;
                font-size:12px;color:#92400e;margin-bottom:12px;">
      <span style="flex-shrink:0;">💡</span>
      <span>Use the <strong>Superpose</strong> button above, or click a residue in the viewer to select it, then right-click and choose <strong>Superpose</strong>.</span>
      <button onclick="window._strAlnDismissHint()"
        style="flex-shrink:0;margin-left:auto;background:none;border:none;cursor:pointer;
               color:#b45309;font-size:14px;line-height:1;padding:0 0 0 8px;">×</button>
    </div>
  `;

  return `
    <div style="max-width:900px;margin:0 auto;padding:20px 16px 64px;">

      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;
                  background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;
                  padding:12px 16px;margin-bottom:14px;">
        ${chips}
        ${strState.entries.length < MAX_STRUCTURES ? `
          <button onclick="window._strAlnAddMore()"
            style="font-size:12px;color:#64748b;border:1.5px dashed #cbd5e1;border-radius:99px;
                   padding:5px 12px;background:none;cursor:pointer;font-family:'DM Sans',sans-serif;">
            ＋ Add structure
          </button>` : ''}
        <button id="str-superpose-btn" onclick="window._strAlnSuperpose()"
          style="margin-left:auto;font-size:12px;font-weight:700;color:white;
                 background:#0f4530;border:none;border-radius:7px;padding:6px 14px;cursor:pointer;
                 font-family:'DM Sans',sans-serif;flex-shrink:0;display:flex;align-items:center;gap:5px;
                 min-width:108px;justify-content:center;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Superpose
        </button>
        <button onclick="window._strAlnReset()"
          style="font-size:11px;font-weight:600;color:#64748b;background:white;
                 border:1.5px solid #e2e8f0;border-radius:7px;padding:5px 12px;cursor:pointer;
                 font-family:'DM Sans',sans-serif;flex-shrink:0;">
          ↺ Start over
        </button>
      </div>

      ${hint}

      <div style="position:relative;border-radius:12px;overflow:hidden;
                  background:${strState.bgDark ? '#0a1628' : '#ffffff'};
                  border:1px solid #e2e8f0;" id="str-viewer-outer">

        <button onclick="window._strAlnToggleBg()"
          title="${strState.bgDark ? 'Switch to light background' : 'Switch to dark background'}"
          style="position:absolute;top:10px;right:10px;z-index:10;
                 background:rgba(255,255,255,0.15);backdrop-filter:blur(4px);
                 border:1px solid rgba(255,255,255,0.2);border-radius:7px;
                 width:32px;height:32px;cursor:pointer;font-size:15px;
                 display:flex;align-items:center;justify-content:center;">
          ${strState.bgDark ? '☀️' : '🌙'}
        </button>

        <div id="str-viewer-wrap" style="height:480px;"></div>
      </div>

    </div>
  `;
}

// ── Wire events ───────────────────────────────────────────────
function wireEvents() {
  window._strAlnReset = () => {
    if (strState.viewer) { try { strState.viewer.dispose?.(); } catch {} }
    strState = { entries: [], loaded: false, bgDark: true, hintDismissed: false, viewer: null };
    render();
  };
  window._strAlnLoad = () => {
    if (strState.entries.filter(e => e.status === 'confirmed').length < 2) return;
    strState.loaded = true;
    render();
    initViewer();
  };
  window._strAlnDismissHint = () => {
    strState.hintDismissed = true;
    try { sessionStorage.setItem('str-hint-dismissed', '1'); } catch {}
    document.getElementById('str-superpose-hint')?.remove();
  };
  window._strAlnAddMore = () => {
    strState.loaded = false;
    render();
  };
  window._strAlnToggleBg = () => {
    strState.bgDark = !strState.bgDark;
    const bgColor = strState.bgDark ? 0x0a1628 : 0xffffff;
    // Mol* renders opaquely; must set via canvas3d API
    strState.viewer?.plugin?.canvas3d?.setProps({ renderer: { backgroundColor: bgColor } });
    const outer = document.getElementById('str-viewer-outer');
    if (outer) outer.style.background = strState.bgDark ? '#0a1628' : '#ffffff';
    const btn = outer?.querySelector('button[title]');
    if (btn) {
      btn.title = strState.bgDark ? 'Switch to light background' : 'Switch to dark background';
      btn.textContent = strState.bgDark ? '☀️' : '🌙';
    }
  };
  window._strAlnRetryLoad = () => {
    initViewer();
  };
  const SUPERPOSE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
  const SPIN_DIV = '<div style="width:12px;height:12px;border:1.5px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0"></div>';

  window._strAlnSuperpose = async () => {
    const plugin = strState.viewer?.plugin;
    if (!plugin) return;
    const btn = document.getElementById('str-superpose-btn');
    if (btn?.disabled) return; // prevent double-click

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `${SPIN_DIV} Superposing…`;
    }

    try {
      const structures = plugin.managers.structure.hierarchy.current.structures;
      if (structures.length < 2) throw new Error('Need at least 2 loaded structures');

      const s1 = structures[0].cell.obj?.data;
      const s2 = structures[1].cell.obj?.data;
      if (!s1 || !s2) throw new Error('Structure data not ready — try again in a moment');

      // Access Mol* utilities via the CDN lib namespace (molstar.lib.*)
      const lib = window.molstar.lib;
      const MS   = lib.molScript.language.builder.MolScriptBuilder;
      const { compile }                 = lib.molScript.runtime.query.compiler;
      const { StructureSelection, QueryContext } = lib.molModel.structure;
      const { tmAlign }                 = lib.molModel.structure.structure.util;
      const { StateTransforms }         = lib.molPluginState.transforms;

      // C-alpha atom query (backbone anchors for alignment)
      const caQuery = compile(MS.struct.generator.atomGroups({
        'atom-test': MS.core.rel.eq([
          MS.struct.atomProperty.macromolecular.label_atom_id(), 'CA'
        ])
      }));

      const sel1 = StructureSelection.toLociWithCurrentUnits(caQuery(new QueryContext(s1)));
      const sel2 = StructureSelection.toLociWithCurrentUnits(caQuery(new QueryContext(s2)));

      // Compute optimal rigid-body transform (TM-align)
      const result = tmAlign(sel1, sel2);
      if (!result?.bTransform) throw new Error('TM-align returned no transform');

      // Apply transform to structure 2 in the Mol* state tree
      const update = plugin.state.data.build()
        .to(structures[1].cell)
        .insert(StateTransforms.Model.TransformStructureConformation, {
          transform: { name: 'matrix', params: { data: result.bTransform, transpose: false } }
        });
      await plugin.runTask(plugin.state.data.updateTree(update));

      // Brief success state
      if (btn) btn.innerHTML = '✓ Superposed';
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = `${SUPERPOSE_ICON} Superpose`; }
      }, 1800);

    } catch (e) {
      console.error('[Superpose]', e);
      if (btn) { btn.disabled = false; btn.innerHTML = `${SUPERPOSE_ICON} Superpose`; }
      // Show brief fallback tip
      const outer = document.getElementById('str-viewer-outer');
      if (outer) {
        const tip = document.createElement('div');
        tip.style.cssText = 'position:absolute;bottom:52px;left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,0.88);color:white;padding:10px 18px;border-radius:10px;' +
          'font-size:12px;z-index:100;white-space:nowrap;pointer-events:none;text-align:center;' +
          'font-family:\'DM Sans\',sans-serif;';
        tip.textContent = 'Click a residue to select it, then right-click → Superpose';
        outer.appendChild(tip);
        setTimeout(() => tip.remove(), 4500);
      }
    }
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

// ── Gene search ───────────────────────────────────────────────
async function searchGenes(q) {
  const resultsEl = document.getElementById('str-search-results');
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
    const sn = strainName(g.strain_id);
    const gStr = esc(JSON.stringify(JSON.stringify(g)));
    return `
      <div data-gene-id="${g.id}"
           style="padding:9px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;
                  display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
           onmouseover="this.style.background='#f8fafc'"
           onmouseout="this.style.background='white'"
           onclick="window._strAlnPickGene(${gStr})">
        <div>
          <span style="font-weight:700;color:#0f4530;">${esc(g.locus_tag)}</span>
          ${g.gene_name ? `<span style="color:#64748b;margin-left:5px;">${esc(g.gene_name)}</span>` : ''}
        </div>
        <span style="font-size:9px;font-weight:700;background:#f1f5f9;color:${sc};
                     padding:2px 7px;border-radius:4px;">${esc(sn)}</span>
      </div>
    `;
  }).join('');

  window._strAlnPickGene = (gStr) => {
    const g = JSON.parse(gStr);
    document.getElementById('str-search').value = '';
    document.getElementById('str-search-results').style.display = 'none';
    addPrimaryGene(g);
  };
}

// ── Adding genes ──────────────────────────────────────────────
async function addPrimaryGene(gene) {
  const hasPrimary = strState.entries.some(e => e.isPrimary);
  if (strState.entries.find(e => e.gene.id === gene.id)) return; // no duplicates

  const entry = {
    id: `entry-${Date.now()}-${gene.id}`,
    gene,
    modelType: 'af2',    // default; quick-add buttons in suggestion panel can change this
    urlData: null,       // { uniprotId } | { mmcifPath } | { pdbId } — resolved at load time
    status: 'confirmed',
    isPrimary: !hasPrimary,
  };
  strState.entries.push(entry);
  reRenderEntries();

  // Fetch suggestion panel data for the primary pick only
  if (!hasPrimary) {
    await fetchAndRenderSuggestions(gene);
  }
}

function addManualEntry(gene, modelType, urlData) {
  const existingKey = `${gene.id}-${modelType}`;
  if (strState.entries.find(e => `${e.gene.id}-${e.modelType}` === existingKey)) return;
  if (strState.entries.length >= MAX_STRUCTURES) return;

  strState.entries.push({
    id: `entry-${Date.now()}-${gene.id}-${modelType}`,
    gene,
    modelType,
    urlData,
    status: 'confirmed',
    isPrimary: false,
  });
  reRenderEntries();
  updateLoadBtn();
}

function reRenderEntries() {
  const list = document.getElementById('str-entry-list');
  if (!list) return;
  list.innerHTML = strState.entries.length === 0
    ? `<div style="font-size:12px;color:#cbd5e1;font-style:italic;padding:8px 0;">Search above to add the first structure…</div>`
    : strState.entries.map(renderEntryCard).join('');
  updateLoadBtn();
}

function updateLoadBtn() {
  const btn = document.getElementById('str-load-btn');
  if (!btn) return;
  const canLoad = strState.entries.filter(e => e.status === 'confirmed').length >= 2;
  btn.disabled = !canLoad;
  btn.style.background = canLoad ? '#0f4530' : '#e2e8f0';
  btn.style.color = canLoad ? 'white' : '#94a3b8';
  btn.style.cursor = canLoad ? 'pointer' : 'not-allowed';
}

window._strAlnRemove = (id) => {
  strState.entries = strState.entries.filter(e => e.id !== id);
  reRenderEntries();
  updateLoadBtn();
};

// ── Suggestion panel ──────────────────────────────────────────
async function fetchAndRenderSuggestions(primaryGene) {
  const panel = document.getElementById('str-suggestion-panel');
  if (!panel) return;
  panel.innerHTML = `<div style="font-size:12px;color:#94a3b8;padding:8px 0;">Loading suggestions…</div>`;

  // 1. Fetch availability for primary gene
  const primaryAvail = await fetchGeneAvailability(primaryGene.id);

  // Update the primary entry's urlData so resolveUrl can work at load time
  const primaryEntry = strState.entries.find(e => e.isPrimary && e.gene.id === primaryGene.id);
  if (primaryEntry && primaryAvail.af2) {
    primaryEntry.urlData = primaryAvail.af2;
  }

  // 2. Fetch orthologs
  const { data: orthoRows } = await sb
    .from('orthologs')
    .select('gene_id_a,gene_id_b')
    .or(`gene_id_a.eq.${primaryGene.id},gene_id_b.eq.${primaryGene.id}`);

  const orthologGeneIds = (orthoRows || [])
    .map(r => r.gene_id_a === primaryGene.id ? r.gene_id_b : r.gene_id_a)
    .filter(id => id !== primaryGene.id);

  // 3. Fetch ortholog gene info + availability
  let orthologData = [];
  if (orthologGeneIds.length) {
    const { data: orthoGenes } = await sb
      .from('genes')
      .select('id,locus_tag,gene_name,strain_id')
      .in('id', orthologGeneIds);

    orthologData = await Promise.all(
      (orthoGenes || []).map(async (og) => ({
        gene: og,
        avail: await fetchGeneAvailability(og.id),
      }))
    );
  }

  if (!panel.isConnected) return; // user navigated away
  panel.innerHTML = renderSuggestionPanel(primaryGene, primaryAvail, orthologData);
  wireSuggestionButtons(primaryGene, primaryAvail, orthologData);
}

async function fetchGeneAvailability(geneId) {
  const { data } = await sb
    .from('genes')
    .select('id,proteins(uniprot_id,alphafold_results(af_version,mmcif_path,top_homolog_pdb_id))')
    .eq('id', geneId)
    .single();

  const protein = data?.proteins;
  const afRows  = protein?.alphafold_results ?? [];

  const af3Row     = afRows.find(r => r.af_version === 'AF3');
  const crystalRow = afRows.find(r => r.af_version === 'crystal');

  return {
    af2:     protein?.uniprot_id
               ? { uniprotId: protein.uniprot_id }
               : null,
    af3:     af3Row?.mmcif_path
               ? { mmcifPath: af3Row.mmcif_path }
               : null,
    crystal: crystalRow?.top_homolog_pdb_id
               ? { pdbId: crystalRow.top_homolog_pdb_id }
               : null,
  };
}

function renderSuggestionPanel(primaryGene, primaryAvail, orthologData) {
  const alreadyAdded = (geneId, modelType) =>
    strState.entries.some(e => e.gene.id === geneId && e.modelType === modelType);

  const atMax = strState.entries.length >= MAX_STRUCTURES;

  function modelBtn(geneId, modelType, avail) {
    const labels   = { af2: 'AF2', af3: 'AF3', crystal: 'Crystal' };
    const colors   = {
      af2:     { color: '#1d4ed8', border: '#bfdbfe' },
      af3:     { color: '#7c3aed', border: '#e9d5ff' },
      crystal: { color: '#c2410c', border: '#fed7aa' },
    };
    const c        = colors[modelType];
    const added    = alreadyAdded(geneId, modelType);
    const disabled = !avail || added || atMax;

    let title = '';
    if (!avail)    title = 'Not available for this protein';
    else if (added) title = 'Already in list';
    else if (atMax) title = `Maximum ${MAX_STRUCTURES} structures`;

    return `
      <button
        data-gene-id="${esc(geneId)}" data-model="${esc(modelType)}"
        ${disabled ? 'disabled' : ''}
        title="${esc(title)}"
        style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:99px;border:1.5px solid;
               cursor:${disabled ? 'not-allowed' : 'pointer'};background:white;
               font-family:'DM Sans',sans-serif;
               color:${disabled ? '#d1d5db' : c.color};
               border-color:${disabled ? '#e5e7eb' : c.border};
               opacity:${disabled ? '0.5' : '1'};">
        ${added ? `${labels[modelType]} ✓` : `+ ${labels[modelType]}`}
      </button>
    `;
  }

  const sameGeneRow = `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#374151;">
          ${esc(primaryGene.locus_tag)}${primaryGene.gene_name ? ` · ${esc(primaryGene.gene_name)}` : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;margin-top:1px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${strainColor(primaryGene.strain_id)};display:inline-block;"></span>
          ${esc(strainName(primaryGene.strain_id))}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${modelBtn(primaryGene.id, 'af2', primaryAvail.af2)}
        ${modelBtn(primaryGene.id, 'af3', primaryAvail.af3)}
        ${modelBtn(primaryGene.id, 'crystal', primaryAvail.crystal)}
      </div>
    </div>
  `;

  const divider = orthologData.length ? `
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
                color:#cbd5e1;text-align:center;margin:8px 0 6px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
      or pick an ortholog
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
    </div>
  ` : '';

  const orthologRows = orthologData.map(({ gene, avail }) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:#374151;">
          ${esc(gene.locus_tag)}${gene.gene_name ? ` · ${esc(gene.gene_name)}` : ''}
        </div>
        <div style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;margin-top:1px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${strainColor(gene.strain_id)};display:inline-block;"></span>
          ${esc(strainName(gene.strain_id))}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${modelBtn(gene.id, 'af2', avail.af2)}
        ${modelBtn(gene.id, 'af3', avail.af3)}
        ${modelBtn(gene.id, 'crystal', avail.crystal)}
      </div>
    </div>
  `).join('');

  return `
    <div style="max-width:680px;background:white;border:1.5px solid #e2e8f0;border-radius:12px;
                padding:14px 16px;margin-top:14px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;
                  color:#94a3b8;margin-bottom:10px;">Quick add</div>
      ${sameGeneRow}
      ${divider}
      ${orthologRows}
    </div>
  `;
}

function wireSuggestionButtons(primaryGene, primaryAvail, orthologData) {
  const panel = document.getElementById('str-suggestion-panel');
  if (!panel) return;

  const geneMap = new Map();
  geneMap.set(primaryGene.id, { gene: primaryGene, avail: primaryAvail });
  for (const { gene, avail } of orthologData) {
    geneMap.set(gene.id, { gene, avail });
  }

  panel.querySelectorAll('button[data-gene-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const geneId    = btn.dataset.geneId;
      const modelType = btn.dataset.model;
      const entry     = geneMap.get(geneId);
      if (!entry) return;

      const urlData =
        modelType === 'af2'     ? entry.avail.af2 :
        modelType === 'af3'     ? entry.avail.af3 :
        modelType === 'crystal' ? entry.avail.crystal : null;

      addManualEntry(entry.gene, modelType, urlData);

      // Re-render suggestion panel to reflect new state (e.g. mark button as ✓)
      panel.innerHTML = renderSuggestionPanel(primaryGene, primaryAvail, orthologData);
      wireSuggestionButtons(primaryGene, primaryAvail, orthologData);
    });
  });
}

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

// ── Mol* bundle ───────────────────────────────────────────────
let _bundlePromise = null;

function _loadMolstarBundle() {
  if (window.molstar) return Promise.resolve();
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

// ── URL resolution ────────────────────────────────────────────
async function resolveUrl(entry) {
  if (entry.modelType === 'af3' && entry.urlData?.mmcifPath) {
    return entry.urlData.mmcifPath;
  }
  if (entry.modelType === 'crystal' && entry.urlData?.pdbId) {
    return `https://files.rcsb.org/download/${encodeURIComponent(entry.urlData.pdbId)}.cif`;
  }
  if (entry.modelType === 'af2') {
    // urlData may be null if the entry was added via search before availability resolved;
    // fetch the uniprot_id on-demand in that case
    if (!entry.urlData?.uniprotId) {
      const avail = await fetchGeneAvailability(entry.gene.id);
      if (!avail.af2?.uniprotId) throw new Error(`No AlphaFold 2 model available for ${entry.gene.locus_tag}`);
      entry.urlData = avail.af2;
    }
    const res = await fetch(
      `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(entry.urlData.uniprotId)}`
    );
    if (!res.ok) throw new Error(`AFDB API error for ${entry.urlData.uniprotId}: ${res.status}`);
    const data = await res.json();
    const cifUrl = data[0]?.cifUrl;
    if (!cifUrl) throw new Error(`No cifUrl returned for ${entry.urlData.uniprotId}`);
    return cifUrl;
  }
  throw new Error(`Cannot resolve URL for entry ${entry.id} (modelType: ${entry.modelType})`);
}

// ── Viewer init ───────────────────────────────────────────────
async function initViewer() {
  const container = document.getElementById('str-viewer-wrap');
  if (!container) return;

  if (strState.viewer) { try { strState.viewer.dispose?.(); } catch {} strState.viewer = null; }

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:32px 20px;">
      <div style="width:18px;height:18px;border:2px solid #0f4530;border-top-color:transparent;
                  border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <span id="str-viewer-status" style="font-size:13px;color:#64748b;">Resolving structure URLs…</span>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  const confirmedEntries = strState.entries.filter(e => e.status === 'confirmed');

  try {
    const urls = await Promise.all(confirmedEntries.map(resolveUrl));
    setViewerStatus('Loading Mol* viewer…');

    await _loadMolstarBundle();
    setViewerStatus('Initializing viewer…');

    const vpId  = 'str-vp-' + Date.now();
    const vpDiv = document.createElement('div');
    vpDiv.id    = vpId;
    vpDiv.style.cssText = 'position:absolute;inset:0;';
    container.style.position = 'relative';
    container.innerHTML = '';
    container.appendChild(vpDiv);

    const v = await molstar.Viewer.create(vpId, {
      layoutIsExpanded:          false,
      layoutShowControls:        false,
      layoutShowRemoteState:     false,
      layoutShowSequence:        false,
      layoutShowLog:             false,
      layoutShowLeftPanel:       false,
      viewportShowExpand:        true,
      viewportShowSelectionMode: false,
      viewportShowAnimation:     false,
    });

    // Set canvas background before loading structures
    v.plugin.canvas3d?.setProps({ renderer: { backgroundColor: strState.bgDark ? 0x0a1628 : 0xffffff } });

    for (let i = 0; i < urls.length; i++) {
      setViewerStatus(`Loading structure ${i + 1} of ${urls.length}…`);
      await v.loadStructureFromUrl(urls[i], 'mmcif');
    }

    strState.viewer = v;

    // Apply per-strain colors so structures are visually distinguishable
    try {
      const loaded = v.plugin.managers.structure.hierarchy.current.structures;
      for (let i = 0; i < Math.min(loaded.length, confirmedEntries.length); i++) {
        const color = hexToMolColor(strainColor(confirmedEntries[i].gene.strain_id));
        await v.plugin.managers.structure.component.updateRepresentationsTheme(
          loaded[i].components,
          { color: { name: 'uniform', params: { value: color } } }
        );
      }
    } catch (e) {
      console.warn('[StructureAlignment] per-strain coloring failed:', e.message);
    }

    const suppress = document.createElement('style');
    suppress.textContent = `
      #${vpId} button[title="Screenshot / State Snapshot"],
      #${vpId} button[title="Toggle Controls Panel"],
      #${vpId} button[title="Settings / Controls Info"] { display:none !important; }`;
    document.head.appendChild(suppress);

  } catch (err) {
    console.error('[StructureAlignment] viewer init failed:', err);
    if (document.getElementById('str-viewer-wrap')) {
      container.innerHTML = `
        <div style="padding:24px;color:#be123c;font-size:13px;background:#fff1f2;
                    border:1.5px solid #fecdd3;border-radius:10px;margin:16px;">
          ⚠ ${esc(err.message)}
          <button onclick="window._strAlnRetryLoad()"
            style="margin-left:12px;background:#0f4530;color:white;border:none;border-radius:6px;
                   padding:4px 12px;font-size:12px;cursor:pointer;">Retry</button>
        </div>`;
    }
  }
}

function setViewerStatus(msg) {
  const el = document.getElementById('str-viewer-status');
  if (el) el.textContent = msg;
}
