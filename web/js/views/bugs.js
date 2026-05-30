// ChlamAtlas — Bug Reports view

import { sb, state } from '../client.js?v=82';

export async function renderBugs(container) {
  container.innerHTML = `
    <div style="max-width:760px;margin:0 auto;padding:28px 24px 48px;">

      <div style="margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
        <h1 style="font-size:22px;font-weight:800;color:#111;margin:0 0 4px;">🐛 Bug Reports</h1>
        <p style="font-size:13px;color:#9ca3af;margin:0;">Known issues reported by users. Check here before reporting to avoid duplicates.</p>
      </div>

      <div id="bugs-submit-section"></div>

      <div id="bugs-list-section">
        <div style="font-size:13px;color:#9ca3af;padding:24px 0;">Loading…</div>
      </div>

    </div>`;

  renderSubmitSection(container);
  await loadBugs(container);
}

function renderSubmitSection(container) {
  const el = container.querySelector('#bugs-submit-section');
  if (!state.user) {
    el.innerHTML = `
      <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:14px 16px;margin-bottom:28px;font-size:12px;color:#6b7280;">
        <a href="#" id="bugs-sign-in-link" style="color:#111;font-weight:600;text-decoration:underline;">Sign in</a> to report a bug.
      </div>`;
    el.querySelector('#bugs-sign-in-link').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('auth-btn')?.click();
    });
    return;
  }

  el.innerHTML = `
    <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:16px;margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Report a bug</div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Title <span style="color:#ef4444;">*</span></label>
        <input id="bug-title" type="text" placeholder="Short description of the issue"
          style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;color:#374151;box-sizing:border-box;outline:none;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Details <span style="color:#9ca3af;font-weight:400;">(optional)</span></label>
        <textarea id="bug-description" rows="3" placeholder="Steps to reproduce, what you expected, what happened instead…"
          style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;color:#374151;resize:none;box-sizing:border-box;outline:none;"></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button id="bug-submit"
          style="background:#111;color:white;border:none;border-radius:6px;padding:8px 18px;font-size:12px;font-weight:600;cursor:pointer;">
          Submit report
        </button>
        <span id="bug-submit-msg" style="font-size:12px;color:#6b7280;"></span>
      </div>
    </div>`;

  el.querySelector('#bug-submit').addEventListener('click', async () => {
    const title = el.querySelector('#bug-title').value.trim();
    const description = el.querySelector('#bug-description').value.trim();
    const msg = el.querySelector('#bug-submit-msg');
    if (!title) { msg.textContent = 'Title is required.'; msg.style.color = '#ef4444'; return; }

    const btn = el.querySelector('#bug-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    msg.textContent = '';

    const { error } = await sb.from('bug_reports').insert({
      title,
      description: description || null,
      reporter_id: state.user.id,
      reporter_name: state.userProfile?.display_name || state.user.email,
    });

    btn.disabled = false;
    btn.textContent = 'Submit report';

    if (error) {
      msg.textContent = 'Error submitting — please try again.';
      msg.style.color = '#ef4444';
      return;
    }

    el.querySelector('#bug-title').value = '';
    el.querySelector('#bug-description').value = '';
    msg.style.color = '#16a34a';
    msg.textContent = 'Reported — thanks!';
    setTimeout(() => { msg.textContent = ''; }, 3000);

    await loadBugs(container);
  });
}

async function loadBugs(container) {
  const listEl = container.querySelector('#bugs-list-section');

  const { data, error } = await sb
    .from('bug_reports')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<div style="font-size:13px;color:#ef4444;padding:16px 0;">Failed to load bug reports.</div>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<div style="font-size:13px;color:#9ca3af;padding:16px 0;">No open bug reports. 🎉</div>`;
    return;
  }

  const isAdmin = state.userRole === 'admin';

  listEl.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">
      Open reports <span style="font-weight:500;color:#9ca3af;">(${data.length})</span>
    </div>
    ${data.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const resolveBtn = isAdmin
        ? `<button data-resolve="${r.id}"
             style="flex-shrink:0;font-size:11px;color:#6b7280;background:none;border:1px solid #e5e7eb;border-radius:5px;padding:3px 9px;cursor:pointer;"
             onmouseenter="this.style.borderColor='#22c55e';this.style.color='#15803d'"
             onmouseleave="this.style.borderColor='#e5e7eb';this.style.color='#6b7280'">
             Resolve
           </button>`
        : '';
      return `
        <div data-bug-id="${r.id}" style="padding:14px 0;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;color:#111;margin-bottom:3px;">${escHtml(r.title)}</div>
              ${r.description ? `<div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:4px;">${escHtml(r.description)}</div>` : ''}
              <div style="font-size:11px;color:#9ca3af;">
                ${r.reporter_name ? escHtml(r.reporter_name) + ' · ' : ''}${date}
              </div>
            </div>
            ${resolveBtn}
          </div>
        </div>`;
    }).join('')}`;

  if (isAdmin) {
    listEl.querySelectorAll('[data-resolve]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.resolve;
        btn.textContent = '…';
        btn.disabled = true;
        const { error } = await sb.from('bug_reports').update({ status: 'resolved' }).eq('id', id);
        if (error) { btn.textContent = 'Error'; return; }
        listEl.querySelector(`[data-bug-id="${id}"]`)?.remove();
        const header = listEl.querySelector('div');
        const remaining = listEl.querySelectorAll('[data-bug-id]').length;
        if (!remaining) {
          listEl.innerHTML = `<div style="font-size:13px;color:#9ca3af;padding:16px 0;">No open bug reports. 🎉</div>`;
        } else {
          header.innerHTML = `Open reports <span style="font-weight:500;color:#9ca3af;">(${remaining})</span>`;
        }
      });
    });
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
