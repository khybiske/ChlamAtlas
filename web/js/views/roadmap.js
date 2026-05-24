// ChlamAtlas — What's New & Roadmap view

const CHANGELOG = [
  { version: 'v0.9.1', date: 'May 24, 2026', type: 'fix',  description: 'Search → gene nav, search → mutant nav, and mutant "View in Genomes" navigation fixed.' },
  { version: 'v0.9.0', date: 'May 22, 2026', type: 'feat', description: 'Hero meridian arcs, authoritative strain blurbs, mutant panel polish, Tools nav item, Supabase keepalive ping.' },
  { version: 'v0.8.5', date: 'May 18, 2026', type: 'fix',  description: 'Mutant hero→list star sync; mutation filter bar unique IDs; saved popover thumbnails and collection icons.' },
  { version: 'v0.8.4', date: 'May 16, 2026', type: 'fix',  description: 'Gene hero star button (capture currentTarget before await); mutant list stars via div row and event delegation.' },
  { version: 'v0.8.3', date: 'May 15, 2026', type: 'fix',  description: 'Recombination accent color added to TYPE_ACCENT; user lookup now searches display_name and email.' },
  { version: 'v0.8.0', date: 'May 13, 2026', type: 'feat', description: 'Favorites/saved collections with star buttons on gene and mutant list rows; persistent across sessions via Supabase.' },
  { version: 'v0.7.0', date: 'May 8, 2026',  type: 'feat', description: 'Mutant detail page: hero panel, phenotype sections, pipeline progress tracker, edit modal.' },
  { version: 'v0.6.0', date: 'May 3, 2026',  type: 'data', description: 'AF2 thumbnail pipeline complete — 2,528 protein structure thumbnails loaded into Supabase.' },
  { version: 'v0.5.0', date: 'Apr 20, 2026', type: 'feat', description: 'Gene detail panel: AlphaFold structure viewer (Mol*), expression charts, ortholog cross-links, localization badge.' },
  { version: 'v0.4.0', date: 'Apr 5, 2026',  type: 'feat', description: 'Genomes tab: strain → gene list with structure thumbnails, search, EB/RB expression filter.' },
];

const PLANNED_FEATURES = [
  { id: 'expression-charts',     label: 'Interactive expression charts',    description: 'T0–T5 bar charts with hover values and cross-strain ortholog toggling.' },
  { id: 'molstar-viewer',        label: 'Embedded Mol* 3D viewer',          description: 'Load mmCIF files interactively on gene detail pages instead of static thumbnails only.' },
  { id: 'ortholog-nav',          label: 'Cross-strain ortholog navigation',  description: 'Jump between CT-L2, CT-D, and CM orthologs from any gene page.' },
  { id: 'mobile-audit',          label: 'Mobile design audit',               description: 'Full review and polish of the mobile layout across all tabs.' },
  { id: 'fasta-download',        label: 'Downloadable FASTA sequences',      description: 'Per-gene and per-protein FASTA download button on detail pages.' },
  { id: 'community-annotations', label: 'Community annotations',             description: 'Let lab members submit evidence-based annotations with PubMed IDs.' },
];

const BADGE_STYLES = {
  feat: 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;',
  fix:  'background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;',
  data: 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;',
};

const VOTES_KEY = 'chlamatlas_votes';

function getVotes() {
  try { return JSON.parse(localStorage.getItem(VOTES_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveVotes(votes) {
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

export function renderRoadmap(container) {
  const votes = getVotes();

  const sorted = [...PLANNED_FEATURES].sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0));

  container.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px 48px;">

      <div style="margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
        <h1 style="font-size:22px;font-weight:800;color:#111;margin:0 0 4px;">📋 What's New & Roadmap</h1>
        <p style="font-size:13px;color:#9ca3af;margin:0;">Site updates, planned features, and suggestions</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;" id="roadmap-grid">

        <!-- Changelog -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:16px;">Changelog</div>
          ${CHANGELOG.map(entry => {
            const badge = BADGE_STYLES[entry.type] ?? BADGE_STYLES.fix;
            return `
              <div style="padding:10px 0;border-bottom:1px solid #f9fafb;">
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
                  <span style="font-size:13px;font-weight:700;color:#111;">${entry.version}</span>
                  <span style="font-size:10px;font-weight:600;border-radius:4px;padding:1px 6px;${badge}">${entry.type}</span>
                  <span style="font-size:11px;color:#9ca3af;margin-left:auto;">${entry.date}</span>
                </div>
                <p style="font-size:12px;color:#374151;margin:0;line-height:1.5;">${entry.description}</p>
              </div>`;
          }).join('')}
        </div>

        <!-- Planned features -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Planned features</div>
          <p style="font-size:12px;color:#9ca3af;margin:0 0 14px;">Vote for what you most want to see next:</p>
          <div id="feature-list">
            ${sorted.map(f => {
              const count = votes[f.id] ?? 0;
              const voted = count > 0;
              const btnStyle = voted
                ? 'background:#f0fdf4;border:1px solid #22c55e;color:#15803d;'
                : 'background:none;border:1px solid #e5e7eb;color:#6b7280;';
              return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <button data-vote="${f.id}"
                    style="flex-shrink:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:14px;${btnStyle}">
                    👍
                  </button>
                  <div style="flex:1;font-size:13px;color:#374151;font-weight:500;">${f.label}</div>
                  <span data-vote-count="${f.id}" style="font-size:12px;font-weight:600;color:${voted ? '#16a34a' : '#9ca3af'};">${count}</span>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Suggestion box -->
        <div>
          <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Suggest a feature</div>
          <p style="font-size:12px;color:#9ca3af;margin:0 0 16px;">Have an idea? Send it directly to Kevin — all suggestions are reviewed.</p>
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Your name</label>
            <input id="suggest-name" type="text" placeholder="Dr. Jane Smith"
              style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;color:#374151;box-sizing:border-box;outline:none;" />
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Suggestion</label>
            <textarea id="suggest-text" rows="5" placeholder="Describe the feature or fix you'd like to see..."
              style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;color:#374151;resize:none;box-sizing:border-box;outline:none;"></textarea>
          </div>
          <button id="suggest-submit"
            style="width:100%;background:#111;color:white;border:none;border-radius:6px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;">
            Send suggestion →
          </button>
        </div>

      </div>
    </div>

    <style>
      @media (max-width: 768px) {
        #roadmap-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
      }
    </style>
  `;

  container.querySelectorAll('[data-vote]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.vote;
      const current = getVotes();
      current[id] = (current[id] ?? 0) + 1;
      saveVotes(current);
      btn.style.cssText = `flex-shrink:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:14px;background:#f0fdf4;border:1px solid #22c55e;color:#15803d;`;
      const countEl = container.querySelector(`[data-vote-count="${id}"]`);
      if (countEl) {
        countEl.textContent = current[id];
        countEl.style.color = '#16a34a';
      }
    });
  });

  container.querySelector('#suggest-submit').addEventListener('click', () => {
    const name = container.querySelector('#suggest-name').value.trim();
    const text = container.querySelector('#suggest-text').value.trim();
    if (!text) return;
    const body = name ? `From: ${name}\n\n${text}` : text;
    window.location.href = `mailto:khybiske@gmail.com?subject=${encodeURIComponent('ChlamAtlas feature suggestion')}&body=${encodeURIComponent(body)}`;
  });
}
