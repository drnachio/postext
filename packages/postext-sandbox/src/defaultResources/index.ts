// Built-in example resources for the default Sandbox document. These are seeded
// on first entry (when the resource store is empty) and restored on document
// reset, so the default markdown's `::resource` embeds and `:ref` references
// resolve out-of-the-box and the resources system is functional immediately.
//
// SVG blobs are stored under deterministic fileIds via `putBlobAt`, so
// re-seeding overwrites the same record instead of orphaning the previous blob.
//
// The set deliberately spans the placement matrix (column/page span × auto/top/
// bottom position) and is spread across every major section of the document, so the
// float engine is exercised thoroughly and the default document reads as a fully
// illustrated publication. Every figure is a distinct illustration — no diagram
// is reused at two different spans.

import type { Resource, ResourcePlacement, TableCell, TableModel } from 'postext';
import { invalidateResourceImage } from '../controls/resourceImages';
import { putBlobAt } from '../storage/blobStore';
import { COVER_VH, COVER_VW, coverArtSvg } from './cover';

/** Stable ids referenced by the default markdown (en.ts / es.ts). Keys are
 *  internal; the string *values* are the ids the markdown's `:ref{id=…}`
 *  directives resolve against, so they must stay in sync with the markdown. */
export const DEFAULT_RESOURCE_IDS = {
  // Cover artwork (a design image of the cover heading style, never referenced)
  cover: 'guide-cover',
  // Figures (SVG)
  layoutPipeline: 'layout-pipeline',
  convergenceLoop: 'convergence-loop',
  measurementSpeed: 'measurement-speed',
  orphanWidow: 'orphan-widow',
  knuthPlass: 'knuth-plass-model',
  baselineGrid: 'baseline-grid',
  columnLayouts: 'column-layouts',
  balancing: 'column-balancing',
  floatSlots: 'float-slots',
  bookAnatomy: 'book-anatomy',
  sandboxUi: 'sandbox-ui',
  // Tables
  featureTable: 'feature-comparison',
  toolsTable: 'tools-comparison',
  placementTable: 'placement-options',
  documentFormatTable: 'document-format',
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
// translated; format names (Markdown, Canvas, PDF, HTML) stay verbatim.
//
// A shared design system keeps the figures coherent: one blue family derived
// from the default main colour, cool slate neutrals, and a single warm amber
// reserved for points of attention. Differences are encoded by value
// (light/dark) and pattern as well as hue, so every figure also reads
// correctly in greyscale or single-ink reproduction (diagramStyle.singleInk).
//
// Unit system: every figure is drawn on a shared physical scale. Column-span
// canvases are COLUMN_VW (300) units wide and page-span canvases are PAGE_VW
// (634) units wide — 300 × the default page/column width ratio (a 14 cm text
// area against 6.625 cm columns ≈ 2.113). Both spans therefore render at the
// same units-per-point factor (1 unit ≈ 0.63 pt), so the FS type scale,
// stroke widths, and arrowhead markers come out the same physical size in
// every figure, regardless of where the float lands.
// ───────────────────────────────────────────────────────────────────────────

import { COLUMN_VW, DEFS, FS, P, PAGE_VW, bar, edge, node, text } from './svgKit';
import { balancingSvg, bookAnatomySvg, columnLayoutsSvg, floatSlotsSvg, sandboxUiSvg } from './guideFigures';

/** The Postext pipeline: Markdown and configuration → parse → measure →
 *  layout (the convergence loop) → the VDT, read by three renderers. A
 *  column-span figure, so the stages stack vertically and fan out to the
 *  output chips at the foot. The stage fills deepen top to bottom (source →
 *  engine). */
function pipelineSvg(es: boolean): string {
  const parse = es ? 'Análisis' : 'Parse';
  const measure = es ? 'Medición' : 'Measure';
  const layout = es ? 'Maquetación' : 'Layout';
  const config = es ? 'Configuración' : 'Configuration';
  const loop = es ? '≤ 5 pasadas' : '≤ 5 passes';
  const ariaLabel = es ? 'tubería de Postext' : 'Postext pipeline';
  const chip = (x: number, label: string, dot: string): string =>
    `<rect x="${x}" y="262" width="82" height="26" rx="13" fill="${P.paper}" stroke="${P.edgeSoft}" stroke-width="1.2" />
  <circle cx="${x + 13}" cy="275" r="3.5" fill="${dot}" />
  ${text(x + 22, 279, label, { size: FS.label, weight: 600, anchor: 'start' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 300" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(22, 14, 116, 32, 'Markdown', 'neutral')}
  ${node(162, 14, 116, 32, config, 'neutral')}
  ${node(95, 70, 110, 32, parse, 'tint')}
  ${node(95, 122, 110, 32, measure, 'tint')}
  ${node(95, 174, 110, 32, layout, 'solid')}
  <path d="M205,184 C236,184 236,200 205,200" fill="none" stroke="${P.amber}" stroke-width="1.6" marker-end="url(#ahAmber)" />
  ${text(240, 196, loop, { size: FS.small, color: P.amberDark, anchor: 'start', italic: true })}
  ${edge('M80,46 C80,58 130,56 136,66')}
  ${edge('M220,46 C220,58 170,56 164,66')}
  ${edge('M150,102 L150,118')}
  ${edge('M150,154 L150,170')}
  <rect x="124" y="218" width="52" height="18" rx="9" fill="${P.blueTint}" stroke="${P.blueMid}" />
  ${text(150, 230.5, 'VDT', { size: FS.small, color: P.blueDark, weight: 700 })}
  ${edge('M150,206 L150,214', { marker: null })}
  ${edge('M150,236 C150,248 53,244 53,258')}
  ${edge('M150,236 L150,258')}
  ${edge('M150,236 C150,248 247,244 247,258')}
  ${chip(12, 'Canvas', P.blue)}
  ${chip(109, 'HTML', P.muted)}
  ${chip(206, 'PDF', P.amber)}
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
  const itersWidth = es ? 96 : 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 170" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(36, 46, 120, 40, place, 'tint')}
  ${node(257, 46, 120, 40, check, 'tint')}
  ${node(478, 46, 120, 40, done, 'solid')}
  ${node(257, 118, 120, 36, adjust, 'accent')}
  ${edge('M160,66 L253,66')}
  ${edge('M381,66 L474,66', { marker: 'ahBlue', color: P.blue })}
  ${text(427, 58, ok, { size: FS.small, color: P.blueDark, italic: true })}
  ${edge('M317,90 L317,114', { color: P.amber, marker: 'ahAmber' })}
  ${text(325, 106, conflict, { size: FS.small, color: P.amberDark, italic: true, anchor: 'start' })}
  ${edge('M253,136 L132,136 Q124,136 124,128 L124,92', { dash: '5 4' })}
  <rect x="${188 - itersWidth / 2}" y="127" width="${itersWidth}" height="18" rx="9" fill="${P.paper}" stroke="${P.hair}" />
  ${text(188, 139.5, iters, { size: FS.small, color: P.muted })}
</svg>`;
}

/** A two-bar chart contrasting DOM-based measurement with DOM-free measurement,
 *  annotated with the 300–600× speed-up. */
function measurementSpeedSvg(es: boolean): string {
  const withDom = es ? 'Con DOM' : 'DOM-based';
  const withoutDom = es ? 'Sin DOM' : 'DOM-free';
  const fasterWord = es ? 'más rápido' : 'faster';
  const timeAxis = es ? 'tiempo' : 'time';
  const ariaLabel = es
    ? 'comparación de velocidad entre medición con y sin DOM'
    : 'speed comparison between DOM-based and DOM-free measurement';
  // Bars sit on the axis with rounded tops only.
  const roundTopBar = (x: number, top: number, w: number, fill: string, stroke: string): string =>
    `<path d="M${x},150 L${x},${top + 5} Q${x},${top} ${x + 5},${top} L${x + w - 5},${top} Q${x + w},${top} ${x + w},${top + 5} L${x + w},150 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`;
  const gridlines = [54, 86, 118]
    .map((y) => `<line x1="36" y1="${y}" x2="276" y2="${y}" stroke="${P.hair}" stroke-width="1" />`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 190" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${gridlines}
  ${text(33, 40, timeAxis, { size: FS.small, color: P.muted, anchor: 'end', italic: true })}
  ${roundTopBar(64, 32, 60, '#c9d4df', '#9aaaba')}
  ${roundTopBar(192, 143, 60, P.blue, P.blueDark)}
  <line x1="36" y1="150" x2="276" y2="150" stroke="#9aaaba" stroke-width="1.5" />
  ${edge('M128,38 C168,52 186,94 210,136', { marker: 'ahBlue', color: P.blue })}
  ${text(230, 106, '300–600×', { size: FS.strong, color: P.blueDark, weight: 700 })}
  ${text(230, 121, fasterWord, { size: FS.small, color: P.muted })}
  ${text(94, 169, withDom, { size: FS.label, weight: 600 })}
  ${text(222, 169, withoutDom, { size: FS.label, weight: 600 })}
</svg>`;
}

/** Two columns of text lines illustrating a widow (lone last line at the foot of
 *  a column) and an orphan (lone first line at the head of the next). */
function orphanWidowSvg(es: boolean): string {
  const widow = es ? 'Viuda' : 'Widow';
  const orphan = es ? 'Huérfana' : 'Orphan';
  const ariaLabel = es ? 'líneas viuda y huérfana entre columnas' : 'widow and orphan lines across columns';
  // Full body lines fill the left column; its paragraph's last line strands
  // alone at the foot. The continuation paragraph opens the right column with
  // a lone first line before the next paragraph begins.
  const leftWidths = [96, 90, 96, 86, 96, 92, 96, 88, 94];
  const leftLines = leftWidths.map((w, i) => bar(26, 32 + i * 12, w)).join('\n  ');
  const rightWidths = [92, 96, 86, 96, 90, 96, 84, 94];
  const rightLines = rightWidths.map((w, i) => bar(178, 56 + i * 12, w)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 180" role="img" aria-label="${ariaLabel}">
  <rect x="16" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="168" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${leftLines}
  ${bar(26, 144, 56, P.amber)}
  ${text(74, 175, widow, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${bar(178, 32, 96, P.amber)}
  ${text(226, 13, orphan, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${rightLines}
</svg>`;
}

/** The Knuth-Plass primitives on a real line: word boxes, glue springs
 *  between them and a flagged penalty where the word would hyphenate, the
 *  measure the line is justified to above, and a legend. */
function knuthPlassSvg(es: boolean): string {
  const box = es ? 'Caja' : 'Box';
  const glue = es ? 'Goma' : 'Glue';
  const penalty = es ? 'Penalización' : 'Penalty';
  const measure = es ? 'medida de la línea · r = 0,42 · medianía 7' : 'line measure · r = 0.42 · badness 7';
  const words = es ? ['Cada', 'párrafo', 'se', 'equili', 'bra'] : ['Every', 'paragraph', 'is', 'balan', 'ced'];
  const ariaLabel = es
    ? 'primitivas de Knuth-Plass: cajas, gomas y penalizaciones'
    : 'Knuth-Plass primitives: boxes, glue and penalties';
  const spring = (x: number, y: number): string =>
    `<path d="M${x},${y} q3,-8 6,0 t6,0 t6,0 t6,0" fill="none" stroke="${P.blueMid}" stroke-width="2" stroke-linecap="round" />`;
  const wordBox = (x: number, w: number, label: string, dashed = false): string =>
    `<rect x="${x}" y="46" width="${w}" height="34" rx="4" fill="${dashed ? '#f3f6fc' : P.blueTint}" stroke="${dashed ? P.blueMid : P.blue}" stroke-width="1.3"${dashed ? ' stroke-dasharray="4 3"' : ''} />
  ${text(x + w / 2, 68, label, { size: FS.strong, color: dashed ? P.blueMid : P.blueDark, weight: 600, italic: dashed })}`;
  const hyphen = (x: number, y: number, w: number): string =>
    `<path d="M${x},${y} l${w},0" stroke="${P.amber}" stroke-width="2.5" stroke-linecap="round" />`;
  const xs = [32, 160, 326, 420, 536];
  const ws = [92, 130, 58, 80, 64];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 150" role="img" aria-label="${ariaLabel}">
  <path d="M32,28 L32,20 L516,20 L516,28" fill="none" stroke="${P.line}" stroke-width="1.2" />
  ${text(274, 14, measure, { size: FS.small, color: P.muted, italic: true })}
  ${wordBox(xs[0]!, ws[0]!, words[0]!)}
  ${spring(xs[0]! + ws[0]! + 6, 63)}
  ${wordBox(xs[1]!, ws[1]!, words[1]!)}
  ${spring(xs[1]! + ws[1]! + 6, 63)}
  ${wordBox(xs[2]!, ws[2]!, words[2]!)}
  ${spring(xs[2]! + ws[2]! + 5, 63)}
  ${wordBox(xs[3]!, ws[3]!, words[3]!)}
  ${hyphen(506, 63, 10)}
  <path d="M511,56 L511,34 L524,38 L511,42" fill="${P.amber}" stroke="${P.amber}" stroke-width="1" stroke-linejoin="round" />
  ${wordBox(xs[4]!, ws[4]!, words[4]!, true)}
  <line x1="32" y1="104" x2="600" y2="104" stroke="${P.hair}" stroke-width="1" />
  <rect x="32" y="118" width="18" height="13" rx="3" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.2" />
  ${text(58, 128.5, box, { size: FS.label, anchor: 'start' })}
  ${spring(150, 124.5)}
  ${text(186, 128.5, glue, { size: FS.label, anchor: 'start' })}
  ${hyphen(286, 124.5, 14)}
  ${text(308, 128.5, penalty, { size: FS.label, anchor: 'start' })}
</svg>`;
}

/** Two columns whose text lines snap to a shared horizontal baseline grid, with
 *  one dashed guide showing the cross-column alignment. */
function baselineGridSvg(es: boolean): string {
  const label = es ? 'Rejilla de línea base' : 'Baseline grid';
  const ariaLabel = es ? 'alineación a la rejilla de línea base' : 'baseline grid alignment';
  const gridYs = [34, 52, 70, 88, 106, 124];
  const grid = gridYs
    .map((y) => `<line x1="18" y1="${y}" x2="282" y2="${y}" stroke="${P.hair}" stroke-width="1" />`)
    .join('\n  ');
  // Text-line bars rest on the grid: each bar's bottom edge is a baseline.
  const leftWidths = [100, 94, 100, 88, 100, 96];
  const rightWidths = [96, 100, 90, 100, 94, 100];
  const left = gridYs.map((y, i) => bar(26, y - 7, leftWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  const right = gridYs.map((y, i) => bar(174, y - 7, rightWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  const pillW = es ? 144 : 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 170" role="img" aria-label="${ariaLabel}">
  ${grid}
  ${left}
  ${right}
  <line x1="18" y1="88" x2="282" y2="88" stroke="${P.blue}" stroke-width="1.4" stroke-dasharray="5 4" />
  <rect x="${150 - pillW / 2}" y="142" width="${pillW}" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" stroke-width="1" />
  ${text(150, 155.5, label, { size: FS.label, color: P.blueDark, weight: 600 })}
</svg>`;
}

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads.
 *  Widths follow the shared unit system: COLUMN_VW for column-span figures,
 *  PAGE_VW for page-span ones (see FIGURE_SPECS placements). */
export const SVG_FIGURES: Record<string, { generate: (es: boolean) => string; width: number; height: number }> = {
  'default-guide-cover': { generate: coverArtSvg, width: COVER_VW, height: COVER_VH },
  'default-layout-pipeline': { generate: pipelineSvg, width: COLUMN_VW, height: 300 },
  'default-convergence-loop': { generate: convergenceLoopSvg, width: PAGE_VW, height: 170 },
  'default-measurement-speed': { generate: measurementSpeedSvg, width: COLUMN_VW, height: 190 },
  'default-orphan-widow': { generate: orphanWidowSvg, width: COLUMN_VW, height: 180 },
  'default-knuth-plass': { generate: knuthPlassSvg, width: PAGE_VW, height: 150 },
  'default-baseline-grid': { generate: baselineGridSvg, width: COLUMN_VW, height: 170 },
  'default-column-layouts': { generate: columnLayoutsSvg, width: PAGE_VW, height: 196 },
  'default-float-slots': { generate: floatSlotsSvg, width: PAGE_VW, height: 214 },
  'default-balancing': { generate: balancingSvg, width: PAGE_VW, height: 200 },
  'default-book-anatomy': { generate: bookAnatomySvg, width: PAGE_VW, height: 168 },
  'default-sandbox-ui': { generate: sandboxUiSvg, width: PAGE_VW, height: 322 },
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
        ['Capacidad', 'CSS', 'Postext'],
        [
          ['Columnas equilibradas según su contenido', 'Parcial', yes],
          ['Huérfanas, viudas y líneas cortas', 'Desigual', yes],
          ['Corte de párrafo óptimo (Knuth-Plass)', 'No', yes],
          ['Figuras que flotan tras su referencia', 'No', yes],
          ['Rejilla de línea base entre columnas', 'No', yes],
          ['Cabeceras, folios e índice paginado', 'No', yes],
          ['PDF etiquetado desde la misma fuente', 'No', yes],
        ],
      )
    : table(
        ['Capability', 'CSS', 'Postext'],
        [
          ['Columns balanced by their content', 'Partial', yes],
          ['Orphans, widows and runts', 'Uneven', yes],
          ['Optimal paragraph breaking (Knuth-Plass)', 'No', yes],
          ['Figures that float after their reference', 'No', yes],
          ['Baseline grid across columns', 'No', yes],
          ['Running heads, folios and a paginated contents', 'No', yes],
          ['Tagged PDF from the same source', 'No', yes],
        ],
      );
}

function toolsTableModel(es: boolean): TableModel {
  const full = es ? '**Completo**' : '**Full**';
  const yes = es ? '**Sí**' : '**Yes**';
  const basic = es ? 'Básico' : 'Basic';
  const partial = es ? 'Parcial' : 'Partial';
  return es
    ? table(
        ['Herramienta', 'Control editorial', 'En la web', 'Incrustable', 'Fuente abierta'],
        [
          ['Procesadores de texto', basic, partial, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No', 'No'],
          ['LaTeX', full, 'No', 'No', yes],
          ['CSS paginado', partial, yes, partial, yes],
          ['Postext', full, yes, yes, yes],
        ],
      )
    : table(
        ['Tool', 'Editorial control', 'On the web', 'Embeddable', 'Open source'],
        [
          ['Word processors', basic, partial, 'No', 'No'],
          ['Adobe InDesign', full, 'No', 'No', 'No'],
          ['LaTeX', full, 'No', 'No', yes],
          ['Paged CSS', partial, yes, partial, yes],
          ['Postext', full, yes, yes, yes],
        ],
      );
}

function placementTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Campo', 'Valores', 'Efecto'],
        [
          ['position', 'auto · top · bottom · here', 'Primer hueco libre, cabeza o pie de columna, o en el punto exacto'],
          ['span', 'column · page · side', 'Una columna, toda la página o la columna lateral'],
          ['width', '0–1', 'Fracción del ancho disponible'],
          ['align', 'left · center · right', 'Posición dentro de ese ancho'],
          ['rotate', 'ccw · cw', 'Un cuarto de vuelta, en página propia'],
          ['captionSide', 'sí · no', 'Pie en la columna lateral'],
        ],
      )
    : table(
        ['Field', 'Values', 'Effect'],
        [
          ['position', 'auto · top · bottom · here', 'First free slot, head or foot of a column, or the exact point'],
          ['span', 'column · page · side', 'One column, the whole page or the side column'],
          ['width', '0–1', 'Fraction of the width available'],
          ['align', 'left · center · right', 'Position within that width'],
          ['rotate', 'ccw · cw', 'A quarter turn, on a page of its own'],
          ['captionSide', 'yes · no', 'Caption in the side column'],
        ],
      );
}

function documentFormatTableModel(es: boolean): TableModel {
  return es
    ? table(
        ['Sintaxis', 'Qué hace'],
        [
          [':::pagebreak', 'Nueva página; parity="odd" u "even" fuerza recto o verso'],
          [':::columnbreak', 'Termina la columna actual'],
          [':::numbering', 'Cambia la secuencia de folios: formato y número inicial'],
          [':::toc', 'Imprime el índice, con folios reales'],
          [':::part', 'Abre una portadilla de parte, con título, número y paleta'],
          [':::callout', 'Recuadro de un estilo: nota, cita, cifras…'],
          [':::columns', 'Columnas equilibradas dentro de un recuadro'],
          [':::paragraphs', 'Aplica un estilo de párrafo a lo que envuelve'],
          [':ref', 'Cita un recurso, lo numera y lo hace flotar'],
          ['::resource', 'Inserta un recurso en el punto exacto'],
          [':swatch', 'Muestra de color en línea'],
          ['# Título {style="…"}', 'Estilo de título y atributos para los diseños'],
        ],
      )
    : table(
        ['Syntax', 'What it does'],
        [
          [':::pagebreak', 'A new page; parity="odd" or "even" asks for a recto or verso'],
          [':::columnbreak', 'Ends the current column'],
          [':::numbering', 'Switches the page-number sequence: format and start'],
          [':::toc', 'Prints the table of contents, with real page numbers'],
          [':::part', 'Opens a part divider, with a title, number and palette'],
          [':::callout', 'A box in one of the callout styles: note, quote, figures…'],
          [':::columns', 'Balanced columns inside a callout'],
          [':::paragraphs', 'Applies a paragraph style to what it wraps'],
          [':ref', 'Mentions a resource, numbers it and floats it'],
          ['::resource', 'Embeds a resource at the exact point'],
          [':swatch', 'An inline colour swatch'],
          ['# Title {style="…"}', 'A heading style, and attributes for the designs'],
        ],
      );
}

function presetTableModel(es: boolean): TableModel {
  const custom = es ? 'Personalizado' : 'Custom';
  const any = es ? 'Cualquier formato, en cm, mm, pulgadas o puntos' : 'Any format, in cm, mm, inches or points';
  return es
    ? table(
        ['Tamaño', 'Uso habitual'],
        [
          ['11 × 17 cm', 'Guías de bolsillo'],
          ['12 × 19 cm', 'Novelas de bolsillo'],
          ['17 × 24 cm', 'Libros de texto y manuales'],
          ['21 × 28 cm', 'Revistas, gran formato y esta guía'],
          [custom, any],
        ],
      )
    : table(
        ['Size', 'Typical use'],
        [
          ['11 × 17 cm', 'Pocket guides'],
          ['12 × 19 cm', 'Fiction paperbacks'],
          ['17 × 24 cm', 'Textbooks and manuals'],
          ['21 × 28 cm', 'Magazines, large formats and this guide'],
          [custom, any],
        ],
      );
}

function phasesTableModel(es: boolean): TableModel {
  const done = es ? '**Hecho**' : '**Shipped**';
  const open = es ? 'Abierto' : 'Open';
  return es
    ? table(
        ['Fase', 'Hecho', 'Pendiente'],
        [
          ['1 · Fundamentos', 'Modelo de datos, parser, medición sin DOM, formato del documento', open + ': cerrar el formato de configuración'],
          ['2 · Maquetación editorial', 'Columnas, equilibrado, flotantes, tablas que se parten o giran, libros y partes', open + ': texto que rodea obstáculos'],
          ['3 · Tipografía profesional', 'Knuth-Plass, separación silábica en 8 idiomas, huérfanas, viudas y líneas cortas, matemáticas', open + ': notas al pie, notas finales y al margen'],
          ['4 · Salida', 'Canvas, HTML, PDF etiquetado, worker, Sandbox con presets', done],
        ],
      )
    : table(
        ['Phase', 'Shipped', 'Still open'],
        [
          ['1 · Foundation', 'Data model, parser, DOM-free measurement, document format', open + ': finalise the configuration format'],
          ['2 · Editorial layout', 'Columns, balancing, floats, tables that split or rotate, books and parts', open + ': text flowing around obstacles'],
          ['3 · Professional typography', 'Knuth-Plass, hyphenation in 8 languages, orphans, widows and runts, mathematics', open + ': footnotes, endnotes and margin notes'],
          ['4 · Output', 'Canvas, HTML, tagged PDF, worker, Sandbox with presets', done],
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

const T = (en: string, es: string) => (isEsLocale: boolean) => (isEsLocale ? es : en);

const FIGURE_SPECS: FigureSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.cover,
    fileId: 'default-guide-cover',
    placement: { position: 'top', span: 'page' },
    caption: T('Cover art of the guide.', 'Arte de cubierta de la guía.'),
    altText: T(
      'An open spread drawn the way the engine sees it: justified lines of word boxes, a chapter band, a floated figure and one line opened into boxes, glue and a penalty.',
      'Un pliego abierto dibujado como lo ve el motor: líneas justificadas de cajas de palabra, una banda de capítulo, una figura flotante y una línea abierta en cajas, gomas y una penalización.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.layoutPipeline,
    fileId: 'default-layout-pipeline',
    placement: { position: 'auto', span: 'column' },
    caption: T(
      'The pipeline: Markdown and a configuration are parsed, measured and laid out, in a loop of at most five passes, into the VDT that all three renderers draw.',
      'La tubería: el Markdown y la configuración se analizan, se miden y se maquetan, en un bucle de cinco pasadas como mucho, hasta el VDT que dibujan los tres renderizadores.',
    ),
    altText: T(
      'Markdown and Configuration flow into Parse, Measure and Layout, which loops on itself, then into the VDT and out to Canvas, HTML and PDF.',
      'Markdown y Configuración entran en Análisis, Medición y Maquetación, que vuelve sobre sí misma; después el VDT y las salidas Canvas, HTML y PDF.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.measurementSpeed,
    fileId: 'default-measurement-speed',
    placement: { position: 'auto', span: 'column' },
    caption: T(
      'Measuring with canvas metrics and arithmetic instead of DOM reflow is 300 to 600 times faster.',
      'Medir con métricas de canvas y aritmética, en lugar de reflujos del DOM, es entre 300 y 600 veces más rápido.',
    ),
    altText: T(
      'A tall bar for DOM-based measurement beside a tiny bar for DOM-free measurement, annotated 300–600× faster.',
      'Una barra alta para la medición con DOM junto a una barra diminuta para la medición sin DOM, con la anotación 300–600× más rápido.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.convergenceLoop,
    fileId: 'default-convergence-loop',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'The convergence loop: place, check, adjust what conflicts and place again, until nothing moves — five iterations at most, usually one or two.',
      'El bucle de convergencia: colocar, comprobar, ajustar lo que choca y volver a colocar hasta que nada se mueva; cinco iteraciones como mucho, casi siempre una o dos.',
    ),
    altText: T(
      'A flow from Place to Check to Converged, with a conflict branch through Adjust looping back to Place, capped at five iterations.',
      'Un flujo de Colocar a Comprobar y a Convergido, con una rama de conflicto por Ajustar que vuelve a Colocar, limitada a cinco iteraciones.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.knuthPlass,
    fileId: 'default-knuth-plass',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'Knuth-Plass sees a line as boxes, glue and penalties; the flagged penalty is a hyphenation point, and the ratio r measures how far the glue stretches.',
      'Knuth-Plass ve una línea como cajas, gomas y penalizaciones; la penalización marcada es un punto de guion y la razón r mide cuánto se estiran las gomas.',
    ),
    altText: T(
      'The words Every paragraph is balan- ced as boxes joined by springs, a hyphen penalty with a flag, and a legend.',
      'Las palabras Cada párrafo se equili- bra como cajas unidas por muelles, una penalización de guion con bandera y una leyenda.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.orphanWidow,
    fileId: 'default-orphan-widow',
    placement: { position: 'auto', span: 'column' },
    caption: T(
      'A widow at the foot of one column and an orphan at the head of the next: the two defects the split optimiser prices.',
      'Una viuda al pie de una columna y una huérfana en la cabeza de la siguiente: los dos defectos que pondera el optimizador de cortes.',
    ),
    altText: T(
      'Two columns: the left ends with a lone short line, the right begins with a lone line.',
      'Dos columnas: la izquierda termina con una línea corta sola y la derecha empieza con una línea sola.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.columnLayouts,
    fileId: 'default-column-layouts',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'The column structures: one column, two, and a column and a half whose side column carries text or only floats.',
      'Las estructuras de columnas: una, dos y columna y media, cuya columna lateral lleva texto o solo flotantes.',
    ),
    altText: T(
      'Four page thumbnails: single column, two columns, a main column with a narrow text column, and a main column with figures and boxes in the side column.',
      'Cuatro miniaturas de página: una columna, dos columnas, una columna principal con otra estrecha de texto y una columna principal con figuras y recuadros en la lateral.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.baselineGrid,
    fileId: 'default-baseline-grid',
    placement: { position: 'bottom', span: 'column' },
    caption: T(
      'The baseline grid sets every line on a shared rhythm, so lines face each other across the gutter.',
      'La rejilla de línea base asienta cada línea en un ritmo común, de modo que las líneas se miran a través del medianil.',
    ),
    altText: T(
      'Two columns of lines resting on a shared horizontal grid, with a dashed alignment guide.',
      'Dos columnas de líneas apoyadas en una rejilla horizontal común, con una guía discontinua.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.balancing,
    fileId: 'default-balancing',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'Balancing a short column: a grid line above a heading, a line after a list and a paragraph set one line looser bring it level with its neighbour.',
      'Equilibrar una columna corta: una línea de rejilla sobre un título, una línea tras una lista y un párrafo compuesto una línea más suelto la igualan con su vecina.',
    ),
    altText: T(
      'Two page sketches: before, the second column ends three lines short; after, the three levers are highlighted and both columns end level.',
      'Dos esbozos de página: antes, la segunda columna acaba tres líneas más corta; después, las tres palancas aparecen resaltadas y ambas columnas acaban a la par.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.floatSlots,
    fileId: 'default-float-slots',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'Where a float lands: the slots after its reference are tried in order — the foot of the same column, the head of the next, a band on the next page — and the first with room wins.',
      'Dónde cae un flotante: los huecos tras su referencia se prueban en orden —el pie de la misma columna, la cabeza de la siguiente, una banda en la página siguiente— y gana el primero con sitio.',
    ),
    altText: T(
      'A page with a reference near the foot of column 1; slot 1 below it has no room, slot 2 at the head of column 2 is filled; slot 3 on the next page is not needed.',
      'Una página con una referencia cerca del pie de la columna 1; el hueco 1 no tiene sitio, el hueco 2 en la cabeza de la columna 2 está ocupado y el hueco 3, en la página siguiente, no hace falta.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.bookAnatomy,
    fileId: 'default-book-anatomy',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'The anatomy of this book: a cover set by a heading style, a self-numbering contents, a part divider, a chapter opener and body pages with running heads.',
      'La anatomía de este libro: una cubierta compuesta con un estilo de título, un índice que se numera solo, una portadilla de parte, una apertura de capítulo y páginas de cuerpo con cabeceras.',
    ),
    altText: T(
      'Six page thumbnails: a dark cover, a contents page with leaders, a gilt part page, a chapter opener with a band, and two body pages.',
      'Seis miniaturas: una cubierta oscura, un índice con puntos guía, una portadilla dorada, una apertura con banda y dos páginas de cuerpo.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.sandboxUi,
    fileId: 'default-sandbox-ui',
    placement: { position: 'top', span: 'page' },
    caption: T(
      'The Sandbox: the activity bar with its six panels, the Markdown editor with the chapter switcher, and the viewport with its Canvas, HTML and PDF tabs.',
      'El Sandbox: la barra de actividad con sus seis paneles, el editor de Markdown con el selector de capítulos y el visor con sus pestañas Canvas, HTML y PDF.',
    ),
    altText: T(
      'Interface sketch: a column of six icons, an editor panel with a chapter title, and a viewport showing a two-page spread.',
      'Esbozo de la interfaz: una columna de seis iconos, un panel de editor con el título del capítulo y un visor con un pliego de dos páginas.',
    ),
  },
];

const TABLE_SPECS: TableSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.featureTable,
    model: featureTableModel,
    placement: { position: 'top', span: 'page' },
    caption: T('What editorial layout needs, in plain CSS and in Postext.', 'Lo que necesita la maquetación editorial, en CSS y en Postext.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.toolsTable,
    model: toolsTableModel,
    placement: { position: 'top', span: 'page' },
    caption: T('How Postext compares with established editorial tools.', 'Cómo se sitúa Postext frente a las herramientas editoriales establecidas.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementTable,
    model: placementTableModel,
    placement: { position: 'top', span: 'page' },
    caption: T('The placement fields of a resource.', 'Los campos de colocación de un recurso.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.documentFormatTable,
    model: documentFormatTableModel,
    placement: { position: 'top', span: 'page' },
    caption: T('The extensions of the document format.', 'Las extensiones del formato del documento.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.presetTable,
    model: presetTableModel,
    placement: { position: 'auto', span: 'column' },
    caption: T('Preset page sizes and their typical use.', 'Tamaños de página predefinidos y su uso habitual.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.phasesTable,
    model: phasesTableModel,
    placement: { position: 'top', span: 'page' },
    caption: T('The four phases of the project: what has shipped and what is still open.', 'Las cuatro fases del proyecto: lo que ya está hecho y lo que sigue abierto.'),
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
        // The blob may replace an earlier seed under the same fileId (reset,
        // locale switch) — drop any cached decode so viewers re-register it.
        invalidateResourceImage(fileId);
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
