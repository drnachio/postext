// Built-in example resources for the default Sandbox document. These are seeded
// on first entry (when the resource store is empty) and restored on document
// reset, so the default markdown's `::resource` embeds and `:ref` references
// resolve out-of-the-box and the resources system is functional immediately.
//
// SVG blobs are stored under deterministic fileIds via `putBlobAt`, so
// re-seeding overwrites the same record instead of orphaning the previous blob.
//
// The set deliberately spans the placement matrix (column/page span × top/bottom
// position) and is spread across every major section of the document, so the
// float engine is exercised thoroughly and the default document reads as a fully
// illustrated publication. Every figure is a distinct illustration — no diagram
// is reused at two different spans.

import type { Resource, ResourcePlacement, TableCell, TableModel } from 'postext';
import { putBlobAt } from '../storage/blobStore';

/** Stable ids referenced by the default markdown (en.ts / es.ts). Keys are
 *  internal; the string *values* are the ids the markdown's `:ref{id=…}`
 *  directives resolve against, so they must stay in sync with the markdown. */
export const DEFAULT_RESOURCE_IDS = {
  // Figures (SVG)
  layoutPipeline: 'layout-pipeline',
  convergenceLoop: 'convergence-loop',
  measurementSpeed: 'measurement-speed',
  orphanWidow: 'orphan-widow',
  knuthPlass: 'knuth-plass-model',
  baselineGrid: 'baseline-grid',
  columnLayouts: 'column-layouts',
  placementStrategies: 'placement-strategies',
  sandboxUi: 'sandbox-ui',
  // Tables
  featureTable: 'feature-comparison',
  metricsTable: 'runtime-metrics',
  toolsTable: 'tools-comparison',
  placementTable: 'placement-options',
  sizingTable: 'sizing-options',
  presetTable: 'preset-sizes',
  phasesTable: 'development-phases',
} as const;

/** True for any Spanish locale tag (`es`, `es-ES`, `es-419`, …). */
const isEs = (locale: string): boolean => locale.toLowerCase().startsWith('es');

// ───────────────────────────────────────────────────────────────────────────
// SVG illustrations
//
// Each generator returns a self-contained SVG string (no external assets) with
// a `viewBox`, `role="img"`, and a localised `aria-label`. Real words are
// translated; format names (Markdown, Canvas, PDF, HTML) stay verbatim. A shared
// palette keeps the figures visually consistent.
// ───────────────────────────────────────────────────────────────────────────

const ARROW_DEFS = `<defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#555" />
    </marker>
  </defs>`;

/** The Postext pipeline: Markdown → parse → layout → three renderers. */
function pipelineSvg(es: boolean): string {
  const parse = es ? 'Análisis' : 'Parse';
  const layout = es ? 'Maquetación' : 'Layout';
  const ariaLabel = es ? 'tubería de Postext' : 'Postext pipeline';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" role="img" aria-label="${ariaLabel}">
  ${ARROW_DEFS}
  <rect x="8" y="48" width="100" height="44" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="58" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#3730a3">Markdown</text>
  <rect x="138" y="48" width="100" height="44" rx="6" fill="#ecfeff" stroke="#06b6d4" />
  <text x="188" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#155e75">${parse}</text>
  <rect x="268" y="48" width="100" height="44" rx="6" fill="#f0fdf4" stroke="#22c55e" />
  <text x="318" y="74" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#166534">${layout}</text>
  <rect x="392" y="20" width="80" height="32" rx="6" fill="#fef9c3" stroke="#eab308" />
  <text x="432" y="40" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#854d0e">Canvas</text>
  <rect x="392" y="60" width="80" height="32" rx="6" fill="#fee2e2" stroke="#ef4444" />
  <text x="432" y="80" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#991b1b">PDF</text>
  <rect x="392" y="100" width="80" height="32" rx="6" fill="#f1f5f9" stroke="#64748b" />
  <text x="432" y="120" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#334155">HTML</text>
  <line x1="108" y1="70" x2="134" y2="70" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="238" y1="70" x2="264" y2="70" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="36" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="76" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="368" y1="70" x2="388" y2="116" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
</svg>`;
}

/** The convergence loop: place → check → (conflict ⇒ adjust ⇒ back) until the
 *  constraints are satisfied, capped at five iterations. Distinct from the
 *  pipeline figure. */
function convergenceLoopSvg(es: boolean): string {
  const place = es ? 'Colocar' : 'Place';
  const check = es ? 'Comprobar' : 'Check';
  const adjust = es ? 'Ajustar' : 'Adjust';
  const done = es ? 'Convergido' : 'Converged';
  const ok = es ? 'cumple' : 'satisfied';
  const conflict = es ? 'conflicto' : 'conflict';
  const iters = es ? '≤ 5 iteraciones' : '≤ 5 iterations';
  const ariaLabel = es ? 'bucle de convergencia de la maquetación' : 'layout convergence loop';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 170" role="img" aria-label="${ariaLabel}">
  ${ARROW_DEFS}
  <rect x="14" y="56" width="110" height="42" rx="6" fill="#eef2ff" stroke="#6366f1" />
  <text x="69" y="82" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#3730a3">${place}</text>
  <rect x="186" y="56" width="118" height="42" rx="6" fill="#ecfeff" stroke="#06b6d4" />
  <text x="245" y="82" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#155e75">${check}</text>
  <rect x="360" y="56" width="110" height="42" rx="6" fill="#f0fdf4" stroke="#22c55e" />
  <text x="415" y="82" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#166534">${done}</text>
  <rect x="186" y="124" width="118" height="34" rx="6" fill="#fef9c3" stroke="#eab308" />
  <text x="245" y="146" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#854d0e">${adjust}</text>
  <line x1="124" y1="77" x2="182" y2="77" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <line x1="304" y1="77" x2="356" y2="77" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <text x="330" y="68" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#166534">${ok}</text>
  <line x1="245" y1="98" x2="245" y2="120" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <text x="290" y="114" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#854d0e">${conflict}</text>
  <path d="M186,141 C120,141 120,77 182,77" fill="none" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)" />
  <text x="96" y="116" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#555">${iters}</text>
</svg>`;
}

/** A two-bar chart contrasting DOM-based measurement with DOM-free measurement,
 *  annotated with the 300–600× speed-up. */
function measurementSpeedSvg(es: boolean): string {
  const withDom = es ? 'Con DOM' : 'DOM-based';
  const withoutDom = es ? 'Sin DOM' : 'DOM-free';
  const faster = es ? '300–600× más rápido' : '300–600× faster';
  const ariaLabel = es
    ? 'comparación de velocidad entre medición con y sin DOM'
    : 'speed comparison between DOM-based and DOM-free measurement';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" role="img" aria-label="${ariaLabel}">
  <line x1="40" y1="150" x2="280" y2="150" stroke="#94a3b8" stroke-width="1.5" />
  <rect x="70" y="28" width="64" height="122" rx="3" fill="#fee2e2" stroke="#ef4444" />
  <text x="102" y="168" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#991b1b">${withDom}</text>
  <rect x="190" y="144" width="64" height="6" rx="2" fill="#22c55e" stroke="#16a34a" />
  <text x="222" y="168" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#166534">${withoutDom}</text>
  <text x="222" y="132" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="#166534">${faster}</text>
</svg>`;
}

/** Two columns of text lines illustrating a widow (lone last line at the foot of
 *  a column) and an orphan (lone first line at the head of the next). */
function orphanWidowSvg(es: boolean): string {
  const widow = es ? 'Viuda' : 'Widow';
  const orphan = es ? 'Huérfana' : 'Orphan';
  const ariaLabel = es ? 'líneas viuda y huérfana entre columnas' : 'widow and orphan lines across columns';
  // Full body lines in the left column, then a stranded widow at its foot.
  const leftLines = [40, 56, 72, 88, 104, 120].map((y) => `<rect x="22" y="${y}" width="96" height="6" rx="2" fill="#cbd5e1" />`).join('\n  ');
  // An orphan at the head of the right column, gap, then a fresh paragraph.
  const rightLines = [72, 88, 104, 120, 136].map((y) => `<rect x="182" y="${y}" width="96" height="6" rx="2" fill="#cbd5e1" />`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" role="img" aria-label="${ariaLabel}">
  <rect x="14" y="14" width="112" height="152" rx="4" fill="#ffffff" stroke="#e2e8f0" />
  <rect x="174" y="14" width="112" height="152" rx="4" fill="#ffffff" stroke="#e2e8f0" />
  ${leftLines}
  <rect x="22" y="148" width="60" height="6" rx="2" fill="#f59e0b" />
  <text x="70" y="166" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#b45309">${widow}</text>
  <rect x="182" y="40" width="96" height="6" rx="2" fill="#ef4444" />
  <text x="230" y="34" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#b91c1c">${orphan}</text>
  ${rightLines}
</svg>`;
}

/** The Knuth-Plass primitives: boxes (words), glue (stretchable spaces) and a
 *  flagged penalty (a hyphenation point), with a legend. */
function knuthPlassSvg(es: boolean): string {
  const box = es ? 'Caja' : 'Box';
  const glue = es ? 'Goma' : 'Glue';
  const penalty = es ? 'Penalización' : 'Penalty';
  const ariaLabel = es
    ? 'primitivas de Knuth-Plass: cajas, gomas y penalizaciones'
    : 'Knuth-Plass primitives: boxes, glue and penalties';
  // A line: box glue box glue box penalty(hyphen)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 130" role="img" aria-label="${ariaLabel}">
  <rect x="20" y="34" width="70" height="30" rx="3" fill="#eef2ff" stroke="#6366f1" />
  <path d="M98,49 q6,-9 12,0 q6,9 12,0" fill="none" stroke="#06b6d4" stroke-width="2" />
  <rect x="130" y="34" width="96" height="30" rx="3" fill="#eef2ff" stroke="#6366f1" />
  <path d="M234,49 q6,-9 12,0 q6,9 12,0" fill="none" stroke="#06b6d4" stroke-width="2" />
  <rect x="266" y="34" width="120" height="30" rx="3" fill="#eef2ff" stroke="#6366f1" />
  <path d="M386,49 l10,0" stroke="#ef4444" stroke-width="2" />
  <rect x="398" y="34" width="60" height="30" rx="3" fill="#eef2ff" stroke="#6366f1" stroke-dasharray="3 3" />
  <rect x="24" y="92" width="16" height="12" rx="2" fill="#eef2ff" stroke="#6366f1" />
  <text x="48" y="102" font-family="sans-serif" font-size="12" fill="#334155">${box}</text>
  <path d="M120,98 q6,-9 12,0 q6,9 12,0" fill="none" stroke="#06b6d4" stroke-width="2" />
  <text x="150" y="102" font-family="sans-serif" font-size="12" fill="#334155">${glue}</text>
  <path d="M232,98 l14,0" stroke="#ef4444" stroke-width="2" />
  <text x="252" y="102" font-family="sans-serif" font-size="12" fill="#334155">${penalty}</text>
</svg>`;
}

/** Two columns whose text lines snap to a shared horizontal baseline grid, with
 *  one dashed guide showing the cross-column alignment. */
function baselineGridSvg(es: boolean): string {
  const label = es ? 'Rejilla de línea base' : 'Baseline grid';
  const ariaLabel = es ? 'alineación a la rejilla de línea base' : 'baseline grid alignment';
  const gridYs = [40, 58, 76, 94, 112, 130];
  const grid = gridYs.map((y) => `<line x1="14" y1="${y}" x2="286" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`).join('\n  ');
  const left = gridYs.map((y) => `<rect x="22" y="${y - 6}" width="96" height="5" rx="2" fill="#94a3b8" />`).join('\n  ');
  const right = gridYs.map((y) => `<rect x="182" y="${y - 6}" width="96" height="5" rx="2" fill="#94a3b8" />`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 170" role="img" aria-label="${ariaLabel}">
  ${grid}
  ${left}
  ${right}
  <line x1="14" y1="94" x2="286" y2="94" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="4 3" />
  <text x="150" y="158" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#3730a3">${label}</text>
</svg>`;
}

/** Four page thumbnails showing the supported column structures. */
function columnLayoutsSvg(es: boolean): string {
  const ariaLabel = es ? 'estructuras de columnas soportadas' : 'supported column structures';
  const one = es ? 'Una' : 'Single';
  const two = es ? 'Dos' : 'Two';
  const three = es ? 'Tres' : 'Three';
  const half = es ? 'Columna y media' : 'One-and-a-half';
  const page = (x: number, inner: string) =>
    `<rect x="${x}" y="16" width="92" height="96" rx="4" fill="#ffffff" stroke="#cbd5e1" />${inner}`;
  const col = (x: number, w: number) => `<rect x="${x}" y="24" width="${w}" height="80" rx="2" fill="#eef2ff" stroke="#6366f1" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" role="img" aria-label="${ariaLabel}">
  ${page(12, col(20, 76))}
  ${page(124, col(132, 36) + col(172, 36))}
  ${page(236, col(244, 22) + col(270, 22) + col(296, 22))}
  ${page(348, col(356, 50) + col(410, 22))}
  <text x="58" y="128" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#334155">${one}</text>
  <text x="170" y="128" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#334155">${two}</text>
  <text x="282" y="128" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#334155">${three}</text>
  <text x="394" y="128" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#334155">${half}</text>
</svg>`;
}

/** A page showing three placement strategies at once: a top-of-column block, a
 *  full-width band, and a margin note. */
function placementStrategiesSvg(es: boolean): string {
  const top = es ? 'Cabeza de columna' : 'Top of column';
  const full = es ? 'Ancho completo' : 'Full width';
  const margin = es ? 'Margen' : 'Margin';
  const ariaLabel = es ? 'estrategias de colocación de recursos' : 'resource placement strategies';
  // Text lines in two columns, kept clear of the regions used by resources.
  const colLine = (x: number, y: number) => `<rect x="${x}" y="${y}" width="120" height="5" rx="2" fill="#cbd5e1" />`;
  const leftYs = [96, 108, 120, 132];
  const rightYs = [30, 42, 54, 66, 78, 90, 102, 114, 126, 138];
  const left = leftYs.map((y) => colLine(40, y)).join('\n  ');
  const right = rightYs.map((y) => colLine(180, y)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 200" role="img" aria-label="${ariaLabel}">
  <rect x="24" y="16" width="296" height="168" rx="6" fill="#ffffff" stroke="#cbd5e1" />
  <rect x="40" y="30" width="120" height="56" rx="4" fill="#eef2ff" stroke="#6366f1" />
  <text x="100" y="62" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#3730a3">${top}</text>
  ${left}
  ${right}
  <rect x="40" y="150" width="260" height="28" rx="4" fill="#f0fdf4" stroke="#22c55e" />
  <text x="170" y="168" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#166534">${full}</text>
  <rect x="332" y="30" width="104" height="44" rx="4" fill="#fef9c3" stroke="#eab308" />
  <text x="384" y="56" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#854d0e">${margin}</text>
</svg>`;
}

/** The Sandbox interface: activity bar, sidebar editor, and a three-tab
 *  viewport. */
function sandboxUiSvg(es: boolean): string {
  const editor = es ? 'Editor' : 'Editor';
  const ariaLabel = es ? 'disposición de la interfaz del Sandbox' : 'Sandbox interface layout';
  const icons = [26, 50, 74, 98].map((y) => `<rect x="16" y="${y}" width="16" height="16" rx="3" fill="#cbd5e1" />`).join('\n  ');
  const editorLines = [40, 54, 68, 82, 96, 110, 124, 138].map((y) => `<rect x="62" y="${y}" width="76" height="5" rx="2" fill="#cbd5e1" />`).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" role="img" aria-label="${ariaLabel}">
  <rect x="8" y="16" width="32" height="158" rx="4" fill="#f1f5f9" stroke="#cbd5e1" />
  ${icons}
  <rect x="48" y="16" width="104" height="158" rx="4" fill="#ffffff" stroke="#cbd5e1" />
  <text x="62" y="30" font-family="sans-serif" font-size="11" fill="#64748b">${editor}</text>
  ${editorLines}
  <rect x="160" y="16" width="192" height="158" rx="4" fill="#ffffff" stroke="#cbd5e1" />
  <rect x="160" y="16" width="64" height="22" rx="4" fill="#eef2ff" stroke="#6366f1" />
  <text x="192" y="31" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#3730a3">Canvas</text>
  <text x="252" y="31" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748b">HTML</text>
  <text x="312" y="31" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748b">PDF</text>
  <rect x="190" y="50" width="132" height="112" rx="3" fill="#f8fafc" stroke="#e2e8f0" />
</svg>`;
}

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads. */
const SVG_FIGURES: Record<string, { generate: (es: boolean) => string; width: number; height: number }> = {
  'default-layout-pipeline': { generate: pipelineSvg, width: 480, height: 140 },
  'default-convergence-loop': { generate: convergenceLoopSvg, width: 480, height: 170 },
  'default-measurement-speed': { generate: measurementSpeedSvg, width: 300, height: 190 },
  'default-orphan-widow': { generate: orphanWidowSvg, width: 300, height: 180 },
  'default-knuth-plass': { generate: knuthPlassSvg, width: 480, height: 130 },
  'default-baseline-grid': { generate: baselineGridSvg, width: 300, height: 170 },
  'default-column-layouts': { generate: columnLayoutsSvg, width: 480, height: 140 },
  'default-placement-strategies': { generate: placementStrategiesSvg, width: 460, height: 200 },
  'default-sandbox-ui': { generate: sandboxUiSvg, width: 360, height: 190 },
};

// ───────────────────────────────────────────────────────────────────────────
// Tables
//
// Cell content is plain text / inline markdown (bold, inline code). Content
// follows the document locale so a Spanish document gets Spanish tables.
// ───────────────────────────────────────────────────────────────────────────

const h = (content: string): TableCell => ({ content, isHeader: true });
const c = (content: string): TableCell => ({ content });

/** Build a {@link TableModel} from a header row and body rows of strings. */
function table(headers: string[], body: string[][]): TableModel {
  return {
    headerRowCount: 1,
    rows: [headers.map(h), ...body.map((row) => row.map(c))],
  };
}

function featureTableModel(es: boolean): TableModel {
  const yes = es ? '**Sí**' : '**Yes**';
  return es
    ? table(
        ['Capacidad', 'CSS plano', 'Postext'],
        [
          ['Flujo multicolumna equilibrado', 'Parcial', yes],
          ['Control de huérfanas y viudas', 'Inconsistente', yes],
          ['PDF desde la misma fuente', 'No', yes],
          ['Matemáticas en línea (`$x^2$`)', 'No', yes],
        ],
      )
    : table(
        ['Capability', 'Plain CSS', 'Postext'],
        [
          ['Balanced multi-column flow', 'Partial', yes],
          ['Orphan & widow control', 'Inconsistent', yes],
          ['PDF from same source', 'No', yes],
          ['Inline math (`$x^2$`)', 'No', yes],
        ],
      );
}

function metricsTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Etapa', 'Coste'],
        [
          ['Análisis', '`O(n)`'],
          ['Maquetación', '`O(n·k)`'],
          ['Renderizado', '`O(n)`'],
        ],
      )
    : table(
        ['Stage', 'Cost'],
        [
          ['Parse', '`O(n)`'],
          ['Layout', '`O(n·k)`'],
          ['Render', '`O(n)`'],
        ],
      );
}

function toolsTableModel(es: boolean): TableModel {
  const full = es ? '**Completo**' : '**Full**';
  const yes = es ? '**Sí**' : '**Yes**';
  const basic = es ? 'Básico' : 'Basic';
  return es
    ? table(
        ['Herramienta', 'Control editorial', 'En la web', 'Incrustable'],
        [
          ['Microsoft Word', basic, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No'],
          ['LaTeX', full, 'No', 'No'],
          ['Postext', full, yes, yes],
        ],
      )
    : table(
        ['Tool', 'Editorial control', 'Runs on the web', 'Embeddable'],
        [
          ['Microsoft Word', basic, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No'],
          ['LaTeX', full, 'No', 'No'],
          ['Postext', full, yes, yes],
        ],
      );
}

function placementTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Estrategia', 'Dónde aterriza', 'Uso habitual'],
        [
          ['Cabeza de columna', 'Arriba de la columna actual o siguiente', 'Figuras académicas'],
          ['En línea', 'En el punto de referencia', 'Diagramas pequeños'],
          ['Flotante', 'Borde de columna, el texto rodea', 'Imágenes marginales'],
          ['Ancho completo', 'Cruza toda la página', 'Tablas anchas, imágenes grandes'],
          ['Margen', 'En el margen de la página', 'Anotaciones, iconos'],
        ],
      )
    : table(
        ['Strategy', 'Where it lands', 'Typical use'],
        [
          ['Top of column', 'Top of current or next column', 'Academic figures'],
          ['Inline', 'At the reference point', 'Small diagrams'],
          ['Float', 'Column edge, text wraps', 'Marginal images'],
          ['Full width', 'Spans the whole page', 'Wide tables, large images'],
          ['Margin', 'In the page margin', 'Annotations, icons'],
        ],
      );
}

function sizingTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Modo', 'Comportamiento'],
        [
          ['Tamaño natural', 'Dimensiones intrínsecas del recurso'],
          ['Ancho de columna', 'Llena una sola columna'],
          ['Ancho de expansión', 'Cubre N columnas con medianiles'],
          ['Ancho completo', 'Llena toda el área de texto'],
          ['Personalizado', 'Ancho y alto exactos'],
        ],
      )
    : table(
        ['Mode', 'Behaviour'],
        [
          ['Natural size', "The resource's intrinsic dimensions"],
          ['Column width', 'Fills a single column'],
          ['Span width', 'Covers N columns including gutters'],
          ['Full width', 'Fills the whole text area'],
          ['Custom', 'Exact width and height'],
        ],
      );
}

function presetTableModel(es: boolean): TableModel {
  const custom = es ? 'Personalizado' : 'Custom';
  const any = es ? 'Cualquier formato fuera de norma' : 'Any non-standard format';
  return es
    ? table(
        ['Tamaño', 'Uso habitual'],
        [
          ['11 × 17 cm', 'Guías de bolsillo'],
          ['12 × 19 cm', 'Novelas de bolsillo'],
          ['17 × 24 cm', 'Libros de texto y manuales'],
          ['21 × 28 cm', 'Revistas y gran formato'],
          [custom, any],
        ],
      )
    : table(
        ['Size', 'Typical use'],
        [
          ['11 × 17 cm', 'Pocket guides'],
          ['12 × 19 cm', 'Fiction paperbacks'],
          ['17 × 24 cm', 'Textbooks and manuals'],
          ['21 × 28 cm', 'Magazines and large format'],
          [custom, any],
        ],
      );
}

function phasesTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Fase', 'Capacidades clave'],
        [
          ['1 · Fundamentos', 'Modelo de datos, parser, medición'],
          ['2 · Maquetación editorial', 'Columnas, equilibrio, recursos'],
          ['3 · Tipografía profesional', 'Separación silábica, Knuth-Plass, notas'],
          ['4 · Salida e integración', 'Canvas, HTML, PDF, Sandbox'],
        ],
      )
    : table(
        ['Phase', 'Key capabilities'],
        [
          ['1 · Foundation', 'Data model, parser, measurement'],
          ['2 · Editorial Layout', 'Columns, balancing, resources'],
          ['3 · Professional Typography', 'Hyphenation, Knuth-Plass, notes'],
          ['4 · Output & Integration', 'Canvas, HTML, PDF, Sandbox'],
        ],
      );
}

// ───────────────────────────────────────────────────────────────────────────
// Resource specs
//
// One entry per default resource. SVG figures reference a `fileId` from
// SVG_FIGURES; tables carry a model builder. Captions/altText follow the locale.
// ───────────────────────────────────────────────────────────────────────────

interface FigureSpec {
  id: string;
  fileId: keyof typeof SVG_FIGURES & string;
  placement: ResourcePlacement;
  caption: (es: boolean) => string;
  altText: (es: boolean) => string;
}

interface TableSpec {
  id: string;
  model: (es: boolean) => TableModel;
  placement: ResourcePlacement;
  caption: (es: boolean) => string;
}

const FIGURE_SPECS: FigureSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.layoutPipeline,
    fileId: 'default-layout-pipeline',
    placement: { position: 'top', span: 'column' },
    caption: (es) =>
      es
        ? 'La tubería de Postext: el Markdown se analiza, se maqueta y luego se renderiza a canvas, PDF y HTML.'
        : 'The Postext pipeline: Markdown is parsed, laid out, then rendered to canvas, PDF, and HTML.',
    altText: (es) =>
      es
        ? 'Diagrama de flujo desde Markdown, pasando por análisis y maquetación, hasta las salidas en canvas, PDF y HTML.'
        : 'Flow diagram from Markdown through parse and layout to canvas, PDF, and HTML outputs.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.convergenceLoop,
    fileId: 'default-convergence-loop',
    placement: { position: 'bottom', span: 'page' },
    caption: (es) =>
      es
        ? 'El bucle de convergencia: el motor coloca, comprueba y ajusta hasta que las restricciones se cumplen, con un tope de cinco iteraciones.'
        : 'The convergence loop: the engine places, checks, and adjusts until the constraints are satisfied, capped at five iterations.',
    altText: (es) =>
      es
        ? 'Diagrama de un ciclo entre colocar, comprobar y ajustar que sale hacia un estado convergido.'
        : 'Diagram of a cycle between place, check, and adjust that exits to a converged state.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.measurementSpeed,
    fileId: 'default-measurement-speed',
    placement: { position: 'top', span: 'column' },
    caption: (es) =>
      es
        ? 'La medición sin DOM de pretext es entre 300 y 600 veces más rápida que leer dimensiones del DOM.'
        : "pretext's DOM-free measurement is 300 to 600 times faster than reading dimensions back from the DOM.",
    altText: (es) =>
      es
        ? 'Gráfico de barras con una barra alta para la medición con DOM y una diminuta para la medición sin DOM.'
        : 'Bar chart with a tall bar for DOM-based measurement and a tiny one for DOM-free measurement.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.orphanWidow,
    fileId: 'default-orphan-widow',
    placement: { position: 'top', span: 'column' },
    caption: (es) =>
      es
        ? 'Una viuda queda sola al pie de una columna; una huérfana queda sola en la cabeza de la siguiente.'
        : 'A widow is stranded at the foot of a column; an orphan is stranded at the head of the next.',
    altText: (es) =>
      es
        ? 'Dos columnas de líneas de texto que resaltan una línea viuda abajo y una huérfana arriba.'
        : 'Two columns of text lines highlighting a widow line at the bottom and an orphan line at the top.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.knuthPlass,
    fileId: 'default-knuth-plass',
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es
        ? 'Knuth-Plass modela cada línea como cajas, gomas y penalizaciones; las penalizaciones marcadas son oportunidades de guion.'
        : 'Knuth-Plass models each line as boxes, glue, and penalties; flagged penalties are hyphenation opportunities.',
    altText: (es) =>
      es
        ? 'Una línea descompuesta en cajas de palabra, gomas elásticas y una penalización de guion, con leyenda.'
        : 'A line broken into word boxes, stretchable glue, and a hyphen penalty, with a legend.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.baselineGrid,
    fileId: 'default-baseline-grid',
    placement: { position: 'bottom', span: 'column' },
    caption: (es) =>
      es
        ? 'La rejilla de línea base fija cada línea a un ritmo vertical común para que las columnas se alineen.'
        : 'The baseline grid snaps every line to a shared vertical rhythm so columns align horizontally.',
    altText: (es) =>
      es
        ? 'Dos columnas de líneas que descansan sobre una rejilla horizontal compartida, con una guía discontinua.'
        : 'Two columns of lines resting on a shared horizontal grid, with a dashed alignment guide.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.columnLayouts,
    fileId: 'default-column-layouts',
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es
        ? 'Cuatro estructuras de columnas: una sola columna, dos, tres y columna y media para anotaciones laterales.'
        : 'Four column structures: single column, two, three, and one-and-a-half for side annotations.',
    altText: (es) =>
      es
        ? 'Cuatro miniaturas de página que muestran disposiciones de una, dos, tres columnas y columna y media.'
        : 'Four page thumbnails showing single, two, three, and one-and-a-half column layouts.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementStrategies,
    fileId: 'default-placement-strategies',
    placement: { position: 'bottom', span: 'page' },
    caption: (es) =>
      es
        ? 'Tres estrategias a la vez: un recurso en cabeza de columna, una banda a ancho completo y una nota al margen.'
        : 'Three strategies at once: a top-of-column resource, a full-width band, and a margin note.',
    altText: (es) =>
      es
        ? 'Una página con un bloque en cabeza de columna, una banda a ancho completo y un bloque en el margen.'
        : 'A page with a top-of-column block, a full-width band, and a block in the margin.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.sandboxUi,
    fileId: 'default-sandbox-ui',
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es
        ? 'La disposición del Sandbox: barra de actividad, barra lateral con el editor y el viewport de tres pestañas.'
        : 'The Sandbox layout: activity bar, sidebar editor, and the three-tab viewport.',
    altText: (es) =>
      es
        ? 'Maqueta de la interfaz con barra de actividad, panel de editor y un viewport con pestañas Canvas, HTML y PDF.'
        : 'Interface mock-up with an activity bar, editor panel, and a viewport with Canvas, HTML, and PDF tabs.',
  },
];

const TABLE_SPECS: TableSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.featureTable,
    model: featureTableModel,
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es
        ? 'Capacidades de maquetación editorial de CSS plano frente a Postext.'
        : 'Editorial layout capabilities of plain CSS versus Postext.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.toolsTable,
    model: toolsTableModel,
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es
        ? 'Cómo se sitúa Postext frente a las herramientas editoriales establecidas.'
        : 'How Postext compares with established editorial tools.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.metricsTable,
    model: metricsTableModel,
    placement: { position: 'bottom', span: 'column' },
    caption: (es) =>
      es ? 'Coste asintótico aproximado por etapa de la tubería.' : 'Approximate asymptotic cost per pipeline stage.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementTable,
    model: placementTableModel,
    placement: { position: 'top', span: 'column' },
    caption: (es) =>
      es
        ? 'Las estrategias de colocación de recursos y para qué sirve cada una.'
        : 'The resource placement strategies and what each is for.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.sizingTable,
    model: sizingTableModel,
    placement: { position: 'bottom', span: 'column' },
    caption: (es) =>
      es ? 'Los modos de dimensionado disponibles para un recurso.' : 'The sizing modes available for a resource.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.presetTable,
    model: presetTableModel,
    placement: { position: 'top', span: 'column' },
    caption: (es) =>
      es ? 'Tamaños de página preestablecidos y su uso habitual.' : 'Preset page sizes and their typical use.',
  },
  {
    id: DEFAULT_RESOURCE_IDS.phasesTable,
    model: phasesTableModel,
    placement: { position: 'top', span: 'page' },
    caption: (es) =>
      es ? 'Las cuatro fases de desarrollo y sus capacidades clave.' : 'The four development phases and their key capabilities.',
  },
];

/** Build (and persist the blobs for) the default example resources for the
 *  given document `locale` (defaults to English). Captions, table content, and
 *  diagram labels follow the locale so they match the seeded markdown — a
 *  Spanish document gets Spanish tables and figures, not the English ones. Safe
 *  to call repeatedly — blob writes are idempotent on their deterministic ids. */
export async function buildDefaultResources(locale = 'en'): Promise<Resource[]> {
  const now = Date.now();
  const es = isEs(locale);

  // Persist every figure's SVG blob; tolerate IndexedDB being unavailable.
  // Without storage the SVGs won't render, but tables still work and the
  // warnings panel flags the unresolved blobs.
  await Promise.all(
    Object.entries(SVG_FIGURES).map(async ([fileId, fig]) => {
      try {
        const bytes = new TextEncoder().encode(fig.generate(es)).buffer;
        await putBlobAt(fileId, bytes, 'image/svg+xml');
      } catch {
        // ignore — see note above
      }
    }),
  );

  const figures: Resource[] = FIGURE_SPECS.map((spec) => {
    const fig = SVG_FIGURES[spec.fileId];
    return {
      id: spec.id,
      typeId: 'figure',
      kind: 'svg',
      svg: { fileId: spec.fileId, width: fig.width, height: fig.height },
      placement: spec.placement,
      caption: spec.caption(es),
      altText: spec.altText(es),
      createdAt: now,
      updatedAt: now,
    };
  });

  const tables: Resource[] = TABLE_SPECS.map((spec) => ({
    id: spec.id,
    typeId: 'table',
    kind: 'table',
    table: { model: spec.model(es) },
    placement: spec.placement,
    caption: spec.caption(es),
    createdAt: now,
    updatedAt: now,
  }));

  return [...figures, ...tables];
}
