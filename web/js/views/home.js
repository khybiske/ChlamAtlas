// ChlamAtlas — Home tab
import { sb, state } from '../app.js';

const STRAIN_CARDS = [
  {
    id: 'CT-L2',
    species: 'Chlamydia trachomatis',
    strain: 'L2/434',
    abbr: 'CT-L2',
    emoji: '🫛',
    color: '#7c3aed',
    colorLight: '#f5f3ff',
    desc: 'Primary experimental strain',
  },
  {
    id: 'CT-D',
    species: 'Chlamydia trachomatis',
    strain: 'D/UW-3',
    abbr: 'CT-D',
    emoji: '🔵',
    color: '#1d4ed8',
    colorLight: '#eff6ff',
    desc: 'Reference sequenced strain',
  },
  {
    id: 'CM',
    species: 'Chlamydia muridarum',
    strain: 'Nigg',
    abbr: 'CM',
    emoji: '🐭',
    color: '#c2410c',
    colorLight: '#fff7ed',
    desc: 'Mouse model strain',
  },
];

export async function renderHome(container) {
  const greeting = state.user
    ? `Hello, ${state.user.email.split('@')[0]}`
    : null;

  container.innerHTML = `
    <!-- Hero -->
    <div class="relative overflow-hidden rounded-2xl mt-5 mb-6" style="background:#0f4530;">
      <!-- Globe SVG backdrop (decorative) -->
      <svg class="absolute right-0 top-0 h-full opacity-10" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="100" r="90" stroke="white" stroke-width="1.5"/>
        <ellipse cx="100" cy="100" rx="40" ry="90" stroke="white" stroke-width="1.5"/>
        <ellipse cx="100" cy="100" rx="70" ry="90" stroke="white" stroke-width="1.5"/>
        <line x1="10" y1="100" x2="190" y2="100" stroke="white" stroke-width="1.5"/>
        <line x1="100" y1="10" x2="100" y2="190" stroke="white" stroke-width="1.5"/>
        <path d="M20 60 Q100 40 180 60" stroke="white" stroke-width="1"/>
        <path d="M15 140 Q100 160 185 140" stroke="white" stroke-width="1"/>
      </svg>

      <div class="relative px-6 py-10 sm:px-12 sm:py-14 text-white">
        ${greeting ? `<p class="text-sm text-white/60 font-sans mb-2">${greeting}</p>` : ''}
        <h1 class="font-display font-bold text-white leading-none mb-2" style="font-size: clamp(2.5rem, 7vw, 4rem);">ChlamAtlas</h1>
        <p class="text-white/70 text-sm sm:text-base italic" style="white-space:nowrap;">A Chlamydia research database</p>
        <div class="flex gap-3 mt-6 flex-wrap">
          <button data-nav-tab="genomes"
            class="px-4 py-2 bg-white text-[#0f4530] rounded-lg text-sm font-semibold hover:bg-white/90 transition">
            Browse Genomes
          </button>
          <button data-nav-tab="mutants"
            class="px-4 py-2 bg-white/15 text-white rounded-lg text-sm font-semibold hover:bg-white/25 transition border border-white/30">
            Explore Mutants
          </button>
        </div>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="overflow-x-auto -mx-4 px-4 mb-6">
      <div class="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-5" id="stats-bar">
        ${[0,1,2,3,4].map(() => `<div class="skeleton h-16 w-28 sm:w-auto rounded-xl flex-shrink-0"></div>`).join('')}
      </div>
    </div>

    <!-- Strain portal cards -->
    <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Organisms</h2>
    <div class="grid gap-3 sm:grid-cols-3 mb-8">
      ${STRAIN_CARDS.map(s => `
        <button data-nav-tab="genomes" data-strain="${s.id}"
          class="text-left rounded-2xl border border-gray-100 hover:shadow-md transition overflow-hidden group">
          <div class="h-1.5" style="background:${s.color};"></div>
          <div class="p-4" style="background:${s.colorLight};">
            <div class="flex items-start justify-between">
              <span class="text-3xl leading-none">${s.emoji}</span>
              <svg class="text-gray-400 group-hover:text-gray-600 transition mt-1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
            <p class="mt-2 font-mono text-xs font-medium" style="color:${s.color};">${s.abbr}</p>
            <p class="text-sm font-semibold text-gray-900 italic leading-tight"><em>${s.species}</em></p>
            <p class="text-xs text-gray-500 mt-0.5">${s.desc}</p>
          </div>
        </button>`).join('')}
    </div>

    <!-- Spotlight + Recent updates (two columns on desktop) -->
    <div class="grid gap-6 sm:grid-cols-2 mb-8">

      <!-- Spotlight card -->
      <div id="spotlight-card">
        <div class="skeleton h-32 rounded-2xl"></div>
      </div>

      <!-- Recent updates -->
      <div>
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Recent Updates</h2>
        <div id="updates-list" class="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          ${[0,1,2].map(() => `<div class="skeleton h-12 rounded-none"></div>`).join('')}
        </div>
      </div>

    </div>
  `;

  // Wire up hero CTA buttons and strain cards to tab navigation
  container.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: btn.dataset.navTab } }));
    });
  });

  // Load async data in parallel
  loadStats(container);
  loadSpotlight(container);
  loadUpdates(container);
}

async function loadStats(container) {
  const [geneRes, mutantRes, structureRes] = await Promise.all([
    sb.from('genes').select('id', { count: 'exact', head: true }),
    sb.from('mutants').select('id', { count: 'exact', head: true }),
    sb.from('alphafold_results').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Organisms',    value: '3' },
    { label: 'Genes',        value: geneRes.count?.toLocaleString() ?? '—' },
    { label: 'Structures',   value: structureRes.count?.toLocaleString() ?? '—' },
    { label: 'Mutants',      value: mutantRes.count?.toLocaleString() ?? '—' },
    { label: 'Partner Labs', value: '3' },
  ];

  const bar = container.querySelector('#stats-bar');
  if (!bar) return;
  bar.innerHTML = stats.map(s => `
    <div class="flex flex-col items-center justify-center px-5 py-3 bg-white border border-gray-100 rounded-xl shadow-sm gap-0.5 flex-shrink-0 sm:flex-shrink">
      <span class="text-xl font-bold text-gray-900 font-mono">${s.value}</span>
      <span class="text-[11px] text-gray-400 whitespace-nowrap">${s.label}</span>
    </div>`).join('');
}

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
  'CT-L2':      '#7c3aed',
  'CT-D':       '#1d4ed8',
  'CM':         '#c2410c',
  'Structures': '#1a6b4a',
  'default':    '#6b7280',
};

async function loadUpdates(container) {
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
