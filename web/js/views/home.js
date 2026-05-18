// ChlamAtlas — Home tab
import { sb, state } from '../client.js?v=64';

const ORGANISMS = [
  {
    id:      'CT-L2',
    species: 'C. trachomatis L2/434',
    label:   'CT-L2',
    desc:    'Primary experimental strain',
    color:   '#16a34a',
  },
  {
    id:      'CT-D',
    species: 'C. trachomatis D/UW-3',
    label:   'CT-D',
    desc:    'Discovered at UW',
    color:   '#4b2e83',
  },
  {
    id:      'CM',
    species: 'C. muridarum Nigg',
    label:   'CM',
    desc:    'Mouse model strain',
    color:   '#2563eb',
  },
];

const COLLECTIONS = [
  { id: 'CT_L2',    label: 'C. trachomatis', sub: 'CT-L2',   avatarBg: '#dcfce7', emoji: '🧫' },
  { id: 'CM',       label: 'C. muridarum',   sub: 'CM',      avatarBg: '#dbeafe', emoji: '🐭' },
  { id: 'Lucky17',  label: 'Lucky 17',        sub: 'Curated', avatarBg: '#fef9c3', emoji: '⭐' },
  { id: 'Chimeras', label: 'Chimeras',        sub: 'L2 × CM', avatarBg: '#fdf4ff', emoji: '🔀' },
];

export async function renderHome(container) {
  container.innerHTML = `
    <!-- ── Masthead ── -->
    <div class="home-masthead" style="background:#0f4530;overflow:hidden;position:relative;">
      <div style="position:absolute;right:-80px;top:-80px;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,0.025);pointer-events:none;"></div>
      <div class="max-w-5xl mx-auto px-5 sm:px-8" style="padding-top:2.75rem;padding-bottom:2.75rem;position:relative;z-index:1;">
        <div class="sm:grid sm:gap-12" style="grid-template-columns:1fr auto;align-items:end;">
          <div>
            <h1 class="font-display font-bold text-white" style="font-size:clamp(2.75rem,7vw,4.25rem);line-height:1;margin-bottom:0.75rem;letter-spacing:-0.01em;">ChlamAtlas</h1>
            <p style="font-size:0.9375rem;color:rgba(255,255,255,0.6);line-height:1.65;max-width:30rem;">
              The integrated research database for <em style="color:rgba(255,255,255,0.85);font-style:italic;">Chlamydia</em> —
              genomics, mutant phenotypes, structural biology, and multi-lab
              pipeline tracking across three model strains.
            </p>
          </div>
          <div id="mast-stats" class="flex sm:flex-col gap-0 sm:gap-4 mt-5 sm:mt-0">
            <div class="flex sm:hidden gap-0 w-full" id="stats-row-mobile">
              ${[0,1,2].map(() => `
                <div class="flex-1 px-3 sm:px-0" style="border-right:1px solid rgba(255,255,255,0.1);">
                  <div style="height:1.25rem;width:3rem;margin-bottom:0.25rem;background:rgba(255,255,255,0.12);border-radius:4px;"></div>
                  <div style="height:0.625rem;width:2rem;background:rgba(255,255,255,0.08);border-radius:4px;"></div>
                </div>`).join('')}
            </div>
            <div class="hidden sm:flex sm:flex-col sm:gap-4 sm:items-end" id="stats-col-desktop">
              ${[0,1,2].map(() => `
                <div class="text-right">
                  <div style="height:1.875rem;width:4rem;margin-bottom:0.25rem;margin-left:auto;background:rgba(255,255,255,0.12);border-radius:4px;"></div>
                  <div style="height:0.625rem;width:3rem;margin-left:auto;background:rgba(255,255,255,0.08);border-radius:4px;"></div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Three-column main content ── -->
    <div style="background:white;">
      <div style="max-width:960px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr 1fr;">
        <div id="col-genomes"   style="padding:36px 28px 40px;border-right:1px solid #f0f0f0;"></div>
        <div id="col-mutants"   style="padding:36px 28px 40px;border-right:1px solid #f0f0f0;"></div>
        <div id="col-community" style="padding:36px 28px 40px;"></div>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div id="home-footer"></div>

    <!-- ── Citation modal (unchanged) ── -->
    <div id="citation-modal" class="hidden fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div class="px-6 py-5" style="background:#0f4530;">
          <h2 class="font-display font-bold text-white text-xl leading-tight">How to cite</h2>
        </div>
        <div class="p-6">
          <p id="citation-text" class="text-sm text-gray-700 font-mono leading-relaxed bg-gray-50 rounded-lg p-4 mb-4" style="white-space:pre-wrap;"></p>
          <button id="citation-copy"
            class="w-full text-white rounded-lg py-2.5 text-sm font-semibold transition mb-3"
            style="background:#0f4530;">Copy citation</button>
          <button id="citation-close" class="w-full text-center text-sm text-gray-400 hover:text-gray-600">Close</button>
        </div>
      </div>
    </div>
  `;

  // Wire citation modal
  container.querySelector('#citation-close').addEventListener('click', () => {
    container.querySelector('#citation-modal').classList.add('hidden');
  });
  container.querySelector('#citation-modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#citation-modal'))
      container.querySelector('#citation-modal').classList.add('hidden');
  });

  // Load all sections in parallel
  loadStats(container);
  renderGenomesColumn(container);
  renderMutantsColumn(container);
  renderCommunityColumn(container);
  renderFooter(container);
  loadCitation(container);
}

function renderGenomesColumn(container) {
  const el = container.querySelector('#col-genomes');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:18px;">
      🧬 Genomes
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;">
      ${ORGANISMS.map(org => `
        <button data-strain="${org.id}"
          style="display:flex;flex-direction:column;align-items:flex-start;width:100%;
                 background:white;border:1px solid #e5e7eb;border-left:3px solid ${org.color};
                 border-radius:7px;padding:12px 14px;cursor:pointer;text-align:left;transition:background 0.15s;"
          onmouseenter="this.style.background='#fafafa'" onmouseleave="this.style.background='white'">
          <div style="font-size:13px;font-weight:700;color:${org.color};margin-bottom:3px;">${org.label}</div>
          <div style="font-size:12px;font-style:italic;color:#444;">${org.species}</div>
          <div id="gene-count-${org.id}" style="font-size:11px;color:#bbb;font-family:var(--font-mono,'DM Mono',monospace);margin-top:5px;">— genes</div>
        </button>`).join('')}
    </div>`;

  el.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__preferredStrain = btn.dataset.strain;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
    });
  });

  loadGenomeCounts(container);
}

async function loadGenomeCounts(container) {
  try {
    const { data } = await sb
      .from('strains')
      .select('common_name, genes(count)')
      .eq('is_active', true);

    (data || []).forEach(strain => {
      const count = strain.genes?.[0]?.count;
      if (count == null) return;
      const el = container.querySelector(`#gene-count-${strain.common_name}`);
      if (el) el.textContent = `${Number(count).toLocaleString()} genes`;
    });
  } catch (err) {
    console.error('loadGenomeCounts:', err);
  }
}

function renderMutantsColumn(container) {
  const el = container.querySelector('#col-mutants');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:18px;">
      🔬 Mutants
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;">
      ${COLLECTIONS.map(c => `
        <button data-collection="${c.id}"
          style="display:flex;align-items:center;gap:12px;width:100%;
                 background:white;border:1px solid #e5e7eb;border-radius:7px;
                 padding:11px 13px;cursor:pointer;text-align:left;transition:background 0.15s;"
          onmouseenter="this.style.background='#fafafa'" onmouseleave="this.style.background='white'">
          <div style="width:36px;height:36px;border-radius:50%;background:${c.avatarBg};
                      flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;">
            ${c.emoji}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#111;">${c.label}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px;">
              ${c.sub} · <span id="mut-count-${c.id}">—</span>
            </div>
          </div>
          <span style="color:#e5e7eb;font-size:18px;line-height:1;flex-shrink:0;">›</span>
        </button>`).join('')}
    </div>`;

  el.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__mutantCollection = btn.dataset.collection;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'mutants' } }));
    });
  });

  loadMutantCounts(container);
}

async function loadMutantCounts(container) {
  try {
    const results = await Promise.all(
      COLLECTIONS.map(c =>
        sb.from('mutants')
          .select('id', { count: 'exact', head: true })
          .eq('collection', c.id)
      )
    );
    COLLECTIONS.forEach((c, i) => {
      const count = results[i].count;
      if (count == null) return;
      const el = container.querySelector(`#mut-count-${c.id}`);
      if (el) el.textContent = `${Number(count).toLocaleString()} mutants`;
    });
  } catch (err) {
    console.error('loadMutantCounts:', err);
  }
}

function renderCommunityColumn(container) {
  // Implemented in Task 6
}

async function loadStats(container) {
  const [geneRes, mutantRes] = await Promise.all([
    sb.from('genes').select('id', { count: 'exact', head: true }),
    sb.from('mutants').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { value: geneRes.count?.toLocaleString() ?? '—', label: 'Genes' },
    { value: mutantRes.count?.toLocaleString() ?? '—', label: 'Mutants' },
    { value: '3', label: 'Strains' },
  ];

  // Mobile horizontal row
  const mobileEl = container.querySelector('#stats-row-mobile');
  if (mobileEl) {
    mobileEl.innerHTML = stats.map((s, i) => `
      <div class="flex-1 px-3 first:pl-0 last:pr-0 last:border-r-0"
           style="border-right:1px solid rgba(255,255,255,0.12);">
        <span class="font-mono font-medium text-white block" style="font-size:1.2rem;line-height:1;">${s.value}</span>
        <span class="block" style="font-size:0.5875rem;color:rgba(255,255,255,0.42);text-transform:uppercase;letter-spacing:0.08em;margin-top:0.2rem;">${s.label}</span>
      </div>`).join('');
  }

  // Desktop stacked column
  const desktopEl = container.querySelector('#stats-col-desktop');
  if (desktopEl) {
    desktopEl.innerHTML = stats.map(s => `
      <div class="text-right">
        <span class="font-mono font-medium text-white block" style="font-size:1.875rem;line-height:1;">${s.value}</span>
        <span class="block" style="font-size:0.625rem;color:rgba(255,255,255,0.42);text-transform:uppercase;letter-spacing:0.09em;margin-top:0.2rem;">${s.label}</span>
      </div>`).join('');
  }

}


// Map site_updates category values to organism colors
const UPDATE_COLORS = {
  'CT-L2':      '#16a34a',
  'CT-D':       '#4b2e83',
  'CM':         '#2563eb',
  'Structures': '#1a6b4a',
};

async function loadUpdates(container) {
  let data;
  try {
    const { data: rows } = await sb
      .from('site_updates')
      .select('id, title, category, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    data = rows;
  } catch (err) {
    console.error('loadUpdates:', err);
    return;
  }

  const el = container.querySelector('#updates-section');
  if (!el || !data?.length) return;

  el.innerHTML = `
    <div style="font-size:0.5875rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:0.875rem;">
      Recent Updates
    </div>
    ${data.map(u => {
      const color = UPDATE_COLORS[u.category] ?? '#9ca3af';
      const date = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `
        <div style="display:flex;align-items:flex-start;gap:0.625rem;padding:0.625rem 0;border-bottom:1px solid #f5f5f5;">
          <div style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;margin-top:0.3125rem;"></div>
          <div style="font-size:0.8125rem;color:#444;line-height:1.45;flex:1;">${u.title}</div>
          <div style="font-size:0.6563rem;color:#ccc;white-space:nowrap;padding-left:0.5rem;">${date}</div>
        </div>`;
    }).join('')}`;
}
function renderFooter(container) {
  const el = container.querySelector('#home-footer');
  if (!el) return;

  el.innerHTML = `
    <div style="background:#f9f9f9;border-top:1px solid #efefef;">
      <div class="max-w-5xl mx-auto px-5 sm:px-8" style="padding-top:1.125rem;padding-bottom:1rem;">
        <div style="font-size:0.71875rem;font-weight:600;color:#444;margin-bottom:0.2rem;">Hybiske Lab</div>
        <div style="font-size:0.6875rem;color:#aaa;margin-bottom:0.75rem;">University of Washington · Seattle, WA</div>
        <div style="display:flex;gap:1rem;">
          <button id="btn-how-to-cite"
            style="font-size:0.6875rem;color:#1a6b4a;background:none;border:none;cursor:pointer;padding:0;">
            How to cite
          </button>
          <a href="https://github.com/khybiske/ChlamAtlas" target="_blank" rel="noopener"
            style="font-size:0.6875rem;color:#1a6b4a;text-decoration:none;">GitHub</a>
          <a href="mailto:khybiske@uw.edu"
            style="font-size:0.6875rem;color:#1a6b4a;text-decoration:none;">Contact</a>
        </div>
      </div>
    </div>`;

  el.querySelector('#btn-how-to-cite').addEventListener('click', () => {
    container.querySelector('#citation-modal').classList.remove('hidden');
  });
}
const DEFAULT_CITATION = `Hybiske et al., manuscript in preparation.
ChlamAtlas: an integrated Chlamydia research database.
https://chlamatlas.org — Hybiske Lab, University of Washington.`;

async function loadCitation(container) {
  let citationText = DEFAULT_CITATION;
  try {
    const { data } = await sb
      .from('site_config')
      .select('value')
      .eq('key', 'citation')
      .maybeSingle();
    if (data?.value) citationText = data.value;
  } catch (err) {
    console.error('loadCitation:', err);
    // fall through — use DEFAULT_CITATION
  }

  const textEl = container.querySelector('#citation-text');
  if (textEl) textEl.textContent = citationText;

  const copyBtn = container.querySelector('#citation-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(citationText);
        copyBtn.textContent = 'Copied!';
      } catch (err) {
        console.error('clipboard write failed:', err);
        copyBtn.textContent = 'Copy failed';
      }
      setTimeout(() => { copyBtn.textContent = 'Copy citation'; }, 2000);
    });
  }
}
