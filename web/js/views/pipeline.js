// ChlamAtlas — Pipeline tab
import { sb } from '../app.js';

const STAGES = [
  { key: 'plasmid_complete',        label: 'Plasmid made',   short: 'Plasmid'    },
  { key: 'transformation_complete', label: 'Transformation', short: 'Transform'  },
  { key: 'cloning_complete',        label: 'Plaque cloning', short: 'Cloning'    },
  { key: 'genotyping_complete',     label: 'Genotyping',     short: 'Genotyping' },
  { key: 'invitro_test_complete',   label: 'In vitro',       short: 'In vitro'   },
  { key: 'invivo_test_complete',    label: 'In vivo',        short: 'In vivo'    },
];

// Stage → group label for the "Mutant progress" section
function currentStageLabel(pipe) {
  if (!pipe) return 'Unknown';
  if (pipe.invivo_test_complete)    return 'Complete';
  if (pipe.invitro_test_complete)   return 'In vivo testing';
  if (pipe.genotyping_complete)     return 'In vitro testing';
  if (pipe.cloning_complete)        return 'Genotyping';
  if (pipe.transformation_complete) return 'Plaque cloning';
  if (pipe.plasmid_complete)        return 'Transformation';
  return 'Plasmid construction';
}

export async function renderPipeline(container) {
  container.innerHTML = `
    <div class="mt-5 mb-5">
      <h2 class="text-xl font-bold text-gray-900">Pipeline</h2>
      <p class="text-sm text-gray-400 mt-0.5">Multi-lab mutant development workflow</p>
    </div>

    <!-- Workflow overview diagram -->
    <div class="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-6 overflow-x-auto">
      <div class="flex items-stretch gap-0 min-w-max">
        ${workflowStages()}
      </div>
    </div>

    <!-- Mutant progress -->
    <div class="flex items-baseline gap-2 mb-3">
      <h3 class="text-base font-bold text-gray-900">Mutant progress</h3>
    </div>
    <div id="pipeline-content">
      ${skeletonRows(8)}
    </div>
  `;

  const { data, error } = await sb
    .from('mutants')
    .select(`
      mutant_id, mutant_name, strain_id, target_genes, status, creator, is_published,
      mutant_pipeline (
        plasmid_complete, transformation_complete, cloning_complete,
        genotyping_complete, invitro_test_complete, invivo_test_complete
      )
    `)
    .eq('show_in_pipeline', true)
    .eq('is_archived', false)
    .order('mutant_id', { ascending: true });

  const content = container.querySelector('#pipeline-content');

  if (error) { content.innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`; return; }
  if (!data?.length) { content.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">No active pipeline mutants.</p>`; return; }

  // Group by current stage
  const groups = {};
  for (const m of data) {
    const pipe  = m.mutant_pipeline?.[0] ?? null;
    const stage = currentStageLabel(pipe);
    if (!groups[stage]) groups[stage] = [];
    groups[stage].push({ ...m, pipe });
  }

  // Fixed display order
  const ORDER = ['Plasmid construction','Transformation','Plaque cloning','Genotyping','In vitro testing','In vivo testing','Complete'];
  const html = ORDER
    .filter(g => groups[g])
    .map(g => `
      <div class="mb-2">
        <div class="flex items-baseline gap-2 px-1 py-2">
          <span class="font-semibold text-gray-800 text-sm">${g}</span>
          <span class="text-xs text-gray-400">${groups[g].length}</span>
        </div>
        <div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          ${groups[g].map(m => pipelineRow(m)).join('')}
        </div>
      </div>`).join('');

  content.innerHTML = html || '<p class="text-gray-400 text-sm text-center py-8">No data.</p>';

  content.querySelectorAll('.pipeline-row').forEach(row => {
    row.addEventListener('click', () => {
      window.__openMutant = row.dataset.id;
      document.querySelector('[data-tab="mutants"]').click();
    });
  });
}

function pipelineRow(m) {
  const strainEmoji = { 'CT-D': '🔵', 'CT-L2': '🟣', 'CM': '🟠' };
  const pipe = m.pipe;

  const dots = STAGES.map(s => {
    const done = pipe && pipe[s.key];
    return `<div class="pdot ${done ? 'pdot-done' : 'pdot-pending'}" title="${s.short}"></div>`;
  }).join('');

  const genes = (m.target_genes || []).slice(0, 2).join(', ');
  const moreGenes = m.target_genes?.length > 2 ? ` +${m.target_genes.length - 2}` : '';

  return `
    <div class="pipeline-row flex items-center gap-3 px-4 py-3 border-b border-gray-100
                hover:bg-gray-50 cursor-pointer transition last:border-0"
         data-id="${m.mutant_id}">
      <div class="text-base flex-shrink-0">${strainEmoji[m.strain_id] ?? '🔬'}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-sm text-gray-900">${m.mutant_id}</span>
          ${genes ? `<span class="text-xs text-gray-400 font-mono truncate">${genes}${moreGenes}</span>` : ''}
        </div>
        ${m.creator ? `
          <div class="flex items-center gap-1 mt-0.5">
            <span class="text-xs text-gray-400">👤 ${m.creator}</span>
          </div>` : ''}
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">${dots}</div>
      <span class="text-gray-300 flex-shrink-0 ml-1">›</span>
    </div>`;
}

function workflowStages() {
  const stages = [
    { label: 'Mutant\ngeneration',    labs: ['Hybiske Lab\nWashington', 'Hefty Lab\nKansas']           },
    { label: 'Genome\nsequencing',    labs: ['Rockey Lab\nOregon State']                               },
    { label: 'In vitro\nscreening',   labs: ['Hybiske Lab\nWashington', 'Hefty Lab\nKansas']           },
    { label: 'In vivo\nscreening',    labs: ['Hefty Lab\nKansas']                                      },
  ];

  return stages.map((s, i) => `
    <div class="flex items-stretch">
      <div class="flex flex-col items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 min-w-[130px]">
        <div class="text-xs font-semibold text-blue-800 text-center leading-tight whitespace-pre-line">${s.label}</div>
        <div class="mt-3 space-y-1">
          ${s.labs.map(lab => `
            <div class="flex items-start gap-1.5">
              <span class="text-xs">🏛</span>
              <span class="text-[10px] text-blue-600 leading-tight whitespace-pre-line">${lab}</span>
            </div>`).join('')}
        </div>
      </div>
      ${i < stages.length - 1 ? `<div class="flex items-center px-1 text-blue-300 text-lg">›</div>` : ''}
    </div>`).join('');
}

function skeletonRows(n) {
  return `<div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
    ${Array.from({length:n}, () => `
      <div class="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
        <div class="skeleton w-5 h-5 rounded flex-shrink-0"></div>
        <div class="flex-1 space-y-2"><div class="skeleton h-3 w-24 rounded"></div><div class="skeleton h-2 w-16 rounded"></div></div>
        <div class="flex gap-1">${Array.from({length:6}, () => `<div class="skeleton w-3.5 h-3.5 rounded-full"></div>`).join('')}</div>
      </div>`).join('')}
  </div>`;
}
