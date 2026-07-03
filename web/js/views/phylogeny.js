// ChlamAtlas — Phylogeny tab
//
// Embeds a self-vendored, static build of Nextstrain's auspice.us viewer
// (web/vendor/auspice-us/), auto-loading a real 10-genome C. trachomatis
// tree from web/data/phylogeny_ct.json. The dataset never leaves our own
// domain — see docs/superpowers/specs/2026-07-03-phylogeny-real-tree-design.md
// for why (no data sent to any Nextstrain-owned server). Still a small demo
// subset, not the full lab collection — see docs/PHYLOGENY_PLAN.md for the
// production feature scope.

export async function renderPhylogeny(container) {
  container.innerHTML = `
    <div class="phylo-page">
      <div class="phylo-header">
        <div>
          <h2 class="phylo-title">Phylogeny</h2>
          <p class="phylo-subtitle">10 real C. trachomatis genomes (Seattle strains) — a demo subset of the lab's full collection</p>
        </div>
      </div>
      <div class="phylo-frame-wrap">
        <iframe
          class="phylo-frame"
          src="/web/vendor/auspice-us/index.html"
          title="ChlamAtlas Phylogeny — Chlamydia trachomatis demo tree"
          loading="lazy"
        ></iframe>
      </div>
    </div>`;
}
