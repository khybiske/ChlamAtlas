// ChlamAtlas — Surveillance tab

// ─── Module-level state ────────────────────────────────────
let survData = null;          // loaded once, cached
let chartInstance = null;
let activeMetric = 'rate';    // 'rate' | 'cases'
let activeSeries = new Set(['us:female', 'us:male']);

// ─── Series configuration ──────────────────────────────────
const SERIES_CFG = {
  'us:female':  { label: '🇺🇸 US — Women',  color: '#e85d4a', dash: []    },
  'us:male':    { label: '🇺🇸 US — Men',    color: '#f4a89a', dash: [6,3] },
  'uk:female':  { label: '🇬🇧 UK — Women',  color: '#2563eb', dash: []    },
  'uk:male':    { label: '🇬🇧 UK — Men',    color: '#93c5fd', dash: [6,3] },
  'aus:female': { label: '🇦🇺 AUS — Women', color: '#d97706', dash: []    },
  'aus:male':   { label: '🇦🇺 AUS — Men',   color: '#fbbf24', dash: [6,3] },
  'nz:female':  { label: '🇳🇿 NZ — Women',  color: '#059669', dash: []    },
  'nz:male':    { label: '🇳🇿 NZ — Men',    color: '#6ee7b7', dash: [6,3] },
  'can:female': { label: '🇨🇦 CAN — Women', color: '#7c3aed', dash: []    },
  'can:male':   { label: '🇨🇦 CAN — Men',   color: '#c4b5fd', dash: [6,3] },
  'eu:female':  { label: '🇪🇺 EU — Women',  color: '#0891b2', dash: []    },
  'eu:male':    { label: '🇪🇺 EU — Men',    color: '#67e8f9', dash: [6,3] },
};

// ─── COVID annotation plugin ───────────────────────────────
const covidPlugin = {
  id: 'covidLine',
  afterDraw(chart) {
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;
    const xPos = xScale.getPixelForValue('2020');
    if (xPos == null || isNaN(xPos)) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1.5;
    ctx.moveTo(xPos, yScale.top);
    ctx.lineTo(xPos, yScale.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label — rotated, above midpoint
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px system-ui, sans-serif';
    const midY = yScale.top + (yScale.bottom - yScale.top) * 0.18;
    ctx.save();
    ctx.translate(xPos - 12, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('COVID-19', 0, 0);
    ctx.restore();
    ctx.restore();
  },
};

// ─── Data helpers ──────────────────────────────────────────
async function loadData() {
  if (survData) return survData;
  const res = await fetch('/web/data/ct_surveillance.json');
  survData = await res.json();
  return survData;
}

function allYears(data) {
  const set = new Set();
  Object.values(data.regions).forEach(r => r.data.forEach(d => set.add(d.year)));
  return Array.from(set).sort((a, b) => a - b).map(String);
}

function buildDatasets(data) {
  const years = allYears(data);
  return Array.from(activeSeries).map(key => {
    const [regionKey, sex] = key.split(':');
    const region = data.regions[regionKey];
    const yearMap = {};
    region.data.forEach(d => { yearMap[String(d.year)] = d[sex]; });
    const points = years.map(y => {
      const pt = yearMap[y];
      if (!pt) return null;
      if (activeMetric === 'rate') return pt.rate ?? null;
      return pt.cases;
    });
    const cfg = SERIES_CFG[key];
    return {
      label: cfg.label,
      data: points,
      borderColor: cfg.color,
      backgroundColor: cfg.color + '18',
      borderDash: cfg.dash,
      borderWidth: 2.5,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      spanGaps: false,
    };
  });
}

// ─── Chart management ──────────────────────────────────────
function initChart(canvas, data) {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const years = allYears(data);
  chartInstance = new Chart(canvas, {
    type: 'line',
    plugins: [covidPlugin],
    data: {
      labels: years,
      datasets: buildDatasets(data),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.parsed.y === null) return null;
              const val = activeMetric === 'rate'
                ? ctx.parsed.y.toFixed(1) + ' per 100k'
                : ctx.parsed.y.toLocaleString() + ' cases';
              return `${ctx.dataset.label}: ${val}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#f3f4f6' },
          ticks: { maxTicksLimit: 10, font: { size: 11 } },
        },
        y: {
          grid: { color: '#f3f4f6' },
          beginAtZero: false,
          ticks: {
            font: { size: 11 },
            callback(val) {
              return activeMetric === 'rate'
                ? val.toFixed(0)
                : val >= 1000000 ? (val / 1000000).toFixed(1) + 'M'
                : val >= 1000 ? (val / 1000).toFixed(0) + 'k'
                : val;
            },
          },
          title: {
            display: true,
            text: activeMetric === 'rate' ? 'Cases per 100,000 population' : 'Reported cases',
            font: { size: 11 },
            color: '#6b7280',
          },
        },
      },
    },
  });
}

function refreshChart(data) {
  if (!chartInstance) return;
  const years = allYears(data);
  chartInstance.data.labels = years;
  chartInstance.data.datasets = buildDatasets(data);
  chartInstance.options.scales.y.title.text =
    activeMetric === 'rate' ? 'Cases per 100,000 population' : 'Reported cases';
  chartInstance.update();
}

// ─── Grid rendering ────────────────────────────────────────
function renderGrid(container, data) {
  const regions = Object.entries(data.regions);
  const rows = regions.map(([key, region]) => {
    const cells = ['male', 'female'].map(sex => {
      const seriesKey = `${key}:${sex}`;
      const active = activeSeries.has(seriesKey);
      const color = SERIES_CFG[seriesKey]?.color ?? '#ccc';
      const label = sex === 'female' ? 'Women' : 'Men';
      const ariaLabel = `${region.label} ${label}`;
      return `<button
        class="surv-cell ${active ? 'surv-cell--on' : ''}"
        data-series="${seriesKey}"
        aria-pressed="${active}"
        aria-label="${ariaLabel}"
        style="${active ? `--cell-color:${color}` : ''}"
      ></button>`;
    });
    return `<div class="surv-row">
      <span class="surv-region-label">${region.flag ?? ''} ${region.label}</span>
      <div class="surv-cells">${cells.join('')}</div>
    </div>`;
  });

  container.innerHTML = `
    <div class="surv-grid-wrap">
      <div class="surv-grid-header">
        <span class="surv-region-label"></span>
        <div class="surv-cells">
          <span class="surv-col-label">Men</span>
          <span class="surv-col-label">Women</span>
        </div>
      </div>
      ${rows.join('')}
    </div>`;

  container.querySelectorAll('.surv-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.series;
      if (activeSeries.has(key)) activeSeries.delete(key);
      else activeSeries.add(key);
      renderGrid(container, data);
      refreshChart(data);
      renderSources(
        document.getElementById('surv-sources'),
        data
      );
    });
  });
}

// ─── Source attribution ────────────────────────────────────
function renderSources(el, data) {
  if (!el) return;
  const activeRegions = new Set(
    Array.from(activeSeries).map(k => k.split(':')[0])
  );
  const lines = Object.entries(data.regions)
    .filter(([key]) => activeRegions.has(key))
    .map(([, region]) => {
      const note = region.geo_note ? ` <span class="surv-source-note">(${region.geo_note})</span>` : '';
      return `<span>${region.flag ?? ''} ${region.label}: <a href="${region.source_url}" target="_blank" rel="noopener" class="surv-source-link">${region.source}</a>${note}</span>`;
    });
  el.innerHTML = lines.join('');
}

// ─── Metric toggle ─────────────────────────────────────────
function renderMetricToggle(container, data) {
  container.innerHTML = `
    <div class="surv-metric-toggle" role="group" aria-label="Metric">
      <button class="surv-metric-btn ${activeMetric === 'rate' ? 'surv-metric-btn--on' : ''}" data-metric="rate">Rate per 100k</button>
      <button class="surv-metric-btn ${activeMetric === 'cases' ? 'surv-metric-btn--on' : ''}" data-metric="cases">Case count</button>
    </div>`;
  container.querySelectorAll('.surv-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeMetric = btn.dataset.metric;
      renderMetricToggle(container, data);
      refreshChart(data);
      const note = document.getElementById('surv-cases-note');
      if (note) note.style.display = activeMetric === 'cases' ? 'block' : 'none';
    });
  });
}

// ─── Entry point ───────────────────────────────────────────
export async function renderSurveillance(container) {
  container.innerHTML = `<p class="text-gray-400 text-sm py-8 text-center">Loading…</p>`;
  const data = await loadData();

  // Add flag field to regions if missing (convenience)
  const FLAGS = { us: '🇺🇸', uk: '🇬🇧', aus: '🇦🇺', nz: '🇳🇿', can: '🇨🇦', eu: '🇪🇺' };
  Object.entries(data.regions).forEach(([k, r]) => { r.flag = FLAGS[k] ?? ''; });

  container.innerHTML = `
    <div class="surv-page">
      <div class="surv-header">
        <div>
          <h2 class="surv-title">Chlamydia Surveillance</h2>
          <p class="surv-subtitle">Reported <em>C. trachomatis</em> diagnoses by region and sex</p>
        </div>
        <div id="surv-metric-wrap"></div>
      </div>

      <div class="surv-chart-wrap">
        <canvas id="surv-canvas" aria-label="CT surveillance line chart" role="img"></canvas>
      </div>

      <p id="surv-cases-note" class="surv-cases-note" style="display:none;">
        Case counts are not population-adjusted and should not be compared across regions of different sizes.
      </p>

      <div class="surv-section-label">Series</div>
      <div id="surv-grid"></div>

      <div id="surv-sources" class="surv-sources"></div>
    </div>`;

  const canvas = container.querySelector('#surv-canvas');
  initChart(canvas, data);
  renderMetricToggle(container.querySelector('#surv-metric-wrap'), data);
  renderGrid(container.querySelector('#surv-grid'), data);
  renderSources(container.querySelector('#surv-sources'), data);
}
