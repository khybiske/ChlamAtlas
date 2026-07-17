// ChlamAtlas — Feature tour (account dropdown > Feature tour, plus a guest CTA on Home)
import { state } from '../client.js?v=83';

const CARDS = [
  {
    tier: 'public', frame: 'phone',
    img: '/web/images/preview/genomes-list.png',
    alt: 'Genome browser with searchable, filterable gene list and AlphaFold thumbnails',
    title: 'Search every genome',
    body: 'Filter by strain, locus tag, characterization, or protein family — across CT/D, CT/L2, CM, and Cpn.',
  },
  {
    tier: 'public', frame: 'phone',
    img: '/web/images/preview/orthologs.png',
    alt: 'Gene detail page showing cross-strain ortholog shortcuts',
    title: 'Jump strains mid-thought',
    body: 'Every gene links straight to its ortholog in the other strains — tap to compare CT/L2 against CT/D or CM.',
  },
  {
    tier: 'public', frame: 'panel',
    img: '/web/images/preview/expression-context.png',
    alt: 'Genomic neighborhood map and EB/RB proteomic enrichment bars for hctA',
    title: "Where a gene sits, how it's expressed",
    body: 'Genomic neighborhood, transcriptomics, and EB/RB spectral-count enrichment, side by side on every gene.',
  },
  {
    tier: 'public', frame: 'phone',
    img: '/web/images/preview/structures.png',
    alt: 'Interactive structure viewer with Crystal, AlphaFold 3, and AlphaFold 2 tabs',
    imgStyle: 'object-position: left top;',
    title: 'Crystal, AF3, or AF2 — your call',
    body: 'Every solved or predicted structure loads in an interactive viewer, with the source model one tap away.',
  },
  {
    tier: 'public', frame: 'panel',
    img: '/web/images/preview/structure-alignment.png',
    alt: 'Structure alignment tool superposing IncA from CT-D and C. muridarum',
    title: 'Superpose two structures',
    body: 'Load any pair of AlphaFold or crystal models and align them in the browser — no local PyMOL required.',
  },
  {
    tier: 'public', frame: 'panel',
    img: '/web/images/preview/ppi.png',
    alt: 'Protein interactions panel showing experimental PPI evidence for IncA',
    title: 'Who talks to whom',
    body: 'Curated interaction evidence per protein, scored and sourced — AP-MS, Y2H, and literature co-IP.',
  },
  {
    tier: 'public', frame: 'panel',
    img: '/web/images/preview/mutants-chimera.png',
    alt: 'Lucky 17 chimera detail showing the recombined genomic region and gene exchange table',
    title: 'Chimeras, mapped gene by gene',
    body: "Every Lucky 17 and chimera recombinant shows exactly which CM segment replaced the L2 backbone. Star the ones you're running.",
  },
  {
    tier: 'lab', frame: 'wide',
    img: '/web/images/preview/pipeline.png',
    alt: 'Pipeline dashboard showing priority mutants and multi-lab stage strips',
    title: 'One dashboard, three labs',
    body: 'Hefty, Hybiske, and Rockey stages tracked per mutant — genotyping to in vivo, plus which lab has stocks on hand.',
  },
  {
    tier: 'account', frame: 'phone',
    img: '/web/images/preview/curation.png',
    alt: 'Edit Gene dialog showing an editable annotation form',
    imgStyle: 'object-position: left top;',
    title: 'Anyone can fix the record',
    bodyLocked: '<strong>Requires a free account</strong> (no lab affiliation needed). Spot a stale annotation or a missing note? Sign up and edit it yourself — no ticket, no spreadsheet.',
    bodyUnlocked: 'Spot a stale annotation or a missing note? Edit it yourself — no ticket, no spreadsheet.',
    lockedLabel: 'Free account required',
    lockedAction: true,
  },
  {
    tier: 'public', frame: 'panel',
    img: '/web/images/preview/phylogeny.png',
    alt: 'Nextstrain phylogenetic tree of 21 real C. trachomatis genomes colored by serovar',
    tag: 'Coming soon',
    title: 'The whole family tree',
    body: 'A Nextstrain-powered phylogeny across genotyped isolates, built on real assemblies — clade by clade.',
  },
];

export async function renderFeatures(container) {
  const hasAccount = !!state.user;
  const isLab = ['lab_member', 'admin'].includes(state.userRole);

  // Pipeline (tier 'lab') is only ever rendered for lab_member/admin — not just
  // hidden from anonymous visitors, but from signed-in "community" accounts too.
  const visibleCards = CARDS.filter(c => c.tier !== 'lab' || isLab);

  const cardHtml = visibleCards.map(c => {
    const locked = c.tier === 'account' ? !hasAccount : false;
    const body = c.tier === 'account' ? (locked ? c.bodyLocked : c.bodyUnlocked) : c.body;
    const lockOverlay = locked ? `
      <div class="lock-overlay">
        <div class="lock-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f4530" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
        <p>${c.lockedLabel}</p>
        ${c.lockedAction ? `<button class="feat-signup-inline" data-signup>Create free account</button>` : ''}
      </div>` : '';
    return `
    <div class="feat-card feat-${c.frame}">
      <div class="feat-frame ${c.frame === 'wide' ? 'feat-contain' : ''} ${locked ? 'feat-locked' : ''}">
        ${c.tag ? `<div class="feat-tag feat-tag-soon">${c.tag}</div>` : ''}
        <img src="${c.img}" alt="${c.alt}" ${c.imgStyle ? `style="${c.imgStyle}"` : ''} />
        ${lockOverlay}
      </div>
      <div class="feat-caption">
        <h3>${c.title}</h3>
        <p>${body}</p>
      </div>
    </div>`;
  }).join('');

  const footer = hasAccount
    ? {
        eyebrow: 'That’s the tour',
        heading: 'Go put it to work',
        copy: 'Jump back in and start browsing.',
        primaryLabel: 'Browse genomes →',
        primaryTab: 'genomes',
      }
    : {
        eyebrow: 'Ready to dig in?',
        heading: 'Make it yours',
        copy: 'Create a free account to save favorites, curate annotations, and (with lab access) see the full pipeline.',
        primaryLabel: 'Create a free account →',
        primarySignup: true,
      };

  container.innerHTML = `
    <style>
      .feat-wrap{ font-family:'DM Sans',-apple-system,sans-serif; color:#14201a; background:#fff; }
      .feat-hero{ max-width:720px; margin:0 auto; padding:44px 24px 8px; text-align:center; }
      .feat-eyebrow{ font-family:'DM Mono',monospace; font-size:11.5px; letter-spacing:0.14em; text-transform:uppercase; color:#1a6b4a; }
      .feat-hero h1{ font-family:'Cormorant Garamond',Georgia,serif; font-weight:700; font-size:clamp(30px,5.5vw,46px); line-height:1.05; margin:12px 0 12px; text-wrap:balance; }
      .feat-hero h1 em{ font-style:italic; color:#1a6b4a; }
      .feat-hero p{ font-size:16px; line-height:1.6; color:#4b5f56; max-width:50ch; margin:0 auto; }

      .feat-gallery{ display:flex; align-items:flex-end; gap:22px; overflow-x:auto; scroll-snap-type:x mandatory;
        padding:20px 24px 26px; -webkit-overflow-scrolling:touch; scrollbar-width:thin; scrollbar-color:#cfe0d7 transparent; }
      .feat-gallery::-webkit-scrollbar{ height:6px; }
      .feat-gallery::-webkit-scrollbar-thumb{ background:#cfe0d7; border-radius:4px; }
      .feat-gallery::before, .feat-gallery::after{ content:""; flex:0 0 2px; }

      .feat-card{ scroll-snap-align:center; flex:0 0 auto; display:flex; flex-direction:column; }
      .feat-phone{ width:232px; } .feat-panel{ width:340px; } .feat-wide{ width:400px; }

      .feat-frame{ position:relative; border-radius:16px; overflow:hidden; background:#f6f9f7; border:1px solid #e3ece6;
        box-shadow:0 24px 48px -28px rgba(15,69,48,0.28); }
      .feat-phone .feat-frame{ aspect-ratio:232/400; }
      .feat-panel .feat-frame{ aspect-ratio:340/200; }
      .feat-wide .feat-frame{ aspect-ratio:400/185; }
      .feat-frame img{ width:100%; height:100%; object-fit:cover; object-position:top; display:block; transition:filter .35s ease; }
      .feat-panel .feat-frame img{ object-position:center; }
      .feat-contain img{ object-fit:contain; padding:10px; }

      .feat-tag{ position:absolute; top:10px; right:10px; font-family:'DM Mono',monospace; font-size:9px; letter-spacing:.08em;
        text-transform:uppercase; padding:4px 9px; border-radius:100px; z-index:3; }
      .feat-tag-soon{ background:#eef4f0; border:1px solid #cfe0d7; color:#4b5f56; }

      .feat-frame.feat-locked img{ filter:blur(7px) saturate(.7) brightness(.94); }
      .lock-overlay{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:8px; text-align:center; padding:20px; background:linear-gradient(180deg, rgba(15,69,48,.06), rgba(15,69,48,.16)); z-index:2; }
      .lock-icon{ width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,.92); display:flex;
        align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(15,69,48,.25); }
      .lock-overlay p{ font-family:'DM Mono',monospace; font-size:10.5px; letter-spacing:.03em; color:#0f4530;
        background:rgba(255,255,255,.92); padding:5px 10px; border-radius:100px; margin:0; }
      .feat-signup-inline{ font-family:'DM Mono',monospace; font-size:10.5px; color:#fff; background:#0f4530; border:none;
        padding:6px 12px; border-radius:100px; cursor:pointer; }
      .feat-signup-inline:hover{ background:#1a6b4a; }

      .feat-caption{ padding:14px 2px 0; }
      .feat-caption h3{ font-family:'Cormorant Garamond',serif; font-weight:700; font-size:21px; margin:0 0 5px; line-height:1.1; }
      .feat-caption p{ font-size:12.5px; line-height:1.5; color:#4b5f56; margin:0; }

      .feat-dots{ display:flex; justify-content:center; gap:6px; padding:2px 0 8px; }
      .feat-dots span{ width:5px; height:5px; border-radius:50%; background:#cfe0d7; transition:background .3s; }
      .feat-dots span.active{ background:#1a6b4a; }

      .feat-footer{ max-width:560px; margin:8px auto 0; padding:36px 24px 56px; text-align:center; border-top:1px solid #e3ece6; }
      .feat-footer h2{ font-family:'Cormorant Garamond',serif; font-weight:700; font-size:clamp(24px,4.5vw,32px); margin:0 0 10px; }
      .feat-footer p{ color:#4b5f56; font-size:14px; margin:0 0 20px; }
      .feat-cta{ display:inline-flex; align-items:center; gap:8px; font-family:'DM Mono',monospace; font-size:13px;
        color:#fff; background:#0f4530; padding:11px 22px; border-radius:100px; border:none; cursor:pointer;
        box-shadow:0 12px 24px -8px rgba(15,69,48,.45); }
      .feat-cta:hover{ background:#1a6b4a; }
    </style>

    <div class="feat-wrap">
      <div class="feat-hero">
        <div class="feat-eyebrow">Feature tour</div>
        <h1>It's <em>your</em> atlas too</h1>
        <p>Genomes, structures, mutants, and the pipeline that connects them — browse the reel below, then jump back in.</p>
      </div>

      <div class="feat-gallery" id="feat-gallery">${cardHtml}</div>
      <div class="feat-dots" id="feat-dots"></div>

      <div class="feat-footer">
        <div class="feat-eyebrow">${footer.eyebrow}</div>
        <h2>${footer.heading}</h2>
        <p>${footer.copy}</p>
        <button class="feat-cta" id="feat-footer-cta">${footer.primaryLabel}</button>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-signup]').forEach(btn => {
    btn.addEventListener('click', () => window.__showAuthModal?.('signup'));
  });

  container.querySelector('#feat-footer-cta')?.addEventListener('click', () => {
    if (footer.primarySignup) window.__showAuthModal?.('signup');
    else window.__activateTab?.(footer.primaryTab);
  });

  const gallery = container.querySelector('#feat-gallery');
  const cards = gallery.querySelectorAll('.feat-card');
  const dotsWrap = container.querySelector('#feat-dots');
  cards.forEach((_, i) => {
    const d = document.createElement('span');
    if (i === 0) d.className = 'active';
    dotsWrap.appendChild(d);
  });
  const dots = dotsWrap.querySelectorAll('span');
  let ticking = false;
  gallery.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const center = gallery.scrollLeft + gallery.clientWidth / 2;
      let closest = 0, min = Infinity;
      cards.forEach((card, i) => {
        const mid = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(mid - center);
        if (dist < min) { min = dist; closest = i; }
      });
      dots.forEach((d, i) => d.classList.toggle('active', i === closest));
      ticking = false;
    });
  });
}
