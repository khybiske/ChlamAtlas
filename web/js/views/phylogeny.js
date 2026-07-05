// ChlamAtlas — Phylogeny tab(s)
//
// Embeds a self-vendored, static build of Nextstrain's auspice.us viewer
// (web/vendor/auspice-us/). The dataset never leaves our own domain — see
// docs/superpowers/specs/2026-07-03-phylogeny-real-tree-design.md for why
// (no data sent to any Nextstrain-owned server). Two datasets share one
// vendored build, selected via the iframe's own ?dataset= query string
// (see tools/auspice-us-vendor/auspice_client_customisation/splash.js):
//   - #/phylogeny         -> web/data/phylogeny_ct.json (10 genomes, public nav)
//   - #/phylogeny-preview -> web/data/phylogeny_ct_v2.json (21 genomes, unlisted)
// See docs/superpowers/specs/2026-07-04-phylogeny-expansion-design.md for
// the expanded dataset's sourcing. Still demo subsets, not the full lab
// collection — see docs/PHYLOGENY_PLAN.md for the production feature scope.

function renderPhylogenyView(container, { title, subtitle, dataset, iframeTitle }) {
  const src = dataset
    ? `/web/vendor/auspice-us/index.html?dataset=${encodeURIComponent(dataset)}`
    : '/web/vendor/auspice-us/index.html';
  container.innerHTML = `
    <div class="phylo-page">
      <div class="phylo-header">
        <div>
          <h2 class="phylo-title">${title}</h2>
          <p class="phylo-subtitle">${subtitle}</p>
        </div>
      </div>
      <div class="phylo-frame-wrap">
        <iframe
          class="phylo-frame"
          src="${src}"
          title="${iframeTitle}"
          loading="lazy"
        ></iframe>
      </div>
    </div>`;
}

export async function renderPhylogeny(container) {
  renderPhylogenyView(container, {
    title: 'Phylogeny',
    subtitle: "10 real C. trachomatis genomes (Seattle strains) — a demo subset of the lab's full collection",
    dataset: null,
    iframeTitle: 'ChlamAtlas Phylogeny — Chlamydia trachomatis demo tree',
  });
}

export async function renderPhylogenyPreview(container) {
  renderPhylogenyView(container, {
    title: 'Phylogeny (preview)',
    subtitle: '21 real C. trachomatis genomes spanning Ocular, Male rectal, LGV, VO clade, and Non-Prevalent urogenital lineages — unlisted preview, not linked from navigation',
    dataset: 'phylogeny_ct_v2.json',
    iframeTitle: 'ChlamAtlas Phylogeny Preview — expanded 21-genome tree',
  });
}
