/**
 * <chlam-globe-bg> — animated meridian-globe background for ChlamAtlas.
 *
 * Drop-in vanilla web component. No deps. Scales to any container.
 *
 *   <chlam-globe-bg></chlam-globe-bg>                              // default 'drift'
 *   <chlam-globe-bg variant="globe"></chlam-globe-bg>              // + parallels, slightly bolder
 *   <chlam-globe-bg variant="living"></chlam-globe-bg>             // meridians + drifting cells
 *
 * Attributes:
 *   variant   "drift" | "globe" | "living"   — visual preset
 *   period    seconds per full rotation (default 120)
 *   tint      base background color (default #0f452f)
 *   stroke    line color (default rgba(255,255,255,0.85))
 *   intensity 0–1 multiplier on line opacity (overrides preset)
 *
 * Hand-off notes:
 *   - Auto-pauses when off-screen (IntersectionObserver) and on prefers-reduced-motion.
 *   - Pure SVG, one rAF loop, ~24 paths. Smooth on low-end mobile.
 *   - Component is `position: absolute; inset: 0;` by default — give the parent
 *     `position: relative` (or anything non-static) and put your hero content
 *     on top with a higher z-index.
 */
(() => {
  if (customElements.get('chlam-globe-bg')) return;

  // Inject scoped stylesheet once.
  const STYLE_ID = '__chlam-globe-bg-style';
  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      chlam-globe-bg {
        display: block;
        position: absolute;
        inset: 0;
        overflow: hidden;
        isolation: isolate;
        pointer-events: none;
      }
      chlam-globe-bg > svg.cgb-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }
      chlam-globe-bg .cgb-meridian,
      chlam-globe-bg .cgb-parallel {
        fill: none;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      chlam-globe-bg .cgb-vignette {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  class ChlamGlobeBg extends HTMLElement {
    static get observedAttributes() {
      return ['variant', 'period', 'tint', 'stroke', 'intensity'];
    }

    constructor() {
      super();
      this._t0 = performance.now();
      this._pausedAt = null;
      this._raf = null;
      this._draw = this._draw.bind(this);
    }

    connectedCallback() {
      ensureStylesheet();
      this._render();
      this._reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) this._play();
        else this._pause();
      });
      this._io.observe(this);
      if (this._reduced) this._tick(0);
    }

    disconnectedCallback() {
      this._pause();
      this._io && this._io.disconnect();
    }

    attributeChangedCallback(_n, oldV, newV) {
      if (oldV === newV) return;
      if (this.isConnected) this._render();
    }

    _play() {
      if (this._raf || this._reduced) return;
      if (this._pausedAt) {
        this._t0 += performance.now() - this._pausedAt;
        this._pausedAt = null;
      }
      this._raf = requestAnimationFrame(this._draw);
    }

    _pause() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      if (!this._pausedAt) this._pausedAt = performance.now();
    }

    _draw(now) {
      this._tick((now - this._t0) / 1000);
      this._raf = requestAnimationFrame(this._draw);
    }

    _render() {
      const variant = this.getAttribute('variant') || 'drift';
      const period = parseFloat(this.getAttribute('period')) || 120;
      const tint = this.getAttribute('tint') || '#0f452f';
      const stroke = this.getAttribute('stroke') || 'rgba(255,255,255,0.85)';
      const intensityAttr = parseFloat(this.getAttribute('intensity'));

      const cfg = {
        drift:  { N: 28, parallels: [],                          cells: 0, baseOp: 0.085 },
        globe:  { N: 24, parallels: [-0.32,-0.16, 0, 0.16, 0.32], cells: 0, baseOp: 0.11  },
        living: { N: 28, parallels: [-0.2, 0.2],                  cells: 6, baseOp: 0.085 },
      }[variant] || { N: 28, parallels: [], cells: 0, baseOp: 0.085 };

      const op = isFinite(intensityAttr) ? intensityAttr : cfg.baseOp;

      // geometry
      this._cx = 800;
      this._cy = 300;
      this._R = 1200;
      this._latRange = 0.42;
      this._segs = 14;
      this._N = cfg.N;
      this._period = period;
      this._opBase = op;

      this.style.background = tint;
      this.innerHTML = `
        <svg class="cgb-svg" viewBox="0 0 1600 600"
             preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g class="cgb-parallels"></g>
          <g class="cgb-meridians"></g>
          <g class="cgb-cells"></g>
        </svg>
        <div class="cgb-vignette"
             style="background: radial-gradient(120% 140% at 50% 50%, transparent 55%, ${tint} 96%);"></div>
      `;

      const svgNS = 'http://www.w3.org/2000/svg';
      const mg = this.querySelector('.cgb-meridians');
      this._meridianEls = [];
      for (let i = 0; i < this._N; i++) {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('class', 'cgb-meridian');
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', '1.25');
        mg.appendChild(p);
        this._meridianEls.push(p);
      }

      const pg = this.querySelector('.cgb-parallels');
      for (const lat of cfg.parallels) {
        const y = this._cy + this._R * Math.sin(lat);
        const half = this._R * Math.cos(lat);
        const ln = document.createElementNS(svgNS, 'line');
        ln.setAttribute('class', 'cgb-parallel');
        ln.setAttribute('x1', this._cx - half);
        ln.setAttribute('x2', this._cx + half);
        ln.setAttribute('y1', y);
        ln.setAttribute('y2', y);
        ln.setAttribute('stroke', stroke);
        ln.setAttribute('stroke-width', '1');
        ln.setAttribute('opacity', op * 0.7);
        pg.appendChild(ln);
      }

      this._cells = [];
      const cg = this.querySelector('.cgb-cells');
      const rng = mulberry32(0xC4A7);
      for (let i = 0; i < cfg.cells; i++) {
        const lat = (rng() - 0.5) * (this._latRange * 1.6);
        const lon = rng() * Math.PI * 2;
        const r = 7 + rng() * 9;
        const ring = document.createElementNS(svgNS, 'circle');
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', stroke);
        ring.setAttribute('stroke-width', '1.1');
        ring.setAttribute('r', r * 1.55);
        cg.appendChild(ring);
        const core = document.createElementNS(svgNS, 'circle');
        core.setAttribute('fill', stroke);
        core.setAttribute('r', r * 0.55);
        cg.appendChild(core);
        this._cells.push({ lat, lon, r, ring, core });
      }
    }

    _tick(t) {
      const phase = (t / this._period) * Math.PI * 2;
      const { _cx: cx, _cy: cy, _R: R, _latRange: latRange, _segs: segs, _opBase: baseOp } = this;
      for (let i = 0; i < this._N; i++) {
        const lam = (i / this._N) * Math.PI * 2 + phase;
        const cosL = Math.cos(lam);
        const sinL = Math.sin(lam);
        const el = this._meridianEls[i];
        if (cosL < -0.05) {
          el.setAttribute('d', '');
          continue;
        }
        let d = '';
        for (let j = 0; j <= segs; j++) {
          const lat = -latRange + (2 * latRange) * (j / segs);
          const cl = Math.cos(lat);
          const x = cx + R * cl * sinL;
          const y = cy + R * Math.sin(lat);
          d += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
        }
        el.setAttribute('d', d);
        const limbFade = Math.min(1, (cosL + 0.05) * 2.0);
        el.setAttribute('opacity', (baseOp * limbFade).toFixed(3));
      }
      if (this._cells.length) {
        for (const c of this._cells) {
          const lam = c.lon + phase;
          const cl = Math.cos(c.lat);
          const z = R * cl * Math.cos(lam);
          const x = cx + R * cl * Math.sin(lam);
          const y = cy + R * Math.sin(c.lat);
          c.core.setAttribute('cx', x);
          c.core.setAttribute('cy', y);
          c.ring.setAttribute('cx', x);
          c.ring.setAttribute('cy', y);
          const breathe = 1 + 0.06 * Math.sin(t * 0.6 + c.lon * 3);
          c.ring.setAttribute('r', (c.r * 1.55 * breathe).toFixed(2));
          const fade = Math.max(0, Math.min(1, (z / R) * 2.5));
          c.core.setAttribute('opacity', (fade * 0.65).toFixed(2));
          c.ring.setAttribute('opacity', (fade * 0.55).toFixed(2));
        }
      }
    }
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  customElements.define('chlam-globe-bg', ChlamGlobeBg);
})();
