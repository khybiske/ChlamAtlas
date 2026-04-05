// ChlamAtlas — Home tab
import { sb, state } from '../app.js';

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

export async function renderHome(container) {
  // Build full-bleed page — container has no max-width constraint
  container.innerHTML = `
    <!-- ── Masthead ── -->
    <div class="home-masthead" style="background:#0f4530;overflow:hidden;position:relative;">
      <!-- Subtle decorative circle -->
      <div style="position:absolute;right:-80px;top:-80px;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,0.025);pointer-events:none;"></div>
      <div class="max-w-5xl mx-auto px-5 sm:px-8" style="padding-top:2.75rem;padding-bottom:2.75rem;position:relative;z-index:1;">
        <!-- Desktop: two-column; Mobile: stacked -->
        <div class="sm:grid sm:gap-12" style="grid-template-columns:1fr auto;align-items:end;">
          <div>
            <h1 class="font-display font-bold text-white" style="font-size:clamp(2.75rem,7vw,4.25rem);line-height:1;margin-bottom:0.75rem;letter-spacing:-0.01em;">ChlamAtlas</h1>
            <p style="font-size:0.9375rem;color:rgba(255,255,255,0.6);line-height:1.65;max-width:30rem;">
              The integrated research database for <em style="color:rgba(255,255,255,0.85);font-style:italic;">Chlamydia</em> —
              genomics, mutant phenotypes, structural biology, and multi-lab
              pipeline tracking across three model strains.
            </p>
          </div>
          <!-- Stats — right column desktop, horizontal row mobile -->
          <div id="mast-stats" class="flex sm:flex-col gap-0 sm:gap-4 mt-5 sm:mt-0">
            <!-- Skeleton while loading -->
            <div class="flex sm:hidden gap-0 w-full" id="stats-row-mobile">
              ${[0,1,2].map(() => `
                <div class="flex-1 px-3 sm:px-0" style="border-right:1px solid rgba(255,255,255,0.1);">
                  <div class="skeleton" style="height:1.25rem;width:3rem;margin-bottom:0.25rem;background:rgba(255,255,255,0.12);animation:pulse 1.5s ease-in-out infinite;border-radius:4px;"></div>
                  <div class="skeleton" style="height:0.625rem;width:2rem;background:rgba(255,255,255,0.08);animation:pulse 1.5s ease-in-out infinite;border-radius:4px;"></div>
                </div>`).join('')}
            </div>
            <div class="hidden sm:flex sm:flex-col sm:gap-4 sm:items-end" id="stats-col-desktop">
              ${[0,1,2].map(() => `
                <div class="text-right">
                  <div class="skeleton" style="height:1.875rem;width:4rem;margin-bottom:0.25rem;margin-left:auto;background:rgba(255,255,255,0.12);animation:pulse 1.5s ease-in-out infinite;border-radius:4px;"></div>
                  <div class="skeleton" style="height:0.625rem;width:3rem;margin-left:auto;background:rgba(255,255,255,0.08);animation:pulse 1.5s ease-in-out infinite;border-radius:4px;"></div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Entry blocks ── -->
    <div id="entry-blocks" style="background:white;border-bottom:1px solid #ececec;"></div>

    <!-- ── Lower section ── -->
    <div style="background:white;">
      <div class="max-w-5xl mx-auto px-5 sm:px-8" style="padding-top:2.25rem;padding-bottom:3rem;">
        <div class="sm:grid sm:gap-14" style="grid-template-columns:1fr 1fr;">
          <div id="organisms-section"></div>
          <div id="updates-section" class="mt-8 sm:mt-0"></div>
        </div>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div id="home-footer"></div>

    <!-- ── Citation modal ── -->
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

  // Wire citation modal close
  container.querySelector('#citation-close').addEventListener('click', () => {
    container.querySelector('#citation-modal').classList.add('hidden');
  });
  container.querySelector('#citation-modal').addEventListener('click', (e) => {
    if (e.target === container.querySelector('#citation-modal'))
      container.querySelector('#citation-modal').classList.add('hidden');
  });

  // Load all sections in parallel
  loadStats(container);
  renderEntryBlocks(container);
  loadOrganisms(container);
  loadUpdates(container);
  renderFooter(container);
  loadCitation(container);
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

  // Also update entry block meta counts (populated by renderEntryBlocks in Task 5)
  const ebGene = container.querySelector('#eb-gene-count');
  const ebMutant = container.querySelector('#eb-mutant-count');
  if (ebGene) ebGene.textContent = geneRes.count?.toLocaleString() ?? '—';
  if (ebMutant) ebMutant.textContent = mutantRes.count?.toLocaleString() ?? '—';
}

function renderEntryBlocks(container) {
  const isLabMember = ['lab_member', 'admin'].includes(state.userRole);

  // Blocks always shown
  const blocks = [
    {
      icon: '🧬', verb: 'Browse',      title: 'Genomes',
      meta: '<span id="eb-gene-count">—</span> genes · 3 strains',
      tab: 'genomes', disabled: false,
    },
    {
      icon: '🔬', verb: 'Explore',     title: 'Mutants',
      meta: '<span id="eb-mutant-count">—</span>+ characterized',
      tab: 'mutants', disabled: false,
    },
  ];

  // Pipeline: lab members only
  if (isLabMember) {
    blocks.push({
      icon: '⚗️', verb: 'Track', title: 'Pipeline',
      meta: 'Multi-lab progress',
      tab: 'pipeline', disabled: false,
    });
  }

  // Search: always last, always disabled
  blocks.push({
    icon: '🔍', verb: 'Coming soon', title: 'Search',
    meta: 'Universal search',
    tab: null, disabled: true,
  });

  const isMobile = window.innerWidth < 640;

  const el = container.querySelector('#entry-blocks');
  if (!el) return;

  if (!isMobile) {
    // Desktop: flex row
    el.style.cssText = '';
    el.innerHTML = `
      <div class="max-w-5xl mx-auto" style="display:grid;grid-template-columns:repeat(${blocks.length},1fr);">
        ${blocks.map((b, i) => entryBlockHTML(b, i < blocks.length - 1 ? 'border-right:1px solid #ececec;' : '')).join('')}
      </div>`;
  } else if (isLabMember) {
    // Mobile 2×2
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;">
        ${blocks.map((b, i) => {
          const borderRight = (i % 2 === 0) ? 'border-right:1px solid #ececec;' : '';
          const borderBottom = (i < 2) ? 'border-bottom:1px solid #ececec;' : '';
          return entryBlockHTML(b, borderRight + borderBottom);
        }).join('')}
      </div>`;
  } else {
    // Mobile guest: Genomes | Mutants top row, Search full-width below
    const [genomesBlock, mutantsBlock, searchBlock] = blocks;
    el.innerHTML = `
      <div style="border-bottom:1px solid #ececec;display:grid;grid-template-columns:1fr 1fr;">
        ${entryBlockHTML(genomesBlock, 'border-right:1px solid #ececec;')}
        ${entryBlockHTML(mutantsBlock, '')}
      </div>
      <div style="display:flex;align-items:center;gap:1rem;padding:1.125rem 1.25rem 1rem;opacity:0.32;cursor:default;">
        <span style="font-size:1.375rem;">${searchBlock.icon}</span>
        <div>
          <div style="font-size:0.59375rem;font-weight:700;text-transform:uppercase;letter-spacing:0.11em;color:#1a6b4a;margin-bottom:0.25rem;">${searchBlock.verb}</div>
          <div style="font-size:1.0625rem;font-weight:600;color:#111;margin-bottom:0.25rem;">${searchBlock.title}</div>
          <div class="font-mono" style="font-size:0.75rem;color:#bbb;">${searchBlock.meta}</div>
        </div>
      </div>`;
  }

  // Wire up click handlers (non-disabled blocks only)
  el.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.navTab;
      if (tab) window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab } }));
    });
  });
}

function entryBlockHTML(block, borderStyle) {
  const cursor = block.disabled ? 'cursor:default;' : 'cursor:pointer;';
  const opacity = block.disabled ? 'opacity:0.32;' : '';
  const hover = block.disabled ? '' : 'data-nav-tab="' + block.tab + '"';
  return `
    <div ${hover}
      style="padding:1.125rem 1.25rem 1rem;${borderStyle}${cursor}${opacity}transition:background 0.15s;"
      ${!block.disabled ? 'onmouseenter="this.style.background=\'#f9fafb\'" onmouseleave="this.style.background=\'\'"' : ''}>
      <span style="font-size:1.375rem;margin-bottom:0.5rem;display:block;">${block.icon}</span>
      <div style="font-size:0.59375rem;font-weight:700;text-transform:uppercase;letter-spacing:0.11em;color:#1a6b4a;margin-bottom:0.25rem;">${block.verb}</div>
      <div style="font-size:1.0625rem;font-weight:600;color:#111;margin-bottom:0.25rem;">${block.title}</div>
      <div class="font-mono" style="font-size:0.75rem;color:#bbb;">${block.meta}</div>
    </div>`;
}

async function loadOrganisms(container) {
  // Query gene counts per strain using embedded count
  const { data: strains } = await sb
    .from('strains')
    .select('id, common_name, genes(count)')
    .eq('is_active', true);

  const el = container.querySelector('#organisms-section');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:0.5875rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:0.875rem;">
      Model Organisms
    </div>
    ${ORGANISMS.map(org => {
      // Match by common_name (CT-L2, CT-D, CM)
      const strain = strains?.find(s => s.common_name === org.id);
      const count = strain?.genes?.[0]?.count;
      const countText = count != null ? `<span class="font-mono" style="font-size:0.6875rem;color:#ccc;">${Number(count).toLocaleString()} genes</span>` : '';
      return `
        <button data-strain="${org.id}"
          style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid #f3f3f3;width:100%;text-align:left;background:none;border-left:none;border-right:none;border-top:none;cursor:pointer;"
          onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='1'">
          <div style="width:3px;height:2.25rem;border-radius:2px;background:${org.color};flex-shrink:0;"></div>
          <div style="flex:1;">
            <div style="font-size:0.875rem;font-style:italic;color:#222;font-weight:500;">${org.species}</div>
            <div style="font-size:0.7188rem;color:#bbb;margin-top:1px;">${org.label} · ${org.desc}</div>
          </div>
          ${countText}
          <span style="color:#ddd;font-size:1.125rem;margin-left:0.25rem;">›</span>
        </button>`;
    }).join('')}`;

  // Wire up navigation — pass strain preference to genomes view
  el.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__preferredStrain = btn.dataset.strain;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
    });
  });
}
// Map site_updates category values to organism colors
const UPDATE_COLORS = {
  'CT-L2':      '#16a34a',
  'CT-D':       '#4b2e83',
  'CM':         '#2563eb',
  'Structures': '#1a6b4a',
};

async function loadUpdates(container) {
  const { data } = await sb
    .from('site_updates')
    .select('id, title, category, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

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
function renderFooter(container) { /* Task 7 */ }
async function loadCitation(container) { /* Task 7 */ }

async function loadSpotlight(container) {
  const { data } = await sb.from('site_config').select('*').eq('key', 'spotlight').maybeSingle();
  const el = container.querySelector('#spotlight-card');
  if (!el) return;

  if (!data?.title) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="rounded-2xl border border-gray-100 bg-gradient-to-br from-[#f0fdf4] to-white p-5">
      <p class="text-xs font-semibold text-brand uppercase tracking-widest mb-2">Featured</p>
      <h3 class="font-semibold text-gray-900 text-base leading-snug mb-2">${data.title}</h3>
      ${data.body ? `<p class="text-sm text-gray-600 leading-relaxed mb-3">${data.body}</p>` : ''}
      ${data.link_url ? `<a href="${data.link_url}" class="text-sm font-medium text-brand hover:underline">${data.link_label ?? 'Learn more'} →</a>` : ''}
    </div>`;
}

const CATEGORY_COLORS = {
  'CT-L2':      '#16a34a',
  'CT-D':       '#4b2e83',
  'CM':         '#2563eb',
  'Structures': '#1a6b4a',
  'default':    '#6b7280',
};

async function _oldLoadUpdates(container) {
  const { data } = await sb
    .from('site_updates')
    .select('id, title, category, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const el = container.querySelector('#updates-list');
  if (!el) return;

  if (!data?.length) {
    el.innerHTML = `<p class="text-sm text-gray-400 text-center py-6">No recent updates.</p>`;
    return;
  }

  el.innerHTML = data.map(u => {
    const color = CATEGORY_COLORS[u.category] ?? CATEGORY_COLORS.default;
    const date = new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `
      <div class="flex items-center gap-3 px-4 py-3 bg-white">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${color};"></span>
        <span class="text-sm text-gray-800 flex-1 leading-snug">${u.title}</span>
        <span class="text-xs text-gray-400 flex-shrink-0">${date}</span>
      </div>`;
  }).join('');
}
