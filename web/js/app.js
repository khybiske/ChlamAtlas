// ChlamAtlas — main application entry point
import { sb, state, SUPABASE_URL, SUPABASE_ANON_KEY } from './client.js?v=65';
import { renderHome } from './views/home.js?v=70';
import { renderGenomes } from './views/genomes.js?v=66';
import { renderMutants } from './views/mutants.js?v=69';
import { renderPipeline } from './views/pipeline.js?v=65';

export { sb, state };

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

  if (name === 'pipeline' && !['lab_member','admin'].includes(state.userRole)) {
    name = 'home';
    state.currentTab = 'home';
  }

  TABS.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  const container = document.getElementById(`${name}-content`);
  if (container) {
    container.innerHTML = '';
    RENDERERS[name](container);
  }

  history.replaceState(null, '', `#/${name}`);
}

// ─── Auth ─────────────────────────────────────────────────
// Fetch the user's profile row using the access_token we already have from the
// auth event — avoids re-acquiring the Supabase auth storage lock, which causes
// "lock was stolen" contention errors when called from inside onAuthStateChange.
async function refreshRole(accessToken) {
  if (!state.user) {
    state.userRole    = 'guest';
    state.userProfile = null;
    return;
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(state.user.id)}` +
      `&select=role,display_name,lab_affiliation,city,country,role_request,created_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    if (res.ok) {
      const rows = await res.json();
      const data = rows[0] ?? null;
      state.userRole    = data?.role    ?? 'community';
      state.userProfile = data ?? null;
    }
  } catch (e) {
    console.warn('[ChlamAtlas] refreshRole error:', e);
  }
}

// Auth state listener — single source of truth for session state.
// INITIAL_SESSION fires once after Supabase cleanly resolves the stored session
// (including any lock contention); this is more reliable than getSession() which
// can throw in Safari when the storage lock is contested at page load.
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showAuthModal('reset');
    return;
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    if (session?.user) {
      state.user        = session.user;
      state.accessToken = session.access_token;
      await refreshRole(session.access_token);
    }
    updateNavVisibility();
    renderAuthArea();
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    state.user        = session.user;
    state.accessToken = session.access_token;
    await refreshRole(session.access_token);
  } else if (event === 'SIGNED_OUT') {
    state.user        = null;
    state.userRole    = 'guest';
    state.userProfile = null;
    state.accessToken = null;
    updateNavVisibility();
    renderAuthArea();
  }
});

// ─── Nav auth area ─────────────────────────────────────────
function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (state.user) {
    const profile = state.userProfile;
    const name = profile?.display_name || (state.user.email ?? '').split('@')[0];

    // Role badge — only shown for lab_member and admin, not community
    const roleBadge = state.userRole === 'admin'
      ? `<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
             background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);
             border-radius:4px;padding:1px 6px;margin-left:6px;">Admin</span>`
      : state.userRole === 'lab_member'
      ? `<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
             background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.9);
             border-radius:4px;padding:1px 6px;margin-left:6px;">Lab</span>`
      : '';

    area.innerHTML = `
      <button id="btn-user-menu"
        style="display:flex;align-items:center;font-size:13px;font-weight:500;color:rgba(255,255,255,0.85);
               background:none;border:none;cursor:pointer;padding:4px 2px;gap:4px;line-height:1.2;">
        <span style="opacity:0.7;font-weight:400;">Hello,&nbsp;</span>${name}${roleBadge}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          style="opacity:0.6;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
      </button>`;
    document.getElementById('btn-user-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleUserDropdown();
    });
  } else {
    area.innerHTML = `
      <button id="btn-sign-in"
        class="text-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition border border-white/30 hover:border-white/50">
        Sign in
      </button>`;
    document.getElementById('btn-sign-in').addEventListener('click', () => showAuthModal('signin'));
  }
}

// ─── User dropdown ─────────────────────────────────────────
let _dropdownEl = null;

function toggleUserDropdown() {
  if (_dropdownEl) { hideUserDropdown(); return; }
  showUserDropdown();
}

function showUserDropdown() {
  hideUserDropdown();

  const trigger  = document.getElementById('btn-user-menu');
  const rect     = trigger.getBoundingClientRect();
  const profile  = state.userProfile;
  const name     = profile?.display_name || (state.user.email ?? '').split('@')[0];
  const affil    = profile?.lab_affiliation ? `<div style="font-size:10.5px;color:#6b7280;margin-top:1px;">${profile.lab_affiliation}</div>` : '';
  const email    = `<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${state.user.email}</div>`;

  const requestBtn = state.userRole === 'community' && !profile?.role_request
    ? `<button id="dd-request-access"
        style="width:100%;text-align:left;padding:7px 12px;font-size:12px;color:#374151;background:none;border:none;cursor:pointer;border-top:1px solid #f3f4f6;"
        onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='none'">
        Request lab access
      </button>`
    : state.userRole === 'community' && profile?.role_request
    ? `<div style="padding:7px 12px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;font-style:italic;">Lab access request pending</div>`
    : '';

  const adminBtn = state.userRole === 'admin'
    ? `<button id="dd-admin-panel"
        style="width:100%;text-align:left;padding:7px 12px;font-size:12px;color:#374151;background:none;border:none;cursor:pointer;border-top:1px solid #f3f4f6;"
        onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='none'">
        Manage users
      </button>`
    : '';

  _dropdownEl = document.createElement('div');
  _dropdownEl.id = 'user-dropdown';
  _dropdownEl.style.cssText = `
    position:fixed;top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;
    background:white;border:1px solid #e5e7eb;border-radius:10px;
    box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:200;min-width:200px;overflow:hidden;`;

  _dropdownEl.innerHTML = `
    <div style="padding:10px 12px 8px;">
      <div style="font-size:13px;font-weight:600;color:#111;">${name}</div>
      ${affil}
      ${email}
    </div>
    <button id="dd-my-account"
      style="width:100%;text-align:left;padding:7px 12px;font-size:12px;color:#374151;background:none;border:none;cursor:pointer;border-top:1px solid #f3f4f6;"
      onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='none'">
      My account
    </button>
    ${requestBtn}
    ${adminBtn}
    <button id="dd-sign-out"
      style="width:100%;text-align:left;padding:7px 12px;font-size:12px;color:#374151;background:none;border:none;cursor:pointer;border-top:1px solid #f3f4f6;"
      onmouseenter="this.style.background='#f9fafb'" onmouseleave="this.style.background='none'">
      Sign out
    </button>`;

  document.body.appendChild(_dropdownEl);

  document.getElementById('dd-my-account').addEventListener('click', () => { hideUserDropdown(); showAccountModal(); });
  document.getElementById('dd-sign-out').addEventListener('click', () => { hideUserDropdown(); signOut(); });
  document.getElementById('dd-request-access')?.addEventListener('click', () => { hideUserDropdown(); requestLabAccess(); });
  document.getElementById('dd-admin-panel')?.addEventListener('click', () => { hideUserDropdown(); showAdminPanel(); });

  // Close on click outside
  setTimeout(() => document.addEventListener('click', _outsideClick), 0);
}

function _outsideClick(e) {
  if (_dropdownEl && !_dropdownEl.contains(e.target)) hideUserDropdown();
}

function hideUserDropdown() {
  _dropdownEl?.remove();
  _dropdownEl = null;
  document.removeEventListener('click', _outsideClick);
}

// ─── Nav visibility ────────────────────────────────────────
function updateNavVisibility() {
  const showPipeline = ['lab_member','admin'].includes(state.userRole);
  document.querySelectorAll('[data-tab="pipeline"]').forEach(btn => {
    btn.style.display = showPipeline ? '' : 'none';
  });
}

// ─── Auth modal ────────────────────────────────────────────
function showAuthModal(panel = 'signin') {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthTab(panel);
  const focusMap = { signin: 'auth-email', signup: 'signup-email', forgot: 'forgot-email', reset: 'reset-password' };
  document.getElementById(focusMap[panel] || 'auth-email')?.focus();
}

function hideAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  ['auth-error','signup-error','signup-success','forgot-error','forgot-success','reset-error']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('auth-form-forgot')?.reset();
  document.getElementById('auth-form-reset')?.reset();
}

function switchAuthTab(panel) {
  ['signin','signup','forgot','reset'].forEach(p => {
    document.getElementById(`auth-panel-${p}`)?.classList.toggle('hidden', p !== panel);
  });

  const isForgotOrReset = panel === 'forgot' || panel === 'reset';
  document.getElementById('auth-tab-bar').classList.toggle('hidden', isForgotOrReset);

  if (!isForgotOrReset) {
    const isSignin = panel === 'signin';
    const signinBtn = document.getElementById('auth-tab-signin');
    const signupBtn = document.getElementById('auth-tab-signup');
    signinBtn.style.color       = isSignin ? '#0f4530' : '#9ca3af';
    signinBtn.style.borderColor = isSignin ? '#0f4530' : 'transparent';
    signinBtn.style.fontWeight  = isSignin ? '600' : '500';
    signupBtn.style.color       = !isSignin ? '#0f4530' : '#9ca3af';
    signupBtn.style.borderColor = !isSignin ? '#0f4530' : 'transparent';
    signupBtn.style.fontWeight  = !isSignin ? '600' : '500';
  }
}

document.getElementById('auth-tab-signin').addEventListener('click', () => switchAuthTab('signin'));
document.getElementById('auth-tab-signup').addEventListener('click', () => switchAuthTab('signup'));

// ─── Sign-in form ──────────────────────────────────────────
document.getElementById('auth-form-signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn.disabled) return;

  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  errEl.classList.add('hidden');

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Sign in';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  // onAuthStateChange(SIGNED_IN) fires automatically and handles state + re-render.
  hideAuthModal();
  activateTab(state.currentTab);
});

// ─── Sign-up form ──────────────────────────────────────────
document.getElementById('auth-form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn.disabled) return;

  const email  = document.getElementById('signup-email').value.trim();
  const pw1    = document.getElementById('signup-password').value;
  const pw2    = document.getElementById('signup-password2').value;
  const name   = document.getElementById('signup-name').value.trim();
  const affil  = document.getElementById('signup-affil').value.trim();
  const city   = document.getElementById('signup-city').value.trim();
  const errEl  = document.getElementById('signup-error');
  const okEl   = document.getElementById('signup-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  if (pw1 !== pw2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  const { data, error } = await sb.auth.signUp({
    email,
    password: pw1,
    options: { data: { display_name: name || null, lab_affiliation: affil || null, city: city || null, country: document.getElementById('signup-country').value.trim() || null } },
  });

  btn.disabled = false;
  btn.textContent = 'Create account';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  if (data.session) {
    // Email confirmation is disabled — user is signed in immediately.
    hideAuthModal();
    activateTab(state.currentTab);
  } else {
    // Email confirmation is enabled — user must verify before signing in.
    okEl.textContent = 'Account created! Check your email for a verification link.';
    okEl.classList.remove('hidden');
    document.getElementById('auth-form-signup').reset();
  }
});

// ─── Forgot password ───────────────────────────────────────
document.getElementById('auth-forgot-link').addEventListener('click', () => switchAuthTab('forgot'));
document.getElementById('auth-back-signin').addEventListener('click', () => switchAuthTab('signin'));

document.getElementById('auth-form-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn.disabled) return;

  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const okEl  = document.getElementById('forgot-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  btn.disabled = false;
  btn.textContent = 'Send reset link';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  okEl.textContent = 'Check your email for a reset link.';
  okEl.classList.remove('hidden');
  document.getElementById('auth-form-forgot').reset();
});

// ─── Set new password (after clicking reset email link) ────
document.getElementById('auth-form-reset').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = e.submitter || e.target.querySelector('button[type=submit]');
  if (btn.disabled) return;

  const pw1   = document.getElementById('reset-password').value;
  const pw2   = document.getElementById('reset-password2').value;
  const errEl = document.getElementById('reset-error');
  errEl.classList.add('hidden');

  if (pw1 !== pw2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await sb.auth.updateUser({ password: pw1 });

  btn.disabled = false;
  btn.textContent = 'Set new password';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  hideAuthModal();
  activateTab(state.currentTab);
});

// ─── Account modal ─────────────────────────────────────────
function showAccountModal() {
  const modal   = document.getElementById('account-modal');
  const profile = state.userProfile;
  const name    = profile?.display_name || (state.user.email ?? '').split('@')[0];
  const initial = name.charAt(0).toUpperCase();

  // Avatar + identity
  document.getElementById('acct-avatar').textContent        = initial;
  document.getElementById('acct-name-display').textContent  = name;
  document.getElementById('acct-email-display').textContent = state.user.email ?? '';

  const roleLabels = { admin: 'Admin', lab_member: 'Lab member', community: 'Community' };
  const roleColors = { admin: '#0f4530', lab_member: '#1d6f4a', community: '#6b7280' };
  const role = state.userRole;
  document.getElementById('acct-role-display').innerHTML = `
    <span style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;
                 color:white;background:${roleColors[role] ?? '#6b7280'};border-radius:4px;padding:2px 7px;">
      ${roleLabels[role] ?? role}
    </span>`;

  // Pre-fill edit fields with current profile values
  document.getElementById('acct-display-name').value  = profile?.display_name   ?? '';
  document.getElementById('acct-affiliation').value   = profile?.lab_affiliation ?? '';
  document.getElementById('acct-city').value          = profile?.city            ?? '';
  document.getElementById('acct-country').value       = profile?.country         ?? '';

  // Member since
  const since = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';
  document.getElementById('acct-member-since').textContent = since;

  // Annotation count (async)
  document.getElementById('acct-annotation-count').textContent = '…';
  sb.from('annotations').select('*', { count: 'exact', head: true }).eq('curator_id', state.user.id)
    .then(({ count }) => {
      document.getElementById('acct-annotation-count').textContent = count ?? 0;
    });

  // Clear messages
  ['acct-save-error','acct-save-success'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.textContent = '';
  });

  modal.classList.remove('hidden');
  document.getElementById('acct-display-name').focus();
}

function hideAccountModal() {
  document.getElementById('account-modal').classList.add('hidden');
}

document.getElementById('account-modal-close').addEventListener('click', hideAccountModal);
document.getElementById('account-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('account-modal')) hideAccountModal();
});

document.getElementById('acct-save-btn').addEventListener('click', async () => {
  const btn     = document.getElementById('acct-save-btn');
  const errEl   = document.getElementById('acct-save-error');
  const okEl    = document.getElementById('acct-save-success');
  const newName = document.getElementById('acct-display-name').value.trim();
  const newAffl = document.getElementById('acct-affiliation').value.trim();

  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const newCity    = document.getElementById('acct-city').value.trim();
  const newCountry = document.getElementById('acct-country').value.trim();
  const saveRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(state.user.id)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name:    newName    || null,
        lab_affiliation: newAffl    || null,
        city:            newCity    || null,
        country:         newCountry || null,
      }),
    }
  );
  const error = saveRes.ok ? null : { message: `Save failed (${saveRes.status}) — try signing out and back in.` };
  btn.disabled = false;
  btn.textContent = 'Save changes';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  // Re-fetch profile to get updated values and refresh nav
  await refreshRole();
  renderAuthArea();

  const displayName = state.userProfile?.display_name || (state.user.email ?? '').split('@')[0];
  document.getElementById('acct-avatar').textContent       = displayName.charAt(0).toUpperCase();
  document.getElementById('acct-name-display').textContent = displayName;

  okEl.textContent = 'Saved!';
  okEl.classList.remove('hidden');
  setTimeout(() => okEl.classList.add('hidden'), 2500);
});

document.getElementById('acct-change-password').addEventListener('click', () => {
  hideAccountModal();
  showAuthModal('forgot');
});

// ─── Sign-out ──────────────────────────────────────────────
async function signOut() {
  await sb.auth.signOut();
  state.user        = null;
  state.userRole    = 'guest';
  state.userProfile = null;
  updateNavVisibility();
  renderAuthArea();
  activateTab('home');
}

// ─── Role request ──────────────────────────────────────────
async function requestLabAccess() {
  const { error } = await sb.from('users')
    .update({ role_request: 'lab_member' })
    .eq('id', state.user.id);
  if (error) { alert('Something went wrong. Please try again.'); return; }
  state.userProfile = { ...state.userProfile, role_request: 'lab_member' };
  renderAuthArea();
  // Small confirmation
  const area = document.getElementById('auth-area');
  const orig = area.innerHTML;
  const note = document.createElement('span');
  note.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.7);margin-left:8px;';
  note.textContent = 'Request sent';
  area.appendChild(note);
  setTimeout(() => note.remove(), 3000);
}

// ─── Admin panel ───────────────────────────────────────────
function showAdminPanel() {
  document.getElementById('admin-modal').classList.remove('hidden');
  loadAdminPanel();
}
function hideAdminPanel() {
  document.getElementById('admin-modal').classList.add('hidden');
}

async function loadAdminPanel() {
  const el = document.getElementById('admin-panel-content');
  el.innerHTML = '<div class="text-center text-gray-300 py-8">Loading…</div>';

  const { data: users, error } = await sb
    .from('users')
    .select('id, email, display_name, lab_affiliation, role, role_request')
    .order('role')
    .order('email');

  if (error) {
    el.innerHTML = `<div class="text-red-400 text-sm">${error.message}</div>`;
    return;
  }

  const pending  = users.filter(u => u.role_request);
  const rest     = users.filter(u => !u.role_request);
  const sorted   = [...pending, ...rest];

  const rolePill = (role) => {
    const map = {
      admin:      { bg:'#ecfdf5', text:'#065f46', label:'Admin' },
      lab_member: { bg:'#eff6ff', text:'#1d4ed8', label:'Lab Member' },
      community:  { bg:'#f9fafb', text:'#6b7280', label:'Community' },
    };
    const s = map[role] ?? map.community;
    return `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${s.bg};color:${s.text};">${s.label}</span>`;
  };

  const rows = sorted.map(u => `
    <tr data-uid="${u.id}" style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:10px 8px;">
        <div style="font-size:12.5px;font-weight:500;color:#111;">${u.display_name || '—'}</div>
        <div style="font-size:10.5px;color:#9ca3af;">${u.email}</div>
        ${u.lab_affiliation ? `<div style="font-size:10.5px;color:#9ca3af;">${u.lab_affiliation}</div>` : ''}
      </td>
      <td style="padding:10px 8px;">${rolePill(u.role)}</td>
      <td style="padding:10px 8px;">
        ${u.role_request
          ? `<div style="display:flex;gap:6px;align-items:center;">
               <span style="font-size:10px;color:#d97706;font-weight:500;">Requesting lab access</span>
               <button data-action="approve" data-uid="${u.id}"
                 style="font-size:10px;font-weight:600;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:5px;padding:2px 8px;cursor:pointer;">Approve</button>
               <button data-action="deny" data-uid="${u.id}"
                 style="font-size:10px;font-weight:600;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:2px 8px;cursor:pointer;">Deny</button>
             </div>`
          : `<select data-action="setrole" data-uid="${u.id}"
               style="font-size:11px;border:1px solid #e5e7eb;border-radius:6px;padding:3px 6px;color:#374151;background:white;cursor:pointer;">
               <option value="community" ${u.role==='community'?'selected':''}>Community</option>
               <option value="lab_member" ${u.role==='lab_member'?'selected':''}>Lab Member</option>
               <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
             </select>`
        }
      </td>
    </tr>`).join('');

  el.innerHTML = `
    <p style="font-size:12px;color:#9ca3af;margin-bottom:12px;">${users.length} users · ${pending.length} pending request${pending.length !== 1 ? 's' : ''}</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #f0f0f0;">
          <th style="text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;padding:0 8px 8px;">User</th>
          <th style="text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;padding:0 8px 8px;">Role</th>
          <th style="text-align:left;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;padding:0 8px 8px;">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Wire action buttons and dropdowns
  el.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setUserRole(btn.dataset.uid, 'lab_member', true);
      loadAdminPanel();
    });
  });
  el.querySelectorAll('[data-action="deny"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setUserRole(btn.dataset.uid, null, true);
      loadAdminPanel();
    });
  });
  el.querySelectorAll('[data-action="setrole"]').forEach(sel => {
    sel.addEventListener('change', async () => {
      await setUserRole(sel.dataset.uid, sel.value, false);
      loadAdminPanel();
    });
  });
}

async function setUserRole(uid, role, clearRequest) {
  const update = {};
  if (role !== null) update.role = role;
  if (clearRequest)  update.role_request = null;
  await sb.from('users').update(update).eq('id', uid);
}

document.getElementById('admin-modal-close').addEventListener('click', hideAdminPanel);
document.getElementById('admin-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('admin-modal')) hideAdminPanel();
});

// ─── Modal close wiring ────────────────────────────────────
document.getElementById('auth-modal-close').addEventListener('click', hideAuthModal);
document.getElementById('auth-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('auth-modal')) hideAuthModal();
});

// ─── Mutants nav dropdown ─────────────────────────────────
const MUTANT_COLLECTIONS = [
  { id: 'CT_L2',   label: 'C. trachomatis', icon: '/design/L2icon.jpg',      count: null },
  { id: 'CM',      label: 'C. muridarum',   icon: '/design/CMicon.jpg',      count: null },
  { id: 'Lucky17', label: 'Lucky 17',        icon: '/design/L17icon.jpg',     count: null },
  { id: 'Chimeras',label: 'Chimeras',        icon: '/design/Chimeraicon.jpg', count: null },
];
let _mutDropdownEl = null;
let _mutOutsideClick = null;

function showMutantDropdown(anchorEl) {
  hideMutantDropdown();
  const wrap = document.getElementById('nav-mutants-wrap');
  const dd = document.createElement('div');
  dd.className = 'mut-nav-dropdown';
  dd.innerHTML = `
    <div class="mut-nav-dropdown-header">Collections</div>
    ${MUTANT_COLLECTIONS.map(c => `
      <button class="mut-nav-row" data-collection="${c.id}">
        <img class="mut-nav-icon" src="${c.icon}" alt="">
        <span class="mut-nav-label">${c.label}</span>
      </button>
    `).join('')}
  `;
  wrap.appendChild(dd);
  _mutDropdownEl = dd;
  dd.querySelectorAll('[data-collection]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__mutantCollection = btn.dataset.collection;
      hideMutantDropdown();
      activateTab('mutants');
    });
  });
  _mutOutsideClick = (e) => {
    if (!dd.contains(e.target) && e.target !== anchorEl) hideMutantDropdown();
  };
  setTimeout(() => document.addEventListener('click', _mutOutsideClick), 0);
}

function hideMutantDropdown() {
  if (_mutDropdownEl) { _mutDropdownEl.remove(); _mutDropdownEl = null; }
  if (_mutOutsideClick) { document.removeEventListener('click', _mutOutsideClick); _mutOutsideClick = null; }
}

// ─── Nav wiring ───────────────────────────────────────────
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.dropdown === 'mutants') {
      showMutantDropdown(btn);
      return;
    }
    activateTab(btn.dataset.tab);
  });
});
document.getElementById('nav-home-logo').addEventListener('click', (e) => {
  e.preventDefault();
  activateTab('home');
});

window.addEventListener('chlamatlas:navigate', (e) => activateTab(e.detail.tab));

// ─── Boot ─────────────────────────────────────────────────
// Render immediately as guest — onAuthStateChange(INITIAL_SESSION) will fire
// shortly after and update nav/role once Supabase resolves the stored session.
// Never call getSession() here: in Safari it acquires a storage lock that can
// throw "Lock was released" when an existing session is present, leaving the
// Supabase client in a broken state that silences all subsequent queries.
renderAuthArea();
updateNavVisibility();
wireNavStubs();
const _hash = location.hash.replace(/^#\/?/, '');
activateTab(TABS.includes(_hash) ? _hash : 'home');
