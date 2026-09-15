// ChlamAtlas — Change history panel (shared by gene + mutant detail pages)
import { sb, state } from '../client.js?v=83';

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at']);

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(isoString).toLocaleDateString();
}

function diffFields(oldData, newData) {
  if (!oldData) {
    return Object.entries(newData ?? {})
      .filter(([k, v]) => v !== null && !SKIP_FIELDS.has(k))
      .map(([field, value]) => ({ field, old: null, new: value }));
  }
  if (!newData) {
    return Object.entries(oldData ?? {})
      .filter(([k, v]) => v !== null && !SKIP_FIELDS.has(k))
      .map(([field, value]) => ({ field, old: value, new: null }));
  }
  const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];
  fields.forEach(field => {
    if (SKIP_FIELDS.has(field)) return;
    const a = oldData[field];
    const b = newData[field];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push({ field, old: a, new: b });
  });
  return changed;
}

function formatValue(v) {
  if (v === null || v === undefined) return '<span style="color:#d1d5db;font-style:italic;">empty</span>';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return esc(v.join(', '));
  return esc(String(v));
}

const _userCache = new Map();

async function resolveUsers(ids) {
  const unresolved = [...new Set(ids)].filter(id => id && !_userCache.has(id));
  if (!unresolved.length) return;
  const { data } = await sb.from('users').select('id, display_name, lab_affiliation').in('id', unresolved);
  (data ?? []).forEach(u => _userCache.set(u.id, u));
}

export async function openHistoryPanel(entityType, entityId) {
  document.getElementById('history-panel-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'history-panel-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2100;' +
    'display:flex;align-items:center;justify-content:center;padding:16px;';

  function closeModal() {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  const panel = document.createElement('div');
  panel.style.cssText =
    'background:white;border-radius:12px;max-width:520px;width:100%;max-height:80vh;' +
    'overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,0.25);';
  panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;">
      <div style="font-size:14px;font-weight:700;color:#111;">History</div>
      <button id="history-close-btn" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;line-height:1;">✕</button>
    </div>
    <div id="history-list" style="padding:8px 0;">
      <div style="padding:24px;text-align:center;font-size:12px;color:#9ca3af;">Loading…</div>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  panel.querySelector('#history-close-btn').addEventListener('click', closeModal);

  const listEl = panel.querySelector('#history-list');
  const isAdmin = state.userRole === 'admin';

  const { data: rows, error } = await sb
    .from('change_log')
    .select('id, action, old_data, new_data, changed_by, changed_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('changed_at', { ascending: false });

  if (!listEl.isConnected) return; // panel closed while awaiting

  if (error) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;font-size:12px;color:#ef4444;">Failed to load history: ${esc(error.message)}</div>`;
    return;
  }
  if (!rows?.length) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;font-size:12px;color:#9ca3af;">No history recorded yet.</div>`;
    return;
  }

  await resolveUsers(rows.map(r => r.changed_by));
  if (!listEl.isConnected) return;

  const ACTION_LABELS = { insert: 'Created', update: 'Updated', delete: 'Deleted' };

  listEl.innerHTML = rows.map(row => {
    const user  = row.changed_by ? _userCache.get(row.changed_by) : null;
    const who   = user?.display_name || (row.changed_by ? 'Unknown user' : 'System / import');
    const diffs = diffFields(row.old_data, row.new_data);
    const actionLabel = ACTION_LABELS[row.action] ?? row.action;

    const diffHtml = diffs.length
      ? diffs.map(d => `
          <div style="font-size:11px;padding:3px 0;">
            <span style="color:#6b7280;font-weight:600;">${esc(d.field)}:</span>
            ${d.old !== null ? `<span style="color:#9ca3af;text-decoration:line-through;">${formatValue(d.old)}</span> → ` : ''}
            <span style="color:#111;">${formatValue(d.new)}</span>
          </div>`).join('')
      : `<div style="font-size:11px;color:#d1d5db;font-style:italic;">No field changes recorded</div>`;

    return `
      <div style="padding:12px 20px;border-bottom:1px solid #f7f7f7;">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px;">
          <div style="font-size:12px;font-weight:600;color:#111;">${esc(actionLabel)} by ${esc(who)}</div>
          <div style="font-size:10px;color:#bbb;flex-shrink:0;">${relativeTime(row.changed_at)}</div>
        </div>
        ${diffHtml}
        ${isAdmin && row.old_data ? `
          <button class="history-revert-btn" data-log-id="${row.id}"
            style="margin-top:6px;font-size:10px;font-weight:600;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;cursor:pointer;">
            Revert this change
          </button>` : ''}
      </div>`;
  }).join('');

  listEl.querySelectorAll('.history-revert-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Revert this change? This will restore the previous values and create a new history entry.')) return;
      btn.disabled = true;
      btn.textContent = 'Reverting…';
      const { error: rbErr } = await sb.rpc('rollback_change', { log_id: btn.dataset.logId });
      if (rbErr) {
        alert(`Revert failed: ${rbErr.message}`);
        btn.disabled = false;
        btn.textContent = 'Revert this change';
        return;
      }
      closeModal();
      openHistoryPanel(entityType, entityId);
    });
  });
}
