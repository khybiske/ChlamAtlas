// ChlamAtlas — Phylogeny tab (proof of concept)
//
// POC ONLY: embeds Nextstrain's own public hosted Auspice instance via
// iframe, showing their canned zika tutorial dataset. No real lab genomic
// data. See docs/PHYLOGENY_PLAN.md for the real feature scope and
// docs/superpowers/specs/2026-07-03-phylogeny-poc-design.md for why this
// approach (Auspice has no droppable static/CDN client bundle).

export async function renderPhylogeny(container) {
  container.innerHTML = `
    <div class="phylo-page">
      <div class="phylo-header">
        <div>
          <h2 class="phylo-title">Phylogeny</h2>
          <p class="phylo-subtitle">Proof of concept — showing Nextstrain's public sample tree, not real ChlamAtlas genome data</p>
        </div>
      </div>
      <div class="phylo-frame-wrap">
        <iframe
          class="phylo-frame"
          src="https://nextstrain.org/zika?onlyPanels=true"
          title="Nextstrain Auspice sample tree (zika demo dataset)"
          loading="lazy"
        ></iframe>
      </div>
    </div>`;
}
