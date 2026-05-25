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
  { id: 'CT_L2',    label: 'C. trachomatis', sub: 'CT-L2',   avatarBg: '#dcfce7', icon: '/design/L2icon.jpg' },
  { id: 'CM',       label: 'C. muridarum',   sub: 'CM',      avatarBg: '#dbeafe', icon: '/design/CMicon.jpg' },
  { id: 'Lucky17',  label: 'Lucky 17',        sub: 'Curated', avatarBg: '#fef9c3', icon: '/design/L17icon.jpg' },
  { id: 'Chimeras', label: 'Chimeras',        sub: 'L2 × CM', avatarBg: '#fdf4ff', icon: '/design/Chimeraicon.jpg' },
];

const COUNTRY_CENTROIDS = {
  'united states': [38, -97], 'usa': [38, -97], 'us': [38, -97],
  'united kingdom': [54, -2], 'uk': [54, -2], 'england': [52, -1],
  'germany': [51, 10], 'france': [46, 2], 'netherlands': [52, 5],
  'sweden': [62, 15], 'norway': [65, 13], 'denmark': [56, 10],
  'finland': [64, 26], 'switzerland': [47, 8], 'austria': [47, 14],
  'italy': [42, 12], 'spain': [40, -4], 'portugal': [39, -8],
  'belgium': [50, 4], 'poland': [52, 20], 'czechia': [49, 15],
  'czech republic': [49, 15], 'hungary': [47, 19], 'romania': [46, 25],
  'canada': [56, -96], 'australia': [-27, 133], 'new zealand': [-41, 174],
  'japan': [36, 138], 'china': [35, 105], 'south korea': [37, 128],
  'korea': [37, 128], 'india': [20, 77], 'singapore': [1, 104],
  'taiwan': [24, 121], 'hong kong': [22, 114], 'israel': [31, 35],
  'brazil': [-14, -51], 'argentina': [-34, -64], 'mexico': [24, -102],
  'south africa': [-29, 25], 'kenya': [1, 38], 'nigeria': [10, 8],
  'egypt': [27, 30], 'saudi arabia': [24, 45], 'turkey': [39, 35],
  'russia': [60, 100], 'ukraine': [49, 31], 'greece': [39, 22],
  'iran': [32, 53], 'pakistan': [30, 69], 'bangladesh': [24, 90],
  'thailand': [15, 101], 'vietnam': [16, 108], 'indonesia': [-5, 120],
  'philippines': [13, 122], 'malaysia': [4, 109], 'ethiopia': [9, 40],
  'tanzania': [-6, 35], 'ghana': [8, -1], 'morocco': [32, -5],
  'chile': [-35, -71], 'colombia': [4, -72], 'peru': [-10, -76],
};

function countryLatLng(country) {
  if (!country) return null;
  return COUNTRY_CENTROIDS[country.toLowerCase().trim()] ?? null;
}

export async function renderHome(container) {
  container.innerHTML = `
    <!-- ── Masthead ── -->
    <div class="home-masthead" style="background:#0f4530;overflow:hidden;position:relative;">
      <chlam-globe-bg variant="globe" tint="#0f4530"></chlam-globe-bg>
      <div class="max-w-5xl mx-auto px-5 sm:px-8" style="padding-top:2.75rem;padding-bottom:2.75rem;position:relative;z-index:1;">
        <div class="sm:grid sm:gap-12" style="grid-template-columns:1fr auto;align-items:end;">
          <div>
            <h1 class="font-display font-bold text-white" style="font-size:clamp(2.75rem,7vw,4.25rem);line-height:1;margin-bottom:0.75rem;letter-spacing:-0.01em;">ChlamAtlas</h1>
            <p style="font-size:0.9375rem;color:rgba(255,255,255,0.6);line-height:1.65;max-width:30rem;">
              The authoritative research database for <em style="color:rgba(255,255,255,0.85);font-style:italic;">Chlamydia</em> —
              genomics, mutant phenotypes, and structural biology across three model strains.
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
                      flex-shrink:0;overflow:hidden;">
            <img src="${c.icon}" alt="${c.label}"
              style="width:100%;height:100%;object-fit:cover;border-radius:50%;"
              onerror="this.style.display='none'">
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
  const el = container.querySelector('#col-community');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:18px;">
      🌍 Community
    </div>

    <!-- World map (Leaflet + CartoDB tiles) -->
    <div style="border:1px solid #dbeafe;border-radius:8px;overflow:hidden;margin-bottom:10px;">
      <div id="community-map" style="height:130px;"></div>
      <div style="font-size:9px;color:#cbd5e1;padding:3px 8px;text-align:right;background:white;">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" style="color:inherit;">OpenStreetMap</a>
        · © <a href="https://carto.com/attributions" target="_blank" style="color:inherit;">CARTO</a>
      </div>
    </div>

    <!-- Stats panel: Users + Annotation sparkline -->
    <div style="background:white;border:1px solid #e5e7eb;border-radius:7px;padding:12px 14px;
                display:flex;align-items:center;gap:0;margin-bottom:10px;">
      <div style="flex:0 0 auto;padding-right:16px;border-right:1px solid #f3f4f6;margin-right:16px;">
        <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:5px;">Users</div>
        <div id="community-user-count" style="font-size:26px;font-weight:700;font-family:'DM Mono',monospace;color:#111;line-height:1;">—</div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Annotations over time</div>
        <div id="community-sparkline">
          <div style="height:32px;background:#f9fafb;border-radius:3px;"></div>
        </div>
      </div>
    </div>

    <!-- Top contributors -->
    <div style="background:white;border:1px solid #e5e7eb;border-radius:7px;padding:12px 14px;margin-bottom:10px;">
      <div style="font-size:9px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Top contributors</div>
      <div id="community-leaderboard" style="display:flex;flex-direction:column;gap:5px;">
        <div style="font-size:11px;color:#e5e7eb;">Loading…</div>
      </div>
    </div>

    <!-- Cycling activity strip -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:7px;padding:10px 14px;
                display:flex;align-items:center;gap:9px;">
      <div style="width:7px;height:7px;border-radius:50%;background:#16a34a;flex-shrink:0;"></div>
      <div id="community-activity" style="font-size:12px;color:#555;transition:opacity 0.4s;">
        Loading activity…
      </div>
    </div>
  `;

  initCommunityMap(container);
  loadCommunityStats(container);
  loadTopContributors(container);
  loadActivityFeed(container);
}

function initCommunityMap(container) {
  const el = container.querySelector('#community-map');
  if (!el || !window.L) return;

  const map = L.map(el, {
    center: [20, 0],
    zoom: 1,
    zoomSnap: 0.1,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    boxZoom: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Fit full world into container
  map.fitBounds([[-60, -170], [75, 170]], { padding: [2, 2], animate: false });

  // Store for marker addition once user data loads
  el._map = map;
}

async function geocodeCity(city, country) {
  const q = [city, country].filter(Boolean).join(', ');
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (e) {
    console.warn('geocodeCity failed:', q, e);
  }
  return null;
}

async function loadCommunityStats(container) {
  try {
    const { data: userRows } = await sb
      .from('users')
      .select('id, city, country');

    const userCount = userRows?.length ?? 0;

    const userEl = container.querySelector('#community-user-count');
    if (userEl) userEl.textContent = userCount.toLocaleString();

    // Geocode city+country for each unique location, add markers
    const leafletEl = container.querySelector('#community-map');
    const map = leafletEl?._map;
    if (map && userRows?.length) {
      const seen = new Set();
      const locations = [];
      userRows.forEach(u => {
        const key = `${u.city ?? ''}|${u.country ?? ''}`;
        if (!seen.has(key) && (u.city || u.country)) {
          seen.add(key);
          locations.push({ city: u.city, country: u.country });
        }
      });

      for (const loc of locations) {
        // Try precise city geocode, fall back to country centroid
        const coords = (await geocodeCity(loc.city, loc.country))
          ?? countryLatLng(loc.country);
        if (coords) {
          L.circleMarker(coords, {
            radius: 5,
            fillColor: '#1d4ed8',
            color: 'white',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85,
          }).addTo(map);
        }
        // Nominatim asks for max 1 req/sec
        if (locations.length > 1) await new Promise(r => setTimeout(r, 1100));
      }
    }

    const { data: annRows } = await sb
      .from('annotations')
      .select('created_at')
      .order('created_at', { ascending: true });

    const sparklineEl = container.querySelector('#community-sparkline');
    if (!sparklineEl) return;

    if (!annRows?.length) {
      sparklineEl.innerHTML = `<div style="font-size:11px;color:#e5e7eb;padding:8px 0;text-align:center;">No annotations yet</div>`;
      return;
    }

    const monthMap = {};
    annRows.forEach(row => {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const monthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ month: new Date(key + '-01'), count }));

    sparklineEl.innerHTML = renderSparkline(monthly);
  } catch (err) {
    console.error('loadCommunityStats:', err);
  }
}

function renderSparkline(monthly) {
  const BAR_W = 8, GAP = 6, MAX_H = 28, LABEL_H = 8;
  const H = MAX_H + LABEL_H;
  const maxVal = Math.max(...monthly.map(d => d.count), 1);
  const W = monthly.length * (BAR_W + GAP) - GAP;
  const COLORS = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
  const INITIALS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  const bars = monthly.map((d, i) => {
    const h = Math.max(2, Math.round((d.count / maxVal) * MAX_H));
    const x = i * (BAR_W + GAP);
    const y = MAX_H - h;
    const ci = Math.round((i / Math.max(monthly.length - 1, 1)) * (COLORS.length - 1));
    const label = INITIALS[d.month.getMonth()];
    return `<rect x="${x}" y="${y}" width="${BAR_W}" height="${h}" fill="${COLORS[ci]}" rx="1"/>
            <text x="${x + BAR_W / 2}" y="${H}" font-size="4.5" fill="#d1d5db" text-anchor="middle" font-family="monospace">${label}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;" preserveAspectRatio="none">${bars}</svg>`;
}

async function loadTopContributors(container) {
  const el = container.querySelector('#community-leaderboard');
  if (!el) return;

  try {
    const { data } = await sb
      .from('annotations')
      .select('user_id');

    if (!data?.length) {
      el.innerHTML = `<div style="font-size:11px;color:#d1d5db;">No contributions yet</div>`;
      return;
    }

    const counts = {};
    data.forEach(row => {
      counts[row.user_id] = (counts[row.user_id] || 0) + 1;
    });
    const top3 = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([userId, count]) => ({ userId, count }));

    const ids = top3.map(t => t.userId);
    const { data: users } = await sb
      .from('users')
      .select('id, display_name, lab_affiliation')
      .in('id', ids);

    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = top3.map((t, i) => {
      const u = userMap[t.userId];
      const name = u?.display_name || 'Unknown';
      const lab  = u?.lab_affiliation || '';
      return `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;line-height:1;">${medals[i]}</span>
          <span style="font-size:12px;font-weight:600;color:#111;flex:1;">${name}</span>
          ${lab ? `<span style="font-size:11px;color:#9ca3af;">${lab}</span>` : ''}
          <span style="font-size:11px;font-family:'DM Mono',monospace;color:#bbb;margin-left:8px;">${t.count}</span>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('loadTopContributors:', err);
    el.innerHTML = `<div style="font-size:11px;color:#d1d5db;">—</div>`;
  }
}

async function loadActivityFeed(container) {
  const el = container.querySelector('#community-activity');
  if (!el) return;

  try {
    const { data } = await sb
      .from('site_updates')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!data?.length) {
      el.textContent = 'No recent activity';
      return;
    }

    function relativeTime(isoString) {
      const diff = Date.now() - new Date(isoString).getTime();
      const h = Math.floor(diff / 36e5);
      if (h < 1) return 'just now';
      if (h < 24) return `${h}h ago`;
      const d = Math.floor(h / 24);
      if (d === 1) return 'yesterday';
      return `${d} days ago`;
    }

    const lines = data.map(u =>
      `${u.title} <span style="color:#bbb">· ${relativeTime(u.created_at)}</span>`
    );

    let i = 0;
    el.innerHTML = lines[0];

    setInterval(() => {
      el.style.opacity = '0';
      setTimeout(() => {
        i = (i + 1) % lines.length;
        el.innerHTML = lines[i];
        el.style.opacity = '1';
      }, 420);
    }, 4000);
  } catch (err) {
    console.error('loadActivityFeed:', err);
    el.textContent = '—';
  }
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
