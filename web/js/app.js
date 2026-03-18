// ChlamAtlas — main application entry point
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { renderHome } from './views/home.js';
import { renderGenomes } from './views/genomes.js';
import { renderMutants } from './views/mutants.js';
import { renderPipeline } from './views/pipeline.js';

// ─── Supabase client (singleton) ──────────────────────────
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── App state ────────────────────────────────────────────
export const state = {
  user: null,
  userRole: 'guest',
  currentTab: 'home',
};

// ─── Tab routing ──────────────────────────────────────────
const TABS = ['home', 'genomes', 'mutants', 'pipeline'];
const RENDERERS = {
  home:     renderHome,
  genomes:  renderGenomes,
  mutants:  renderMutants,
  pipeline: renderPipeline,
};

function activateTab(name) {
  if (!TABS.includes(name)) name = 'home';
  state.currentTab = name;

  // Pipeline tab is lab_member and admin only
  if (name === 'pipeline' && !['lab_member','admin'].includes(state.userRole)) {
    name = 'home';
    state.currentTab = 'home';
  }

  // Show/hide panels
  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
  });

  // Update desktop nav
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  // Update mobile nav
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  // Always re-render (views manage their own state, and cross-tab navigation needs fresh renders)
  const container = document.getElementById(`${name}-content`);
  if (container) {
    container.innerHTML = '';
    RENDERERS[name](container);
  }

  // Update URL hash
  history.replaceState(null, '', `#${name}`);
}

// ─── Auth ──────────────────────────────────────────────────
async function loadUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    state.user = session.user;
    await refreshRole();
    updateNavVisibility();
    renderAuthArea();
  }
}

async function refreshRole() {
  if (!state.user) { state.userRole = 'guest'; return; }
  const { data } = await sb.from('users').select('role').eq('id', state.user.id).single();
  state.userRole = data?.role ?? 'guest';
}

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

function updateNavVisibility() {
  const showPipeline = ['lab_member','admin'].includes(state.userRole);
  document.querySelectorAll('[data-tab="pipeline"]').forEach(btn => {
    btn.style.display = showPipeline ? '' : 'none';
  });
}

function showAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.getElementById('auth-email').focus();
}
function hideAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
}

async function signOut() {
  await sb.auth.signOut();
  state.user = null;
  state.userRole = 'guest';
  updateNavVisibility();
  renderAuthArea();
  activateTab('home');
}

// ─── Auth form ────────────────────────────────────────────
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.classList.add('hidden');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  state.user = data.user;
  await refreshRole();
  updateNavVisibility();
  renderAuthArea();
  hideAuthModal();

  activateTab(state.currentTab);
});

document.getElementById('auth-modal-close').addEventListener('click', hideAuthModal);
document.getElementById('auth-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('auth-modal')) hideAuthModal();
});

// ─── Wire up nav buttons ──────────────────────────────────
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});
document.getElementById('nav-home-logo').addEventListener('click', (e) => {
  e.preventDefault();
  activateTab('home');
});

// Home view hero buttons dispatch this event (they can't import activateTab directly)
window.addEventListener('chlamatlas:navigate', (e) => activateTab(e.detail.tab));

// ─── Boot ─────────────────────────────────────────────────
(async () => {
  await loadUser();
  renderAuthArea();
  updateNavVisibility();

  // Route to hash or default home
  const hash = location.hash.replace('#', '');
  activateTab(TABS.includes(hash) ? hash : 'home');
})();
