# Home Page & Nav Chrome Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-centric home page with the "Bold Editorial" design (Direction C) — full-bleed dark green masthead, access-gated entry blocks, organisms section, updates, and footer with citation modal.

**Architecture:** `home.js` is fully rewritten; `app.js` gets updated auth rendering; `index.html` gets color alias updates, layout restructure (full-bleed support), and Pipeline tab gating. No new dependencies introduced.

**Tech Stack:** Vanilla JS, Tailwind CSS (CDN), Supabase JS client, existing DM Sans / Cormorant Garamond / DM Mono fonts.

**Spec:** `docs/superpowers/specs/2026-04-05-home-nav-redesign.md`

---

## File Map

| File | What changes |
|------|-------------|
| `web/index.html` | Tailwind color aliases; remove max-width from `<main>`; add max-w constraint to genomes/mutants/pipeline content divs; Pipeline desktop tab hidden by default |
| `web/js/app.js` | `renderAuthArea()` — replace user-chip with "Hello, [name]" greeting |
| `web/js/views/home.js` | Full rewrite: masthead, entry blocks, organisms, updates, footer, citation modal |
| `web/css/app.css` | No changes required — existing utility classes are reused; home no longer uses `.skeleton` cards or `.selector-row` |

---

## Task 1: Update organism color palette

**Files:**
- Modify: `web/index.html` (Tailwind config block, lines 11–28)
- Modify: `web/js/views/home.js` (STRAIN_CARDS constant, lines 4–35)

- [ ] **Step 1: Update Tailwind color aliases in `index.html`**

Replace the three strain color values in the `tailwind.config` block:

```js
// Before
'ctd':  '#1d4ed8',
'ctl2': '#7c3aed',
'cm':   '#c2410c',

// After
'ctd':  '#4b2e83',   // UW purple — D/UW-3 discovered at UW
'ctl2': '#16a34a',   // green — primary strain, matches brand
'cm':   '#2563eb',   // blue — distinct from green and purple
```

- [ ] **Step 2: Replace STRAIN_CARDS constant in `home.js`**

Remove the entire `STRAIN_CARDS` array (lines 4–35) and replace with the `ORGANISMS` constant used by the new design:

```js
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
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000` (or however you serve locally). The home page will be broken at this point (STRAIN_CARDS is gone) — that is expected. Confirm the browser console shows no import/syntax errors other than rendering issues in `renderHome`.

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/js/views/home.js
git commit -m "feat: update organism color palette (UW purple CT-D, green CT-L2, blue CM)"
```

---

## Task 2: Restructure main for full-bleed home masthead

**Files:**
- Modify: `web/index.html` (main tag and content divs)

The current `<main>` constrains all tab content to `max-w-5xl`. The new home masthead must be full-bleed (full viewport width). Fix: remove the constraint from `<main>` and add it directly to the genomes/mutants/pipeline content divs instead. The home content div intentionally gets no constraint — `home.js` manages its own internal layout.

- [ ] **Step 1: Update `<main>` tag**

```html
<!-- Before -->
<main class="max-w-5xl mx-auto px-4 pb-24 sm:pb-8">

<!-- After -->
<main class="pb-24 sm:pb-8">
```

- [ ] **Step 2: Add max-width wrapper to genomes, mutants, pipeline content divs**

```html
<!-- Before -->
<section id="tab-genomes" class="tab-panel hidden">
  <div id="genomes-content"></div>
</section>

<section id="tab-mutants" class="tab-panel hidden">
  <div id="mutants-content"></div>
</section>

<section id="tab-pipeline" class="tab-panel hidden">
  <div id="pipeline-content"></div>
</section>

<!-- After -->
<section id="tab-genomes" class="tab-panel hidden">
  <div id="genomes-content" class="max-w-5xl mx-auto px-4"></div>
</section>

<section id="tab-mutants" class="tab-panel hidden">
  <div id="mutants-content" class="max-w-5xl mx-auto px-4"></div>
</section>

<section id="tab-pipeline" class="tab-panel hidden">
  <div id="pipeline-content" class="max-w-5xl mx-auto px-4"></div>
</section>
```

Note: `#home-content` gets no class — home.js owns its layout.

- [ ] **Step 3: Verify no layout regression**

Open the app and click through Genomes, Mutants, Pipeline tabs. Content should appear with the same max-width as before. If any view's content appears edge-to-edge unexpectedly, the inner view renders must themselves add a container (check the view's JS file and wrap its outermost `container.innerHTML` in a `<div class="max-w-5xl mx-auto px-4">`).

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "refactor: move max-width constraint from main to individual content divs"
```

---

## Task 3: Nav chrome — Pipeline hidden by default + auth greeting

**Files:**
- Modify: `web/index.html` (desktop Pipeline nav-tab)
- Modify: `web/js/app.js` (`renderAuthArea` function, lines 81–99)

- [ ] **Step 1: Hide desktop Pipeline tab by default in `index.html`**

The desktop nav tab for Pipeline is currently visible on load and hidden by `updateNavVisibility()` after auth resolves. Prevent the flash by starting it hidden:

```html
<!-- Before -->
<button data-tab="pipeline" class="nav-tab">Pipeline</button>

<!-- After -->
<button data-tab="pipeline" class="nav-tab" style="display:none">Pipeline</button>
```

The mobile Pipeline button (`id="mobile-nav"`) already has `style="display:none"` — no change needed there.

- [ ] **Step 2: Update `renderAuthArea()` in `app.js`**

Replace the authenticated branch (the user-chip with initials) with a simpler "Hello, [name]" text button. Sign-out is still triggered on click.

```js
function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (state.user) {
    const firstName = (state.user.email ?? '').split('@')[0];
    area.innerHTML = `
      <button id="btn-sign-out"
        class="text-sm font-medium transition hover:text-white"
        style="color:rgba(255,255,255,0.8);">
        Hello, ${firstName}
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

- [ ] **Step 3: Verify both auth states**

1. Load the app as a guest — confirm "Sign in" button is visible, Pipeline tab is absent from desktop nav and mobile bottom nav.
2. Sign in as a lab member — confirm "Hello, [username]" appears in nav, Pipeline tab appears in desktop and mobile nav.
3. Click "Hello, [username]" — confirm sign-out works and nav reverts to guest state.

- [ ] **Step 4: Commit**

```bash
git add web/index.html web/js/app.js
git commit -m "feat: hide pipeline tab for guests by default; replace user-chip with Hello greeting"
```

---

## Task 4: Home page — masthead

**Files:**
- Modify: `web/js/views/home.js` — rewrite `renderHome()` and `loadStats()`

This task establishes the full page skeleton and masthead. Entry blocks, organisms, and footer are empty placeholders populated in subsequent tasks.

- [ ] **Step 1: Rewrite `renderHome()` with new HTML skeleton**

Replace the entire `renderHome` function body with the following. Keep the `ORGANISMS` constant from Task 1 at the top of the file.

```js
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
```

- [ ] **Step 2: Rewrite `loadStats()` to populate new masthead slots**

Replace the existing `loadStats` function entirely:

```js
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
```

- [ ] **Step 3: Verify masthead renders**

Open the app. The home tab should now show:
- Full-bleed dark green masthead spanning the full viewport width
- "ChlamAtlas" in large Cormorant Garamond, white
- Descriptor text in muted white below
- Stats loading (skeletons briefly, then numbers)
- Empty white area below (entry blocks etc. not yet implemented)

Check that desktop and mobile (resize window) both look correct.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page masthead — full-bleed dark green with stats"
```

---

## Task 5: Home page — entry blocks

**Files:**
- Modify: `web/js/views/home.js` — add `renderEntryBlocks()` function

- [ ] **Step 1: Add `renderEntryBlocks()` after `loadStats()`**

This function reads `state.userRole` to decide whether Pipeline is shown. Import `state` at the top of the file (it's already imported via `import { sb, state } from '../app.js'`).

```js
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
      meta: '<span id="eb-mutant-count">—</span> characterized',
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

  // Desktop: single row, equal columns
  // Mobile guest: 2-up + search full-width below
  // Mobile member: 2×2 grid
  const el = container.querySelector('#entry-blocks');
  if (!el) return;

  if (!isMobile) {
    // Desktop: flex row
    el.style.cssText = '';
    el.innerHTML = `
      <div class="max-w-5xl mx-auto" style="display:grid;grid-template-columns:repeat(${blocks.length},1fr);">
        ${blocks.map(b => entryBlockHTML(b, 'border-right:1px solid #ececec;')).join('')}
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
      <div style="display:flex;align-items:center;gap:1rem;padding:0.875rem 1rem;opacity:0.32;cursor:default;">
        <span style="font-size:1.125rem;">${searchBlock.icon}</span>
        <div>
          <div style="font-size:0.5375rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:2px;">${searchBlock.verb}</div>
          <div style="font-size:0.875rem;font-weight:600;color:#111;">${searchBlock.title}</div>
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

  // Populate gene/mutant counts once stats load
  // These are updated by loadStats via shared DOM ids
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
      <div style="font-size:0.5625rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:0.25rem;">${block.verb}</div>
      <div style="font-size:1.0625rem;font-weight:600;color:#111;margin-bottom:0.25rem;">${block.title}</div>
      <div class="font-mono" style="font-size:0.75rem;color:#bbb;">${block.meta}</div>
    </div>`;
}
```

- [ ] **Step 2: Update `loadStats()` to also populate entry block counts**

Add these lines at the end of `loadStats()`, after the desktop/mobile stat rendering:

```js
  // Also update entry block meta counts
  const ebGene = container.querySelector('#eb-gene-count');
  const ebMutant = container.querySelector('#eb-mutant-count');
  if (ebGene) ebGene.textContent = geneRes.count?.toLocaleString() ?? '—';
  if (ebMutant) ebMutant.textContent = mutantRes.count?.toLocaleString() ?? '—';
```

- [ ] **Step 3: Verify entry blocks render correctly**

1. Guest: should see 3 items — Genomes, Mutants (side by side on mobile), Search (full-width, dimmed)
2. Sign in as lab member: should see 4 items including Pipeline
3. Gene/mutant counts should appear once loadStats resolves
4. Clicking Genomes or Mutants should navigate to those tabs

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page entry blocks with access-gated pipeline"
```

---

## Task 6: Home page — organisms and updates

**Files:**
- Modify: `web/js/views/home.js` — add `loadOrganisms()` and `loadUpdates()` functions

- [ ] **Step 1: Add `loadOrganisms()` function**

```js
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
```

- [ ] **Step 2: Add `loadUpdates()` function**

Replace the existing `loadUpdates` function entirely (the old one used `#updates-list`; the new one targets `#updates-section`):

```js
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
```

- [ ] **Step 3: Verify organisms and updates sections**

1. Organisms section shows three rows with correct colored left bars (green CT-L2, purple CT-D, blue CM)
2. Clicking a strain row navigates to the Genomes tab (gene counts may show as `—` if Supabase has no data yet — that is fine)
3. Updates section shows recent updates from `site_updates` table, or is absent if table is empty

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page organisms and updates sections"
```

---

## Task 7: Home page — footer and citation modal

**Files:**
- Modify: `web/js/views/home.js` — add `renderFooter()` and `loadCitation()` functions

- [ ] **Step 1: Add `renderFooter()` function**

```js
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
```

- [ ] **Step 2: Add `loadCitation()` function**

```js
const DEFAULT_CITATION = `Hybiske et al., manuscript in preparation.
ChlamAtlas: an integrated Chlamydia research database.
https://chlamatlas.org — Hybiske Lab, University of Washington.`;

async function loadCitation(container) {
  // Try to load citation from site_config; fall back to default
  const { data } = await sb
    .from('site_config')
    .select('value')
    .eq('key', 'citation')
    .maybeSingle();

  const citationText = data?.value ?? DEFAULT_CITATION;
  const textEl = container.querySelector('#citation-text');
  if (textEl) textEl.textContent = citationText;

  const copyBtn = container.querySelector('#citation-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(citationText);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy citation'; }, 2000);
    });
  }
}
```

- [ ] **Step 3: Verify footer and citation modal**

1. Footer is visible at the bottom of the home tab with lab name, institution, and three links
2. Clicking "How to cite" opens the modal with the default citation text
3. Clicking "Copy citation" copies to clipboard and shows "Copied!" briefly
4. Clicking outside the modal or "Close" dismisses it
5. GitHub link opens in a new tab

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page footer with citation modal"
```

---

## Task 8: Remove dead code and final verification

**Files:**
- Modify: `web/js/views/home.js` — remove unused functions

- [ ] **Step 1: Remove `loadSpotlight()` and `CATEGORY_COLORS`**

Delete the following from `home.js`:
- The `CATEGORY_COLORS` object (lines ~174–180 in the original file, no longer used)
- The `loadSpotlight()` function (lines ~155–172 in the original file)

The `loadUpdates()` function was already replaced in Task 6. The `loadStats()` function was rewritten in Task 4. The `renderHome()` shell was rewritten in Task 4.

After cleanup, `home.js` should export only `renderHome` and contain: `ORGANISMS`, `renderHome`, `loadStats`, `renderEntryBlocks`, `entryBlockHTML`, `loadOrganisms`, `loadUpdates`, `UPDATE_COLORS`, `renderFooter`, `loadCitation`, `DEFAULT_CITATION`.

- [ ] **Step 2: Full smoke test — guest flow**

1. Open the app at `/`
2. Confirm: dark green masthead with ChlamAtlas title + description + stats
3. Confirm: 3 entry blocks (Genomes, Mutants, Search-greyed) on desktop; correct layout on mobile (resize window to 390px)
4. Confirm: organisms section shows 3 rows with correct colors and descriptors
5. Confirm: footer shows with working How to cite, GitHub, Contact links
6. Confirm: Pipeline is absent from desktop nav tabs and mobile bottom nav
7. Confirm: nav shows "Sign in" button

- [ ] **Step 3: Full smoke test — lab member flow**

1. Click Sign in, authenticate as a lab member
2. Confirm: nav shows "Hello, [username]"
3. Confirm: Pipeline tab appears in desktop nav and mobile bottom nav
4. Confirm: entry blocks now show 4 items including Pipeline
5. Click "Hello, [username]" to sign out — confirm revert to guest state

- [ ] **Step 4: Final commit**

```bash
git add web/js/views/home.js
git commit -m "chore: remove dead code from home.js (loadSpotlight, CATEGORY_COLORS)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Full-bleed masthead | Task 4 |
| Masthead: title + description + stats | Task 4 |
| Stats loaded dynamically from Supabase | Task 4 |
| Mobile masthead stacked layout | Task 4 |
| Entry blocks 4-col desktop / 2×2 mobile | Task 5 |
| Pipeline hidden for guests (not rendered) | Task 5 |
| Search always disabled | Task 5 |
| Entry block counts from Supabase | Tasks 4+5 |
| Organisms section with colored bars | Task 6 |
| Organisms navigate to genomes tab with strain | Task 6 |
| Gene counts per organism | Task 6 |
| Recent updates from site_updates | Task 6 |
| Footer: lab name, institution, links | Task 7 |
| Citation modal with copy button | Task 7 |
| Citation from site_config or default | Task 7 |
| Organism color palette update (breaking change) | Task 1 |
| Tailwind color aliases updated | Task 1 |
| Desktop Pipeline tab hidden by default | Task 3 |
| Auth greeting "Hello, [name]" | Task 3 |
| Mobile bottom nav Pipeline hidden for guests | Task 3 (covered by existing `updateNavVisibility`) |
| Full-bleed layout restructure | Task 2 |
| Spotlight / old hero removed | Task 4 (full rewrite replaces it) |
