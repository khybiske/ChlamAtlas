// ChlamAtlas — Home tab
import { sb } from '../app.js';

export async function renderHome(container) {
  container.innerHTML = `
    <!-- Banner -->
    <div class="relative overflow-hidden rounded-2xl mt-5 mb-6" style="background:linear-gradient(135deg,#1a3a5c 0%,#2563a8 100%);">
      <div class="px-6 py-10 sm:px-10 sm:py-14 text-white">
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight mb-2">ChlamAtlas</h1>
        <p class="text-blue-200 text-sm sm:text-base max-w-md leading-relaxed">
          An integrated genomic, proteomic, and mutant resource for the
          <em>Chlamydia</em> research community.
        </p>
        <p class="mt-3 text-blue-300 text-xs">Hybiske Lab · University of Washington</p>
      </div>
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 gap-3 mb-8" id="stats-row">
      ${[0,1,2].map(() => `<div class="skeleton h-20 rounded-2xl"></div>`).join('')}
    </div>

    <!-- About -->
    <div class="text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-6">
      <p>
        ChlamAtlas consolidates genomic annotations, AlphaFold structural predictions,
        mutant phenotypes, and multi-lab pipeline tracking for <em>C. trachomatis</em>
        D/UW-3, L2/434, and <em>C. muridarum</em> Nigg — replacing fragmented spreadsheets
        and supplemental data files with a single, community-accessible resource.
      </p>
      <p class="mt-3 text-xs text-gray-400">
        Unpublished mutant data is visible to authenticated lab members only.
        Built by the Hybiske Lab on open infrastructure.
      </p>
    </div>
  `;

  // Stats
  const [geneRes, mutantRes] = await Promise.all([
    sb.from('genes').select('id', { count: 'exact', head: true }),
    sb.from('mutants').select('id', { count: 'exact', head: true }),
  ]);

  container.querySelector('#stats-row').innerHTML = [
    { label: 'Genes',   value: geneRes.count?.toLocaleString()   ?? '—', emoji: '🧬' },
    { label: 'Mutants', value: mutantRes.count?.toLocaleString() ?? '—', emoji: '🔬' },
    { label: 'Strains', value: '3', emoji: '🦠' },
  ].map(s => `
    <div class="flex flex-col items-center justify-center py-5 bg-white border border-gray-100 rounded-2xl shadow-sm gap-1">
      <span class="text-2xl">${s.emoji}</span>
      <span class="text-xl font-bold text-gray-900">${s.value}</span>
      <span class="text-xs text-gray-400">${s.label}</span>
    </div>`).join('');
}
