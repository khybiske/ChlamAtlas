# Navigation Chrome & App Shell Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the visual shell of ChlamAtlas — typography, nav bar (desktop + mobile), and home tab — to match the approved UI/UX spec.

**Architecture:** Pure HTML/CSS/JS changes to existing files; no new dependencies beyond adding CDN font imports. Auth logic in `app.js` is preserved; only the nav rendering functions change. Home view is rewritten in `home.js`.

**Tech Stack:** Tailwind CSS CDN, Cormorant Garamond + DM Sans + DM Mono (Google Fonts), vanilla JS, Supabase JS client

---

## File Map

| File | Change |
|---|---|
| `web/index.html` | New fonts, updated Tailwind config, redesigned header + mobile nav + auth modal |
| `web/css/app.css` | Rewrite nav-tab / mobile-tab styles; add new utility classes (pill, chip, user-chip) |
| `web/js/app.js` | Update `renderAuthArea` to show user chip; update `updateNavVisibility` for community tier; update hash routing to deep-link format |
| `web/js/views/home.js` | Full rewrite to match spec: dark-green hero, stats bar, strain portal cards, spotlight card, recent updates |

---

### Task 1: Fonts, Tailwind config, and CSS foundation

**Files:**
- Modify: `web/index.html` (lines 8–34)
- Modify: `web/css/app.css`

- [ ] **Step 1: Update Google Fonts import in `index.html`**

Replace the existing `<link>` for Inter with:
```html
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Update Tailwind config in `index.html`**

Replace the `tailwind.config` block with:
```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'brand':  '#1a6b4a',
        'nav':    '#0f4530',
        'ctd':    '#1d4ed8',
        'ctl2':   '#7c3aed',
        'cm':     '#c2410c',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
    }
  }
}
```

- [ ] **Step 3: Rewrite `web/css/app.css` with updated component styles**

Replace the entire file with:
```css
/* ChlamAtlas — custom styles (no @apply — CDN Tailwind doesn't support it) */

/* ─── Desktop nav tabs ──────────────────────────────────── */
.nav-tab {
  padding: 0.375rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.7);
  transition: all 0.15s;
  cursor: pointer;
  background: transparent;
  border: none;
}
.nav-tab:hover  { color: #fff; background: rgba(255,255,255,0.12); }
.nav-tab.active { color: #fff; background: rgba(255,255,255,0.18); }

/* ─── Mobile bottom tab bar ─────────────────────────────── */
.mobile-tab {
  color: #9ca3af;
  transition: color 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0;
  gap: 0.125rem;
  flex: 1;
  background: transparent;
  border: none;
  cursor: pointer;
}
.mobile-tab .tab-icon-wrap {
  width: 2rem; height: 2rem;
  border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.mobile-tab.active { color: #1a6b4a; }
.mobile-tab.active .tab-icon-wrap { background: #dcfce7; }

/* ─── Selector list rows ────────────────────────────────── */
.selector-row {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background 0.15s;
  background: transparent; width: 100%; text-align: left;
}
.selector-row:last-child { border-bottom: none; }
.selector-row:hover { background: #f9fafb; }

/* ─── Gene list ─────────────────────────────────────────── */
.gene-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background 0.15s;
}
.gene-row:last-child { border-bottom: none; }
.gene-row:hover { background: #f9fafb; }

.gene-thumb {
  width: 2.5rem; height: 2.5rem;
  border-radius: 0.5rem; object-fit: cover;
  background: #f3f4f6; flex-shrink: 0;
}

/* Functional category gene name colors */
.gene-t3ss      { font-weight: 600; color: #0d9488; }   /* T3SS effectors/secreted — teal */
.gene-inc       { font-weight: 600; color: #7c3aed; }   /* Inc membrane proteins — purple */
.gene-division  { font-weight: 600; color: #d97706; }   /* Cell division / metabolic — amber */
.gene-reg       { font-weight: 600; color: #c2410c; }   /* Regulatory / sigma factors — burnt orange */
.gene-named     { font-weight: 600; color: #1a6b4a; }   /* Other characterized — green */
.gene-unnamed   { font-weight: 500; color: #9ca3af; }   /* Uncharacterized — muted gray */

.gene-locus   { font-family: "DM Mono", monospace; font-size: 0.8125rem; color: #6b7280; }
.gene-product { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.125rem; }

/* ─── Detail two-column rows ────────────────────────────── */
.detail-row {
  display: flex; align-items: baseline; gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.875rem;
}
.detail-label { width: 9rem; flex-shrink: 0; color: #9ca3af; font-size: 0.875rem; line-height: 1.4; }
.detail-value { flex: 1; color: #111827; }

.section-head {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 1rem; font-weight: 700; color: #111827;
  padding-top: 1.25rem; padding-bottom: 0.5rem;
  border-bottom: 2px solid #f3f4f6; margin-bottom: 0.25rem;
}

/* ─── Pipeline pills (6 colored rectangles) ─────────────── */
.ppill {
  width: 1.5rem; height: 0.5rem;
  border-radius: 9999px; flex-shrink: 0;
}
.ppill-done     { background: #22c55e; }
.ppill-active   { background: #f59e0b; }
.ppill-pending  { background: #e5e7eb; }

/* ─── Mutation type badges ───────────────────────────────── */
.badge-tn     { background: #fce7f3; color: #9d174d; font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 9999px; }
.badge-chem   { background: #dbeafe; color: #1e40af; font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 9999px; }
.badge-recomb { background: #dcfce7; color: #166534; font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 9999px; }
.badge-intron { background: #fef3c7; color: #92400e; font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 9999px; }
.badge-other  { background: #f3f4f6; color: #6b7280; font-size: 0.6875rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 9999px; }

/* ─── Mutant list ───────────────────────────────────────── */
.mutant-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background 0.15s;
}
.mutant-row:last-child { border-bottom: none; }
.mutant-row:hover { background: #f9fafb; }

/* ─── Pipeline rows ─────────────────────────────────────── */
.pipeline-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background 0.15s;
}
.pipeline-row:last-child { border-bottom: none; }
.pipeline-row:hover { background: #f9fafb; }

/* ─── Skeleton ──────────────────────────────────────────── */
.skeleton {
  background: #f3f4f6; border-radius: 0.375rem;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}

/* ─── Back button ───────────────────────────────────────── */
.back-btn {
  display: flex; align-items: center; gap: 0.375rem;
  color: #1a6b4a; font-size: 0.875rem; font-weight: 500;
  padding: 0.75rem 0; cursor: pointer; transition: color 0.15s;
  border: none; background: transparent;
}
.back-btn:hover { color: #0f4530; }

/* ─── External links ────────────────────────────────────── */
.ext-link { color: #1a6b4a; text-decoration: underline; transition: color 0.15s; }
.ext-link:hover { color: #0f4530; }

/* ─── User chip ─────────────────────────────────────────── */
.user-chip {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
  border-radius: 9999px;
  background: rgba(255,255,255,0.15);
  color: #fff; font-size: 0.8125rem; font-weight: 500;
  cursor: pointer; border: none; transition: background 0.15s;
}
.user-chip:hover { background: rgba(255,255,255,0.25); }
.user-chip-avatar {
  width: 1.75rem; height: 1.75rem; border-radius: 9999px;
  background: rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; font-weight: 700; color: #0f4530;
  overflow: hidden; flex-shrink: 0;
}

/* ─── iOS safe area for bottom nav ─────────────────────── */
.safe-area-pb { padding-bottom: env(safe-area-inset-bottom, 0px); }

/* ─── Phenotype images ──────────────────────────────────── */
.phenotype-img {
  width: 6rem; height: 6rem;
  border-radius: 0.5rem; object-fit: cover;
  border: 1px solid #f3f4f6;
}
```

- [ ] **Step 4: Commit**
```bash
git add web/index.html web/css/app.css
git commit -m "feat: update typography tokens and CSS foundation for spec redesign"
```

---

### Task 2: Desktop nav bar redesign

**Files:**
- Modify: `web/index.html` (header section)
- Modify: `web/js/app.js` (renderAuthArea)

- [ ] **Step 1: Replace the `<header>` block in `index.html`**

Replace the entire `<header>` element with:
```html
  <!-- ─── TOP NAV ─────────────────────────────────────────── -->
  <header class="sticky top-0 z-50 shadow-md" style="background:#0f4530;">
    <div class="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 gap-4">

      <!-- Logo / wordmark -->
      <a href="#" id="nav-home-logo" class="flex items-center gap-2 flex-shrink-0">
        <img src="/design/chlamatlas_icon.png" alt="ChlamAtlas" class="h-7 w-7 rounded" onerror="this.style.display='none'" />
        <span class="font-display font-bold text-xl text-white tracking-tight leading-none">ChlamAtlas</span>
      </a>

      <!-- Primary tabs (desktop) -->
      <nav class="hidden sm:flex items-center gap-0.5 flex-1 justify-center" id="primary-nav">
        <button data-tab="home"     class="nav-tab active">Home</button>
        <button data-tab="genomes"  class="nav-tab">Genomes</button>
        <button data-tab="mutants"  class="nav-tab">Mutants</button>
        <button data-tab="pipeline" class="nav-tab">Pipeline</button>
      </nav>

      <!-- Right side: auth -->
      <div id="auth-area" class="flex items-center gap-2 flex-shrink-0">
        <button id="btn-sign-in"
          class="text-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition border border-white/30 hover:border-white/50">
          Sign in
        </button>
      </div>

    </div>
  </header>
```

- [ ] **Step 2: Update `renderAuthArea` in `app.js` to use user-chip**

Replace the `renderAuthArea` function body with:
```js
function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (state.user) {
    const initials = (state.user.email ?? '?').slice(0, 2).toUpperCase();
    area.innerHTML = `
      <button id="btn-sign-out" class="user-chip">
        <span class="user-chip-avatar">${initials}</span>
        <span class="hidden sm:inline">${state.user.email.split('@')[0]}</span>
      </button>`;
    document.getElementById('btn-sign-out').addEventListener('click', signOut);
  } else {
    area.innerHTML = `
      <button id="btn-sign-in"
        class="text-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition border border-white/30 hover:border-white/50">
        Sign in
      </button>`;
    document.getElementById('btn-sign-in').addEventListener('click', () => showAuthModal());
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add web/index.html web/js/app.js
git commit -m "feat: redesign desktop nav bar — dark green, Cormorant wordmark, user chip"
```

---

### Task 3: Mobile nav redesign

**Files:**
- Modify: `web/index.html` (mobile nav section)

- [ ] **Step 1: Replace the mobile bottom nav in `index.html`**

Replace the entire `<nav id="mobile-nav">` element with:
```html
  <!-- ─── MOBILE BOTTOM NAV ─────────────────────────────────── -->
  <nav class="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex safe-area-pb" id="mobile-nav">
    <button data-tab="home" class="mobile-tab active flex-1">
      <span class="tab-icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </span>
      <span class="text-[10px] font-medium mt-0.5">Home</span>
    </button>
    <button data-tab="genomes" class="mobile-tab flex-1">
      <span class="tab-icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16.1A5 5 0 0 1 5.5 8h.5a6 6 0 0 1 6-6 6 6 0 0 1 6 6h.5a5 5 0 0 1 3.5 8.4"/><path d="m12 12 4 10"/><path d="m12 12-4 10"/><path d="M12 2v10"/></svg>
      </span>
      <span class="text-[10px] font-medium mt-0.5">Genomes</span>
    </button>
    <button data-tab="mutants" class="mobile-tab flex-1">
      <span class="tab-icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M9 3h6"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M3 9v6"/><path d="M21 9v6"/><path d="M3 15v4a2 2 0 0 0 2 2h4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/><path d="M9 21h6"/><circle cx="12" cy="12" r="3"/></svg>
      </span>
      <span class="text-[10px] font-medium mt-0.5">Mutants</span>
    </button>
    <button data-tab="pipeline" class="mobile-tab flex-1" style="display:none">
      <span class="tab-icon-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="4" rx="1"/><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="16" y="3" width="6" height="4" rx="1"/><path d="M5 7v4"/><path d="M12 7v4"/><path d="M5 11h14"/><path d="M19 11v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3"/></svg>
      </span>
      <span class="text-[10px] font-medium mt-0.5">Pipeline</span>
    </button>
  </nav>
```

- [ ] **Step 2: Update mobile-tab active sync in `activateTab` in `app.js`**

The existing `activateTab` already toggles `.active` on `.mobile-tab` buttons — no change needed. Verify by reading the function.

- [ ] **Step 3: Commit**
```bash
git add web/index.html
git commit -m "feat: redesign mobile bottom nav with Lucide icons and green active state"
```

---

### Task 4: Home tab redesign

**Files:**
- Modify: `web/js/views/home.js`

- [ ] **Step 1: Rewrite `home.js` to match spec**

Replace the entire file with:
```js
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
          <button data-tab="genomes"
            class="px-4 py-2 bg-white text-[#0f4530] rounded-lg text-sm font-semibold hover:bg-white/90 transition">
            Browse Genomes
          </button>
          <button data-tab="mutants"
            class="px-4 py-2 bg-white/15 text-white rounded-lg text-sm font-semibold hover:bg-white/25 transition border border-white/30">
            Explore Mutants
          </button>
        </div>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="overflow-x-auto -mx-4 px-4 mb-6">
      <div class="flex gap-4 min-w-max sm:min-w-0 sm:grid sm:grid-cols-5" id="stats-bar">
        ${[0,1,2,3,4].map(() => `<div class="skeleton h-16 w-28 sm:w-auto rounded-xl flex-shrink-0"></div>`).join('')}
      </div>
    </div>

    <!-- Strain portal cards -->
    <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Organisms</h2>
    <div class="grid gap-3 sm:grid-cols-3 mb-8" id="strain-cards">
      ${STRAIN_CARDS.map(s => `
        <button data-tab="genomes" data-strain="${s.id}"
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
    <div class="grid gap-6 sm:grid-cols-2">

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

  // Wire up hero CTA buttons to tab navigation
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Dispatch to app's tab router via custom event
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: btn.dataset.tab } }));
    });
  });

  // Load stats
  loadStats(container);

  // Load spotlight
  loadSpotlight(container);

  // Load recent updates
  loadUpdates(container);
}

async function loadStats(container) {
  const [geneRes, mutantRes, structureRes] = await Promise.all([
    sb.from('genes').select('id', { count: 'exact', head: true }),
    sb.from('mutants').select('id', { count: 'exact', head: true }),
    sb.from('alphafold_results').select('id', { count: 'exact', head: true }),
  ]);

  const stats = [
    { label: 'Organisms',  value: '3' },
    { label: 'Genes',      value: geneRes.count?.toLocaleString() ?? '—' },
    { label: 'Structures', value: structureRes.count?.toLocaleString() ?? '—' },
    { label: 'Mutants',    value: mutantRes.count?.toLocaleString() ?? '—' },
    { label: 'Partner Labs', value: '3' },
  ];

  container.querySelector('#stats-bar').innerHTML = stats.map(s => `
    <div class="flex flex-col items-center justify-center px-5 py-3 bg-white border border-gray-100 rounded-xl shadow-sm gap-0.5 flex-shrink-0 sm:flex-shrink">
      <span class="text-xl font-bold text-gray-900 font-mono">${s.value}</span>
      <span class="text-[11px] text-gray-400 whitespace-nowrap">${s.label}</span>
    </div>`).join('');
}

async function loadSpotlight(container) {
  const { data } = await sb.from('site_config').select('*').eq('key', 'spotlight').maybeSingle();
  const el = container.querySelector('#spotlight-card');

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
  'CT-L2': '#7c3aed',
  'CT-D':  '#1d4ed8',
  'CM':    '#c2410c',
  'Structures': '#1a6b4a',
  'default': '#6b7280',
};

async function loadUpdates(container) {
  const { data } = await sb
    .from('site_updates')
    .select('id, title, category, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  const el = container.querySelector('#updates-list');

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
```

- [ ] **Step 2: Add the custom event listener for hero CTA navigation in `app.js`**

After the existing `document.querySelectorAll('[data-tab]').forEach(...)` block (around line 156), add:
```js
// Home view hero buttons dispatch this event (they can't import activateTab directly)
window.addEventListener('chlamatlas:navigate', (e) => activateTab(e.detail.tab));
```

- [ ] **Step 3: Verify in browser** — open `web/index.html` locally (via `npx serve .` or Vercel dev). Check:
  - Dark green header renders
  - Cormorant Garamond displays for "ChlamAtlas" wordmark
  - Hero section shows globe SVG backdrop
  - Stats skeletons then real counts
  - Strain cards show 3 organisms with correct colors
  - Mobile bottom nav shows icons with green active state

- [ ] **Step 4: Commit**
```bash
git add web/js/views/home.js web/js/app.js
git commit -m "feat: redesign home tab — dark green hero, stats bar, strain portal cards, spotlight, updates"
```

---

### Task 5: Add missing tables (site_config + site_updates)

**Files:**
- Create: `supabase/migrations/004_home_tables.sql`

> These tables are queried by `home.js`. They do not exist yet. The home view degrades gracefully without them (empty states), but the migration should be applied before deploying.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/004_home_tables.sql`:
```sql
-- Home page admin-managed content tables

-- Admin-editable spotlight/featured card (single row, key = 'spotlight')
CREATE TABLE IF NOT EXISTS public.site_config (
  key        text PRIMARY KEY,
  title      text,
  body       text,
  link_url   text,
  link_label text
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_config public read" ON public.site_config FOR SELECT USING (true);
CREATE POLICY "site_config admin write" ON public.site_config FOR ALL USING (public.is_admin());

-- Admin-managed recent updates list
CREATE TABLE IF NOT EXISTS public.site_updates (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title      text NOT NULL,
  category   text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_updates public read" ON public.site_updates FOR SELECT USING (true);
CREATE POLICY "site_updates admin write" ON public.site_updates FOR ALL USING (public.is_admin());

-- Seed spotlight row (empty until admin edits it)
INSERT INTO public.site_config (key, title) VALUES ('spotlight', null) ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Run in Supabase SQL editor**

Open Supabase dashboard → SQL editor → paste and run `004_home_tables.sql`.
Expected: no errors; two new tables visible in Table Editor.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/004_home_tables.sql
git commit -m "feat: add site_config and site_updates tables for home page content"
```

---

### Task 6: Hash routing update

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Update hash routing in `app.js`**

In `activateTab`, replace:
```js
history.replaceState(null, '', `#${name}`);
```
with:
```js
history.replaceState(null, '', `#/${name}`);
```

And update the boot router to match:
```js
const hash = location.hash.replace(/^#\/?/, '');
activateTab(TABS.includes(hash) ? hash : 'home');
```

- [ ] **Step 2: Commit**
```bash
git add web/js/app.js
git commit -m "feat: update hash routing to deep-link format (#/tab)"
```

---

### Task 7: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**
```bash
git push
```

- [ ] **Step 2: Verify Vercel auto-deploy triggers** (check Vercel dashboard or `vercel --prod` if CLI is installed)

- [ ] **Step 3: Smoke test on mobile device** — open chlamatlas.org on phone, verify:
  - Dark green nav bar visible
  - Bottom tab bar with icons
  - Hero section correct
  - Sign in button works
  - Tab switching works
