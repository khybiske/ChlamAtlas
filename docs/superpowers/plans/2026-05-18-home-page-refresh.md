# Home Page Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page's entry-blocks + organism list layout with a three-column design (Genomes · Mutants · Community) and add Search + Saved stub buttons to the navbar.

**Architecture:** All changes live in three files — `index.html` (navbar buttons), `app.js` (stub event wires), and `home.js` (full column layout). The existing masthead stats, footer, and citation modal are preserved unchanged. New Supabase queries are added for mutant collection counts, users count, annotation sparkline data, and top contributors.

**Tech Stack:** Vanilla JS, Supabase JS v2, Tailwind CSS CDN, inline SVG for sparkline.

---

## File Map

| File | Change |
|---|---|
| `web/index.html` | Add Search + Saved buttons in `<header>`; bump app.js version to `v=66` |
| `web/js/app.js` | Add `wireNavStubs()` call + stub handlers; bump home.js import to `v=66` |
| `web/js/views/home.js` | Full rewrite — new scaffold + 5 new render functions, remove 4 old ones |

---

## Task 1: Add Search + Saved buttons to the navbar

**Files:**
- Modify: `web/index.html` (header `<div>` around line 44–70)

- [ ] **Step 1: Add the two nav buttons**

In `web/index.html`, replace the `<!-- Right side: auth -->` block with this (adds Search + Saved before `#auth-area`):

```html
      <!-- Right side: search, saved, auth -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <button id="btn-nav-search"
          style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:5px 11px;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style="font-size:12px;color:rgba(255,255,255,0.8);font-weight:500;">Search</span>
        </button>
        <button id="btn-nav-saved"
          style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:5px 11px;cursor:pointer;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span style="font-size:12px;color:rgba(255,255,255,0.8);font-weight:500;">Saved</span>
        </button>
        <div id="auth-area" class="flex items-center gap-2">
          <button id="btn-sign-in"
            class="text-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition border border-white/30 hover:border-white/50">
            Sign in
          </button>
        </div>
      </div>
```

- [ ] **Step 2: Bump app.js version**

On the last `<script>` line in `web/index.html`, change:
```html
<script type="module" src="/web/js/app.js?v=65"></script>
```
to:
```html
<script type="module" src="/web/js/app.js?v=66"></script>
```

- [ ] **Step 3: Verify in browser**

Open the app. Confirm Search and Saved pill buttons appear in the navbar to the left of the Sign in button. Clicking them should do nothing (not yet wired).

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "feat: add Search and Saved stub buttons to navbar"
```

---

## Task 2: Wire Search + Saved stubs in app.js

**Files:**
- Modify: `web/js/app.js` (top import line + add a new small function)

- [ ] **Step 1: Bump home.js import version**

In `web/js/app.js` line 3, change:
```js
import { renderHome } from './views/home.js?v=65';
```
to:
```js
import { renderHome } from './views/home.js?v=66';
```

- [ ] **Step 2: Add wireNavStubs function**

After the last `import` line and before the `const TABS` line, add:

```js
// ─── Nav stub buttons ──────────────────────────────────────
function wireNavStubs() {
  document.getElementById('btn-nav-search')?.addEventListener('click', () => {
    // TODO: open search modal
    console.log('Search coming soon');
  });
  document.getElementById('btn-nav-saved')?.addEventListener('click', () => {
    // TODO: navigate to Favorites page
    console.log('Saved coming soon');
  });
}
```

- [ ] **Step 3: Call wireNavStubs on DOMContentLoaded**

Find the `document.addEventListener('DOMContentLoaded', ...)` block (or the initialization call at the bottom of app.js). Add `wireNavStubs()` inside it, right after the existing setup calls. If there is no DOMContentLoaded block and the script runs at module load time, add the call at the module's top level after the function definition:

```js
wireNavStubs();
```

- [ ] **Step 4: Verify in browser**

Open browser console. Click Search — should log `Search coming soon`. Click Saved — should log `Saved coming soon`. No errors.

- [ ] **Step 5: Commit**

```bash
git add web/js/app.js
git commit -m "feat: wire Search and Saved navbar stub handlers"
```

---

## Task 3: Rewrite renderHome scaffold in home.js

**Files:**
- Modify: `web/js/views/home.js` — replace `renderHome()` function and its HTML template

- [ ] **Step 1: Replace the renderHome function**

Replace the entire `renderHome` export function (lines 28–117) with:

```js
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
```

- [ ] **Step 2: Verify scaffold renders**

Open the app home tab. Confirm: masthead appears with skeleton stats, three blank columns appear below it (will be empty until next tasks), footer renders. No JS errors in console.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page 3-column scaffold"
```

---

## Task 4: Render Genomes column

**Files:**
- Modify: `web/js/views/home.js` — add `renderGenomesColumn`, remove `loadOrganisms`

The `ORGANISMS` constant at the top of home.js (lines 4–26) is kept as-is.

- [ ] **Step 1: Add renderGenomesColumn function**

Add this function after `renderHome` (before `loadStats`):

```js
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

  // Wire navigation
  el.querySelectorAll('[data-strain]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__preferredStrain = btn.dataset.strain;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'genomes' } }));
    });
  });

  // Load live gene counts
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
```

- [ ] **Step 2: Remove loadOrganisms function**

Delete the entire `loadOrganisms` function (the one that populates `#organisms-section`). It is no longer referenced.

- [ ] **Step 3: Verify**

Home page Genomes column shows three strain cards (CT-L2 green, CT-D purple, CM blue). Gene counts load asynchronously. Clicking a card navigates to the Genomes tab with that strain selected.

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page genomes column with live gene counts"
```

---

## Task 5: Render Mutants column

**Files:**
- Modify: `web/js/views/home.js` — add `renderMutantsColumn`, remove `renderEntryBlocks` + `entryBlockHTML`

- [ ] **Step 1: Define collections constant**

Add this constant near the top of home.js, after the `ORGANISMS` constant:

```js
const COLLECTIONS = [
  { id: 'CT_L2',    label: 'C. trachomatis', sub: 'CT-L2',   avatarBg: '#dcfce7', emoji: '🧫' },
  { id: 'CM',       label: 'C. muridarum',   sub: 'CM',      avatarBg: '#dbeafe', emoji: '🐭' },
  { id: 'Lucky17',  label: 'Lucky 17',        sub: 'Curated', avatarBg: '#fef9c3', emoji: '⭐' },
  { id: 'Chimeras', label: 'Chimeras',        sub: 'L2 × CM', avatarBg: '#fdf4ff', emoji: '🔀' },
];
```

- [ ] **Step 2: Add renderMutantsColumn function**

```js
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

  // Wire navigation
  el.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__mutantCollection = btn.dataset.collection;
      window.dispatchEvent(new CustomEvent('chlamatlas:navigate', { detail: { tab: 'mutants' } }));
    });
  });

  // Load live counts
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
```

- [ ] **Step 3: Remove renderEntryBlocks and entryBlockHTML**

Delete the entire `renderEntryBlocks` function and the `entryBlockHTML` helper function. Neither is referenced from `renderHome` anymore.

- [ ] **Step 4: Verify**

Mutants column shows four collection rows with emoji avatars. Counts load asynchronously. Clicking a row navigates to Mutants with that collection selected. No console errors.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: home page mutants column with live collection counts"
```

---

## Task 6: Render Community column — scaffold + map + stats

**Files:**
- Modify: `web/js/views/home.js` — add `renderCommunityColumn` and `loadCommunityStats`

- [ ] **Step 1: Add renderCommunityColumn**

```js
function renderCommunityColumn(container) {
  const el = container.querySelector('#col-community');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#1a6b4a;margin-bottom:18px;">
      🌍 Community
    </div>

    <!-- Map placeholder -->
    <div style="background:#eff6ff;border:1px solid #dbeafe;border-radius:8px;padding:14px;margin-bottom:10px;">
      <div style="height:110px;border-radius:5px;background:#e8f2ff;position:relative;overflow:hidden;">
        <svg width="100%" height="100%" viewBox="0 0 300 110" style="position:absolute;inset:0;opacity:0.18;" preserveAspectRatio="xMidYMid meet">
          <path d="M28,32 Q52,18 72,34 Q82,46 66,57 Q44,62 28,52 Z" fill="#1d4ed8"/>
          <path d="M88,24 Q132,12 153,29 Q163,41 157,57 Q140,67 108,61 Q83,51 88,24 Z" fill="#1d4ed8"/>
          <path d="M163,29 Q186,20 202,34 Q208,49 197,60 Q174,65 158,52 Z" fill="#1d4ed8"/>
          <path d="M214,27 Q242,18 262,31 Q270,45 257,56 Q236,62 213,51 Z" fill="#1d4ed8"/>
          <path d="M93,66 Q117,59 128,73 Q123,84 101,82 Q87,76 93,66 Z" fill="#1d4ed8"/>
        </svg>
        <div id="map-dots"></div>
      </div>
      <div id="map-caption" style="font-size:11px;color:#3b82f6;font-weight:500;margin-top:8px;text-align:center;">
        Researchers worldwide
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

  loadCommunityStats(container);
  loadTopContributors(container);
  loadActivityFeed(container);
}
```

- [ ] **Step 2: Add loadCommunityStats function**

```js
async function loadCommunityStats(container) {
  try {
    // Users count
    const { count: userCount } = await sb
      .from('users')
      .select('id', { count: 'exact', head: true });

    const userEl = container.querySelector('#community-user-count');
    if (userEl && userCount != null)
      userEl.textContent = userCount.toLocaleString();

    // Map caption
    const mapEl = container.querySelector('#map-caption');
    if (mapEl && userCount != null)
      mapEl.textContent = `${userCount.toLocaleString()} researcher${userCount !== 1 ? 's' : ''} worldwide`;

    // Annotations by month (fetch all, group client-side)
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

    // Group by YYYY-MM
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
```

- [ ] **Step 3: Add renderSparkline helper**

```js
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
```

- [ ] **Step 4: Verify**

Community column renders. Map placeholder visible. Users count loads (shows number or "—" if no data). Sparkline shows bars if annotations exist, "No annotations yet" placeholder if empty. No console errors.

- [ ] **Step 5: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: community column — map, users count, annotation sparkline"
```

---

## Task 7: Render Community — top contributors leaderboard

**Files:**
- Modify: `web/js/views/home.js` — add `loadTopContributors`

- [ ] **Step 1: Add loadTopContributors function**

```js
async function loadTopContributors(container) {
  const el = container.querySelector('#community-leaderboard');
  if (!el) return;

  try {
    // Fetch all annotations with user_id, group client-side
    const { data } = await sb
      .from('annotations')
      .select('user_id');

    if (!data?.length) {
      el.innerHTML = `<div style="font-size:11px;color:#d1d5db;">No contributions yet</div>`;
      return;
    }

    // Count per user
    const counts = {};
    data.forEach(row => {
      counts[row.user_id] = (counts[row.user_id] || 0) + 1;
    });
    const top3 = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([userId, count]) => ({ userId, count }));

    // Fetch user display names
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
```

- [ ] **Step 2: Verify**

If annotations exist with user_ids: top 3 contributors shown with medals, name, lab, count. If no annotations: shows "No contributions yet". No console errors.

- [ ] **Step 3: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: community column — top contributors leaderboard"
```

---

## Task 8: Render Community — cycling activity strip

**Files:**
- Modify: `web/js/views/home.js` — add `loadActivityFeed`, remove old `loadUpdates`

- [ ] **Step 1: Add loadActivityFeed function**

```js
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
```

- [ ] **Step 2: Remove loadUpdates function**

Delete the entire `loadUpdates` function and the `UPDATE_COLORS` constant above it. Both are no longer referenced.

- [ ] **Step 3: Verify**

Activity strip shows first site_update entry on load, cycles through entries every 4 seconds with fade transition. Relative timestamps shown ("2h ago", "yesterday", etc.). If no site_updates rows: shows "No recent activity".

- [ ] **Step 4: Commit**

```bash
git add web/js/views/home.js
git commit -m "feat: community column — cycling activity feed"
```

---

## Task 9: Final cleanup and version bump

**Files:**
- Modify: `web/js/views/home.js` — confirm dead code is gone, bump import version
- Modify: `web/js/app.js` — confirm home.js version bump applied

- [ ] **Step 1: Audit home.js for dead code**

Confirm these functions/constants no longer exist in home.js (they were removed in earlier tasks):
- `renderEntryBlocks`
- `entryBlockHTML`
- `loadOrganisms`
- `loadUpdates`
- `UPDATE_COLORS`

If any remain, delete them now.

- [ ] **Step 2: Confirm version numbers**

- `web/js/app.js` line 3: should read `home.js?v=66`
- `web/index.html` last script tag: should read `app.js?v=66`

Fix if either was missed in earlier tasks.

- [ ] **Step 3: Smoke-test the full page**

Open the home tab. Verify:
- [ ] Masthead renders with ChlamAtlas title and stats
- [ ] Three equal columns visible side by side
- [ ] Genomes: 3 strain cards with colored left borders, gene counts populated
- [ ] Mutants: 4 collection rows with emoji avatars, mutant counts populated
- [ ] Community: map placeholder, users count, sparkline (or placeholder), leaderboard, cycling strip
- [ ] Footer renders with "How to cite", GitHub, Contact links
- [ ] Citation modal opens and closes
- [ ] Clicking a strain card navigates to Genomes tab
- [ ] Clicking a collection row navigates to Mutants tab
- [ ] Navbar Search and Saved buttons visible; clicking logs to console
- [ ] No JS errors in console

- [ ] **Step 4: Final commit**

```bash
git add web/js/views/home.js web/js/app.js web/index.html
git commit -m "chore: home page refresh — cleanup and version bump"
```

---

## Notes for future sessions

- **Real world map:** requires geocoding pipeline for `city`/`country` fields in `users` table. Deferred.
- **Search modal:** navbar button is a stub. Full-screen modal with gene/mutant search is a separate feature.
- **Saved/Favorites page:** navbar button is a stub. Requires a favorites tab and storage mechanism.
- **Mobile bottom nav:** Search + Saved not yet added to `#mobile-nav`. Deferred to mobile polish pass.
- **Column height balancing:** community column will likely be taller than genomes/mutants until real data fills in. Revisit after launch with real data.
- **Annotation sparkline performance:** currently fetches all annotation rows and groups client-side. Fine for low volumes; add a Supabase RPC or materialized view if annotations grow large.
