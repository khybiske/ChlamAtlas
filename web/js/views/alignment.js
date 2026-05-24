// ChlamAtlas — Sequence Alignment tool

export function renderAlignment(container) {
  container.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:700;color:#0f4530;margin-bottom:6px;">
        Sequence Alignment
      </h1>
      <p style="color:#64748b;font-size:13px;">
        Align orthologous or arbitrary Chlamydia gene sequences using Clustal Omega.
      </p>
    </div>
  `;
}
