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
//
// Every word a figure, table, caption or alternative text prints is given
// once per edition of the guide (English, Spanish, Simplified Chinese; see
// `lang.ts`).

import type { Resource, ResourcePlacement, TableCell, TableModel } from 'postext';
import { invalidateResourceImage } from '../controls/resourceImages';
import { putBlobAt } from '../storage/blobStore';
import { COVER_VH, COVER_VW, COVER_ZH_VH, COVER_ZH_VW, coverArtSvg, coverArtVerticalSvg } from './cover';
import { GUIDE_LANGS, byLang, guideLang, type ByLang, type GuideLang } from './lang';

export { GUIDE_LANGS, guideLang, type GuideLang } from './lang';

/** Stable ids referenced by the default markdown (en.ts / es.ts / zh-Hans.ts).
 *  Keys are internal; the string *values* are the ids the markdown's
 *  `:ref{id=…}` directives resolve against, so they must stay in sync with
 *  the markdown. */
export const DEFAULT_RESOURCE_IDS = {
  // Cover artwork (a design image of the cover heading style, never referenced)
  cover: 'guide-cover',
  // Figures (SVG)
  layoutPipeline: 'layout-pipeline',
  convergenceLoop: 'convergence-loop',
  measurementSpeed: 'measurement-speed',
  orphanWidow: 'orphan-widow',
  knuthPlass: 'knuth-plass-model',
  cjkComposition: 'cjk-composition',
  baselineGrid: 'baseline-grid',
  columnLayouts: 'column-layouts',
  balancing: 'column-balancing',
  floatSlots: 'float-slots',
  bookAnatomy: 'book-anatomy',
  vectorRosette: 'vector-rosette',
  vectorChart: 'vector-chart',
  vectorClip: 'vector-clip',
  sandboxUi: 'sandbox-ui',
  // Tables
  featureTable: 'feature-comparison',
  toolsTable: 'tools-comparison',
  placementTable: 'placement-options',
  documentFormatTable: 'document-format',
  presetTable: 'preset-sizes',
  phasesTable: 'development-phases',
  paperStocksTable: 'paper-stocks',
} as const;

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
//
// A Chinese label is about one em per character (FS.label: 11.5 units), so
// the Chinese wording is kept to what fits the boxes the Latin labels sit in.
// ───────────────────────────────────────────────────────────────────────────

import { COLUMN_VW, DEFS, FS, P, PAGE_VW, bar, edge, localizeFigureFonts, node, text } from './svgKit';
import { balancingSvg, bookAnatomySvg, cjkCompositionSvg, columnLayoutsSvg, floatSlotsSvg, sandboxUiSvg, vectorChartSvg, vectorClipSvg, vectorRosetteSvg } from './guideFigures';

const PIPELINE = byLang(
  { parse: 'Parse', measure: 'Measure', layout: 'Layout', config: 'Configuration', loop: ['at most', '5 passes'], aria: 'Postext pipeline' },
  { parse: 'Análisis', measure: 'Medición', layout: 'Maquetación', config: 'Configuración', loop: ['hasta', '5 pasadas'], aria: 'tubería de Postext' },
  { parse: '解析', measure: '测量', layout: '排版', config: '配置', loop: ['最多5轮'], aria: 'Postext的处理流水线' },
  { parse: 'Anàlisi', measure: 'Mesura', layout: 'Maquetació', config: 'Configuració', loop: ['fins a', '5 passades'], aria: 'cadena de processament de Postext' },
);

/** The Postext pipeline: Markdown and configuration → parse → measure →
 *  layout (the convergence loop) → the VDT, read by three renderers. A
 *  column-span figure, so the stages stack vertically and fan out to the
 *  output chips at the foot. The stage fills deepen top to bottom (source →
 *  engine). */
function pipelineSvg(lang: GuideLang): string {
  const { parse, measure, layout, config, loop, aria: ariaLabel } = PIPELINE[lang];
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
  ${edge('M205,184 C236,184 236,200 205,200', { color: P.amber, marker: 'ahAmber' })}
  ${loop.map((l, i, all) => text(240, 196 + (i - (all.length - 1) / 2) * 12, l, { size: FS.small, color: P.amberDark, anchor: 'start', italic: true })).join('\n  ')}
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

const CONVERGENCE = byLang(
  { place: 'Place', check: 'Check', adjust: 'Adjust', done: 'Converged', ok: 'satisfied', conflict: 'conflict', iters: 'at most 5 iterations', aria: 'layout convergence loop', itersWidth: 112 },
  { place: 'Colocar', check: 'Comprobar', adjust: 'Ajustar', done: 'Convergido', ok: 'cumple', conflict: 'conflicto', iters: 'hasta 5 iteraciones', aria: 'bucle de convergencia de la maquetación', itersWidth: 110 },
  { place: '排布', check: '检查', adjust: '调整', done: '收敛', ok: '满足', conflict: '冲突', iters: '最多5轮', aria: '排版的收敛循环', itersWidth: 72 },
  { place: 'Col·locar', check: 'Comprovar', adjust: 'Ajustar', done: 'Convergit', ok: 'compleix', conflict: 'conflicte', iters: 'fins a 5 iteracions', aria: 'bucle de convergència de la maquetació', itersWidth: 110 },
);

/** The convergence loop: place → check → (conflict ⇒ adjust ⇒ back) until the
 *  constraints are satisfied, capped at five iterations. Distinct from the
 *  pipeline figure. */
function convergenceLoopSvg(lang: GuideLang): string {
  const { place, check, adjust, done, ok, conflict, iters, aria: ariaLabel, itersWidth } = CONVERGENCE[lang];
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

const SPEED = byLang(
  { withDom: 'DOM-based', withoutDom: 'DOM-free', faster: 'faster', time: 'time', aria: 'speed comparison between DOM-based and DOM-free measurement' },
  { withDom: 'Con DOM', withoutDom: 'Sin DOM', faster: 'más rápido', time: 'tiempo', aria: 'comparación de velocidad entre medición con y sin DOM' },
  { withDom: '借助DOM', withoutDom: '不借助DOM', faster: '更快', time: '耗时', aria: '借助DOM与不借助DOM的测量速度对比' },
  { withDom: 'Amb DOM', withoutDom: 'Sense DOM', faster: 'més ràpid', time: 'temps', aria: 'comparació de velocitat entre la mesura amb DOM i sense DOM' },
);

/** A two-bar chart contrasting DOM-based measurement with DOM-free measurement,
 *  annotated with the 300–600× speed-up. */
function measurementSpeedSvg(lang: GuideLang): string {
  const { withDom, withoutDom, faster: fasterWord, time: timeAxis, aria: ariaLabel } = SPEED[lang];
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

/** The two labels of the orphan-and-widow figure: the one under the foot of
 *  the left column and the one over the head of the right. The Latin
 *  editions follow the engine's names (`avoidWidows` at a column's foot,
 *  `avoidOrphans` at the next one's head); the Chinese edition names them by
 *  place, as its text does (段首孤行 at the foot: a paragraph's first line;
 *  段末孤行 at the head: its last). */
const ORPHAN_WIDOW = byLang(
  { foot: 'Widow', head: 'Orphan', aria: 'widow and orphan lines across columns' },
  { foot: 'Viuda', head: 'Huérfana', aria: 'líneas viuda y huérfana entre columnas' },
  { foot: '段首孤行', head: '段末孤行', aria: '分栏处两侧的段首孤行与段末孤行' },
  { foot: 'Vídua', head: 'Òrfena', aria: 'línies vídua i òrfena entre columnes' },
);

/** Two columns of text lines illustrating a widow (lone last line at the foot of
 *  a column) and an orphan (lone first line at the head of the next). In
 *  the Chinese edition the stranded lines are drawn the way its names read
 *  them: a full first line at the foot, a short last line at the head. */
function orphanWidowSvg(lang: GuideLang): string {
  const { foot: widow, head: orphan, aria: ariaLabel } = ORPHAN_WIDOW[lang];
  const zh = lang === 'zh-Hans';
  // Full body lines fill the left column; its paragraph's last line strands
  // alone at the foot. The continuation paragraph opens the right column with
  // a lone first line before the next paragraph begins.
  const leftWidths = [96, 90, 96, 86, 96, 92, 96, 88, 94];
  const leftLines = leftWidths.map((w, i) => bar(26, 32 + i * 12, w)).join('\n  ');
  const rightWidths = [92, 96, 86, 96, 90, 96, 84, 94];
  const rightLines = rightWidths.map((w, i) => bar(178, 56 + i * 12, w)).join('\n  ');
  const footLine = zh ? bar(36, 144, 86, P.amber) : bar(26, 144, 56, P.amber);
  const headLine = zh ? bar(178, 32, 52, P.amber) : bar(178, 32, 96, P.amber);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 180" role="img" aria-label="${ariaLabel}">
  <rect x="16" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="168" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${leftLines}
  ${footLine}
  ${text(74, 175, widow, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${headLine}
  ${text(226, 13, orphan, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${rightLines}
</svg>`;
}

const KNUTH_PLASS = byLang(
  {
    box: 'Box', glue: 'Glue', penalty: 'Penalty', measure: 'line measure · r = 0.42 · badness 7',
    aria: 'Knuth-Plass primitives: boxes, glue and penalties',
  },
  {
    box: 'Caja', glue: 'Goma', penalty: 'Penalización', measure: 'medida de la línea · r = 0,42 · medianía 7',
    aria: 'primitivas de Knuth-Plass: cajas, gomas y penalizaciones',
  },
  {
    box: '盒子', glue: '粘连', penalty: '惩罚值', measure: '行长 · r = 0.42 · 劣度 7',
    aria: 'Knuth–Plass算法的基本单元：盒子、粘连和惩罚值',
  },
  {
    box: 'Caixa', glue: 'Goma', penalty: 'Penalització', measure: 'mesura de la línia · r = 0,42 · mediania 7',
    aria: 'primitives de Knuth-Plass: caixes, gomes i penalitzacions',
  },
);
/** The words of the example line. The algorithm sets Western paragraphs, so
 *  the Chinese edition shows the English line. */
const KP_WORDS = byLang(
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'párrafo', 'se', 'equili', 'bra'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'paràgraf', 'és', 'equili', 'brat'],
);

/** The Knuth-Plass primitives on a real line: word boxes, glue springs
 *  between them and a flagged penalty where the word would hyphenate, the
 *  measure the line is justified to above, and a legend. */
function knuthPlassSvg(lang: GuideLang): string {
  const { box, glue, penalty, measure, aria: ariaLabel } = KNUTH_PLASS[lang];
  const words = KP_WORDS[lang];
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

const BASELINE = byLang(
  { label: 'Baseline grid', aria: 'baseline grid alignment', pillW: 100 },
  { label: 'Rejilla de línea base', aria: 'alineación a la rejilla de línea base', pillW: 144 },
  { label: '基线网格', aria: '文字对齐基线网格', pillW: 76 },
  { label: 'Retícula de línia de base', aria: 'alineació a la retícula de línia de base', pillW: 172 },
);

/** Two columns whose text lines snap to a shared horizontal baseline grid, with
 *  one dashed guide showing the cross-column alignment. */
function baselineGridSvg(lang: GuideLang): string {
  const { label, aria: ariaLabel, pillW } = BASELINE[lang];
  const gridYs = [34, 52, 70, 88, 106, 124];
  const grid = gridYs
    .map((y) => `<line x1="18" y1="${y}" x2="282" y2="${y}" stroke="${P.hair}" stroke-width="1" />`)
    .join('\n  ');
  // Text-line bars rest on the grid: each bar's bottom edge is a baseline.
  const leftWidths = [100, 94, 100, 88, 100, 96];
  const rightWidths = [96, 100, 90, 100, 94, 100];
  const left = gridYs.map((y, i) => bar(26, y - 7, leftWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  const right = gridYs.map((y, i) => bar(174, y - 7, rightWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 170" role="img" aria-label="${ariaLabel}">
  ${grid}
  ${left}
  ${right}
  <line x1="18" y1="88" x2="282" y2="88" stroke="${P.blue}" stroke-width="1.4" stroke-dasharray="5 4" />
  <rect x="${150 - pillW / 2}" y="142" width="${pillW}" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" stroke-width="1" />
  ${text(150, 155.5, label, { size: FS.label, color: P.blueDark, weight: 600 })}
</svg>`;
}

/** An SVG figure: its generator per edition and its canvas size. */
export interface GuideFigure {
  generate: (lang: GuideLang) => string;
  width: number;
  height: number;
  /** A size of its own in an edition drawn to other proportions. */
  sizeIn?: Partial<Record<GuideLang, { width: number; height: number }>>;
}

/** A figure's canvas size in an edition. */
export function figureSize(fig: GuideFigure, lang: GuideLang): { width: number; height: number } {
  return fig.sizeIn?.[lang] ?? { width: fig.width, height: fig.height };
}

/** A figure drawn with the kit: the Chinese edition's labels are set in the
 *  Chinese label face (see `localizeFigureFonts`). */
const drawn = (draw: (lang: GuideLang) => string) => (lang: GuideLang): string => localizeFigureFonts(draw(lang), lang === 'zh-Hans');

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads.
 *  Widths follow the shared unit system: COLUMN_VW for column-span figures,
 *  PAGE_VW for page-span ones (see FIGURE_SPECS placements). */
export const SVG_FIGURES: Record<string, GuideFigure> = {
  // The Chinese edition, a vertical book, has a portrait cover: one of its
  // own pages beside the title strip.
  'default-guide-cover': {
    generate: (lang) => (lang === 'zh-Hans' ? coverArtVerticalSvg() : coverArtSvg(lang)),
    width: COVER_VW, height: COVER_VH,
    sizeIn: { 'zh-Hans': { width: COVER_ZH_VW, height: COVER_ZH_VH } },
  },
  'default-layout-pipeline': { generate: drawn(pipelineSvg), width: COLUMN_VW, height: 300 },
  'default-convergence-loop': { generate: drawn(convergenceLoopSvg), width: PAGE_VW, height: 170 },
  'default-measurement-speed': { generate: drawn(measurementSpeedSvg), width: COLUMN_VW, height: 190 },
  'default-orphan-widow': { generate: drawn(orphanWidowSvg), width: COLUMN_VW, height: 180 },
  'default-knuth-plass': { generate: drawn(knuthPlassSvg), width: PAGE_VW, height: 150 },
  'default-cjk-composition': { generate: drawn(cjkCompositionSvg), width: PAGE_VW, height: 232 },
  'default-baseline-grid': { generate: drawn(baselineGridSvg), width: COLUMN_VW, height: 170 },
  'default-column-layouts': { generate: drawn(columnLayoutsSvg), width: PAGE_VW, height: 196 },
  'default-float-slots': { generate: drawn(floatSlotsSvg), width: PAGE_VW, height: 214 },
  'default-balancing': { generate: drawn(balancingSvg), width: PAGE_VW, height: 200 },
  'default-book-anatomy': { generate: drawn(bookAnatomySvg), width: PAGE_VW, height: 168 },
  'default-sandbox-ui': { generate: drawn(sandboxUiSvg), width: PAGE_VW, height: 322 },
  'default-vector-rosette': { generate: drawn(vectorRosetteSvg), width: PAGE_VW, height: 222 },
  'default-vector-chart': { generate: drawn(vectorChartSvg), width: PAGE_VW, height: 186 },
  'default-vector-clip': { generate: drawn(vectorClipSvg), width: PAGE_VW, height: 170 },
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

function featureTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    const yes = '**支持**';
    return table(
      ['能力', 'CSS', 'Postext'],
      [
        ['按内容平衡各栏', '部分支持', yes],
        ['段首孤行、段末孤行与孤字', '参差不齐', yes],
        ['最优断行（Knuth–Plass）', '不支持', yes],
        ['图在引用之后浮动到位', '不支持', yes],
        ['跨栏的基线网格', '不支持', yes],
        ['书眉、页码和带页码的目录', '不支持', yes],
        ['同一份源文本生成带标签的PDF', '不支持', yes],
      ],
    );
  }
  if (lang === 'ca') {
    const yes = '**Sí**';
    return table(
      ['Capacitat', 'CSS', 'Postext'],
      [
        ['Columnes equilibrades segons el contingut', 'Parcial', yes],
        ['Òrfenes, vídues i línies curtes', 'Desigual', yes],
        ['Tall de paràgraf òptim (Knuth-Plass)', 'No', yes],
        ['Figures que floten després de la referència', 'No', yes],
        ['Retícula de línia de base entre columnes', 'No', yes],
        ['Capçaleres, folis i índex paginat', 'No', yes],
        ['PDF etiquetat des de la mateixa font', 'No', yes],
      ],
    );
  }
  const es = lang === 'es';
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

function toolsTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    const full = '**完整**';
    const yes = '**是**';
    const basic = '基本';
    const partial = '部分';
    return table(
      ['工具', '出版级控制', '用于网页', '可嵌入', '开源'],
      [
        ['文字处理软件', basic, partial, '否', '否'],
        ['Adobe InDesign', full, '否', '否', '否'],
        ['LaTeX', full, '否', '否', yes],
        ['分页CSS', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'ca') {
    const full = '**Complet**';
    const yes = '**Sí**';
    const basic = 'Bàsic';
    const partial = 'Parcial';
    return table(
      ['Eina', 'Control editorial', 'Al web', 'Incrustable', 'Codi obert'],
      [
        ['Processadors de text', basic, partial, 'No', 'No'],
        ['Adobe InDesign', full, 'No', 'No', 'No'],
        ['LaTeX', full, 'No', 'No', yes],
        ['CSS paginat', partial, yes, partial, yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  const es = lang === 'es';
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

function placementTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    return table(
      ['字段', '取值', '作用'],
      [
        ['position', 'auto · top · bottom · here', '第一个空位、栏顶或栏底，或者正好在引用处'],
        ['span', 'column · page · side', '一栏宽、通栏或边栏'],
        ['width', '0–1', '占可用宽度的比例'],
        ['align', 'left · center · right', '在这个宽度内的位置'],
        ['rotate', 'ccw · cw', '转90度，单独占一页'],
        ['captionSide', 'true · false', '题注排在边栏'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Camp', 'Valors', 'Efecte'],
      [
        ['position', 'auto · top · bottom · here', 'Primer espai lliure, capdamunt o peu de columna, o al punt exacte'],
        ['span', 'column · page · side', 'Una columna, tota la pàgina o la columna lateral'],
        ['width', '0–1', 'Fracció de l\'amplada disponible'],
        ['align', 'left · center · right', 'Posició dins d\'aquesta amplada'],
        ['rotate', 'ccw · cw', 'Un quart de volta, en una pàgina pròpia'],
        ['captionSide', 'sí · no', 'Peu a la columna lateral'],
      ],
    );
  }
  return lang === 'es'
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

function documentFormatTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    return table(
      ['语法', '作用'],
      [
        [':::pagebreak', '另起一页；parity="odd"或"even"指定单页码或双页码'],
        [':::columnbreak', '结束当前栏'],
        [':::space', '空一行；lines=2空两行'],
        [':::numbering', '切换页码序列：格式与起始页码'],
        [':::toc', '排出目录，页码都是真实的'],
        [':::part', '开始一个篇章页，带标题、编号和调色板'],
        [':::callout', '某种标注框样式的框：说明、引文、数字……'],
        [':::columns', '标注框里彼此平衡的分栏'],
        [':::paragraphs', '给它包住的段落套用段落样式'],
        [':::paper', '另换纸张印刷的一组页面，在Folio三维视图中显示'],
        [':ref', '提及一个资源，为它编号并让它浮动'],
        ['::resource', '把资源嵌在确切的位置'],
        [':swatch', '行内色样'],
        ['# 标题 {style="…"}', '标题样式，以及供版面设计取用的属性'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Sintaxi', 'Què fa'],
      [
        [':::pagebreak', 'Pàgina nova; parity="odd" o "even" força recto o verso'],
        [':::columnbreak', 'Acaba la columna actual'],
        [':::space', 'Una línia en blanc; lines=2 en deixa dues'],
        [':::numbering', 'Canvia la seqüència de folis: format i número inicial'],
        [':::toc', 'Imprimeix l\'índex, amb folis reals'],
        [':::part', 'Obre una portadella de part, amb títol, número i paleta'],
        [':::callout', 'Requadre d\'un estil: nota, cita, xifres…'],
        [':::columns', 'Columnes equilibrades dins d\'un requadre'],
        [':::paragraphs', 'Aplica un estil de paràgraf al que embolcalla'],
        [':::paper', 'Pàgines impreses en un altre paper; es veuen al visor Folio'],
        [':ref', 'Cita un recurs, el numera i el fa flotar'],
        ['::resource', 'Insereix un recurs al punt exacte'],
        [':swatch', 'Mostra de color en línia'],
        ['# Títol {style="…"}', 'Estil de títol i atributs per als dissenys'],
      ],
    );
  }
  return lang === 'es'
    ? table(
        ['Sintaxis', 'Qué hace'],
        [
          [':::pagebreak', 'Nueva página; parity="odd" u "even" fuerza recto o verso'],
          [':::columnbreak', 'Termina la columna actual'],
          [':::space', 'Una línea en blanco; lines=2 deja dos'],
          [':::numbering', 'Cambia la secuencia de folios: formato y número inicial'],
          [':::toc', 'Imprime el índice, con folios reales'],
          [':::part', 'Abre una portadilla de parte, con título, número y paleta'],
          [':::callout', 'Recuadro de un estilo: nota, cita, cifras…'],
          [':::columns', 'Columnas equilibradas dentro de un recuadro'],
          [':::paragraphs', 'Aplica un estilo de párrafo a lo que envuelve'],
          [':::paper', 'Páginas impresas en otro papel; se ven en el visor Folio'],
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
          [':::space', 'A blank line; lines=2 leaves two'],
          [':::numbering', 'Switches the page-number sequence: format and start'],
          [':::toc', 'Prints the table of contents, with real page numbers'],
          [':::part', 'Opens a part divider, with a title, number and palette'],
          [':::callout', 'A box in one of the callout styles: note, quote, figures…'],
          [':::columns', 'Balanced columns inside a callout'],
          [':::paragraphs', 'Applies a paragraph style to what it wraps'],
          [':::paper', 'Pages printed on another paper stock, shown by the Folio viewer'],
          [':ref', 'Mentions a resource, numbers it and floats it'],
          ['::resource', 'Embeds a resource at the exact point'],
          [':swatch', 'An inline colour swatch'],
          ['# Title {style="…"}', 'A heading style, and attributes for the designs'],
        ],
      );
}

/** The Folio paper stocks and what each sets (`FOLIO_PAPER_STOCKS`). */
function paperStocksTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    return table(
      ['纸种', '克重', '单张厚度', '表面', '常见用途'],
      [
        ['胶版纸', '90 g/m²', '113 µm', '非涂布', '书籍和报告'],
        ['书纸（米黄，高松厚）', '80 g/m²', '128 µm', '非涂布', '小说和随笔'],
        ['哑光涂布纸', '115 g/m²', '115 µm', '哑光', '教材和画册'],
        ['丝光涂布纸', '115 g/m²', '104 µm', '丝光', '图录和杂志'],
        ['光面涂布纸', '115 g/m²', '92 µm', '光面', '杂志和图版'],
        ['字典纸', '40 g/m²', '44 µm', '非涂布', '字典和经典文集'],
        ['新闻纸', '48 g/m²', '72 µm', '非涂布', '报纸'],
        ['卡纸', '250 g/m²', '300 µm', '非涂布', '封面和隔页'],
        ['纸板', '1250 g/m²', '2000 µm', '丝光', '幼儿纸板书'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Paper', 'Gramatge', 'Gruix', 'Acabat', 'Ús habitual'],
      [
        ['Òfset sense estucar', '90 g/m²', '113 µm', 'Sense estucar', 'Llibres i informes'],
        ['Ivori d\'alt volum', '80 g/m²', '128 µm', 'Sense estucar', 'Novel·la i assaig'],
        ['Estucat mat', '115 g/m²', '115 µm', 'Mat', 'Llibres de text, llibres d\'art'],
        ['Estucat setinat', '115 g/m²', '104 µm', 'Setinat', 'Catàlegs i revistes'],
        ['Estucat brillant', '115 g/m²', '92 µm', 'Brillant', 'Revistes i làmines'],
        ['Bíblia', '40 g/m²', '44 µm', 'Sense estucar', 'Diccionaris i clàssics'],
        ['Premsa', '48 g/m²', '72 µm', 'Sense estucar', 'Diaris'],
        ['Cartolina', '250 g/m²', '300 µm', 'Sense estucar', 'Cobertes i separadors'],
        ['Cartó', '1250 g/m²', '2000 µm', 'Setinat', 'Llibres de cartró infantils'],
      ],
    );
  }
  return lang === 'es'
    ? table(
        ['Papel', 'Gramaje', 'Grosor', 'Acabado', 'Uso habitual'],
        [
          ['Offset sin estucar', '90 g/m²', '113 µm', 'Sin estucar', 'Libros e informes'],
          ['Ahuesado de alto volumen', '80 g/m²', '128 µm', 'Sin estucar', 'Novela y ensayo'],
          ['Estucado mate', '115 g/m²', '115 µm', 'Mate', 'Libros de texto, libros de arte'],
          ['Estucado seda', '115 g/m²', '104 µm', 'Seda', 'Catálogos y revistas'],
          ['Estucado brillo', '115 g/m²', '92 µm', 'Brillo', 'Revistas y láminas'],
          ['Biblia', '40 g/m²', '44 µm', 'Sin estucar', 'Diccionarios y clásicos'],
          ['Prensa', '48 g/m²', '72 µm', 'Sin estucar', 'Periódicos'],
          ['Cartulina', '250 g/m²', '300 µm', 'Sin estucar', 'Cubiertas y separadores'],
          ['Cartón', '1250 g/m²', '2000 µm', 'Seda', 'Libros de cartón infantiles'],
        ],
      )
    : table(
        ['Stock', 'Weight', 'Caliper', 'Finish', 'Typical use'],
        [
          ['Uncoated offset', '90 g/m²', '113 µm', 'Uncoated', 'Books and reports'],
          ['Book wove, cream', '80 g/m²', '128 µm', 'Uncoated', 'Novels and essays'],
          ['Coated matte', '115 g/m²', '115 µm', 'Matte', 'Textbooks, art books'],
          ['Coated silk', '115 g/m²', '104 µm', 'Silk', 'Catalogues and magazines'],
          ['Coated gloss', '115 g/m²', '92 µm', 'Gloss', 'Magazines and plates'],
          ['Bible', '40 g/m²', '44 µm', 'Uncoated', 'Dictionaries and classics'],
          ['Newsprint', '48 g/m²', '72 µm', 'Uncoated', 'Newspapers'],
          ['Card', '250 g/m²', '300 µm', 'Uncoated', 'Covers and dividers'],
          ['Board', '1250 g/m²', '2000 µm', 'Silk', 'Board books for children'],
        ],
      );
}

function presetTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    return table(
      ['开本', '常见用途'],
      [
        ['11 × 17 cm', '口袋书'],
        ['12 × 19 cm', '平装小说'],
        ['17 × 24 cm', '教材和手册'],
        ['21 × 28 cm', '杂志、大开本和本指南'],
        ['自定义', '任意尺寸，单位可以是厘米、毫米、英寸或点'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Mida', 'Ús habitual'],
      [
        ['11 × 17 cm', 'Guies de butxaca'],
        ['12 × 19 cm', 'Novel·les de butxaca'],
        ['17 × 24 cm', 'Llibres de text i manuals'],
        ['21 × 28 cm', 'Revistes, gran format i aquesta guia'],
        ['Personalitzat', 'Qualsevol format, en cm, mm, polzades o punts'],
      ],
    );
  }
  const es = lang === 'es';
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

function phasesTableModel(lang: GuideLang): TableModel {
  if (lang === 'zh-Hans') {
    return table(
      ['阶段', '已完成', '待完成'],
      [
        ['1 · 基础', '数据模型、解析器、不借助DOM的测量、文档格式', '确定配置格式'],
        ['2 · 出版排版', '分栏、平衡分栏、浮动体、可拆分或旋转的表、书与篇', '文字绕排'],
        ['3 · 专业排版', 'Knuth–Plass断行、8种语言的断词、段首孤行、段末孤行与孤字、数学公式、脚注和章末注、中文横排与竖排', '边注'],
        ['4 · 输出', 'Canvas、HTML、带标签的PDF、EPUB 3、worker、带预设的Sandbox', '**已完成**'],
      ],
    );
  }
  if (lang === 'ca') {
    const open = 'Obert';
    return table(
      ['Fase', 'Fet', 'Pendent'],
      [
        ['1 · Fonaments', 'Model de dades, parser, mesura sense DOM, format del document', open + ': tancar el format de configuració'],
        ['2 · Maquetació editorial', 'Columnes, equilibri, flotants, taules que es parteixen o giren, llibres i parts', open + ': text que envolta obstacles'],
        ['3 · Tipografia professional', 'Knuth-Plass, partició de mots en 8 llengües, òrfenes, vídues i línies curtes, matemàtiques, notes a peu de pàgina i notes de final de capítol, xinès en horitzontal i en vertical', open + ': notes al marge'],
        ['4 · Sortida', 'Canvas, HTML, PDF etiquetat, EPUB 3, worker, Sandbox amb presets', '**Fet**'],
      ],
    );
  }
  const es = lang === 'es';
  const done = es ? '**Hecho**' : '**Shipped**';
  const open = es ? 'Abierto' : 'Open';
  return es
    ? table(
        ['Fase', 'Hecho', 'Pendiente'],
        [
          ['1 · Fundamentos', 'Modelo de datos, parser, medición sin DOM, formato del documento', open + ': cerrar el formato de configuración'],
          ['2 · Maquetación editorial', 'Columnas, equilibrado, flotantes, tablas que se parten o giran, libros y partes', open + ': texto que rodea obstáculos'],
          ['3 · Tipografía profesional', 'Knuth-Plass, separación silábica en 8 idiomas, huérfanas, viudas y líneas cortas, matemáticas, notas al pie y notas de final de capítulo, chino en horizontal y en vertical', open + ': notas al margen'],
          ['4 · Salida', 'Canvas, HTML, PDF etiquetado, EPUB 3, worker, Sandbox con presets', done],
        ],
      )
    : table(
        ['Phase', 'Shipped', 'Still open'],
        [
          ['1 · Foundation', 'Data model, parser, DOM-free measurement, document format', open + ': finalise the configuration format'],
          ['2 · Editorial layout', 'Columns, balancing, floats, tables that split or rotate, books and parts', open + ': text flowing around obstacles'],
          ['3 · Professional typography', 'Knuth-Plass, hyphenation in 8 languages, orphans, widows and runts, mathematics, footnotes and chapter-end notes, Chinese set horizontally and vertically', open + ': margin notes'],
          ['4 · Output', 'Canvas, HTML, tagged PDF, EPUB 3, worker, Sandbox with presets', done],
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
  caption: ByLang;
  altText: ByLang;
}

interface TableSpec {
  id: string;
  model: (lang: GuideLang) => TableModel;
  placement: ResourcePlacement;
  caption: ByLang;
}

const FIGURE_SPECS: FigureSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.cover,
    fileId: 'default-guide-cover',
    placement: { position: 'auto', span: 'page' },
    caption: byLang('Cover art of the guide.', 'Arte de cubierta de la guía.', '本指南的封面图。', 'Art de coberta de la guia.'),
    altText: byLang(
      'An open spread drawn the way the engine sees it: justified lines of word boxes, a chapter band, a floated figure and one line opened into boxes, glue and a penalty.',
      'Un pliego abierto dibujado como lo ve el motor: líneas justificadas de cajas de palabra, una banda de capítulo, una figura flotante y una línea abierta en cajas, gomas y una penalización.',
      '按引擎眼中的样子画出的一个跨页：由词块组成的两端对齐的行、一条章首色带、一幅浮动图，以及拆成盒子、粘连和惩罚值的一行。',
      'Un plec obert dibuixat tal com el veu el motor: línies justificades de caixes de paraula, una banda de capítol, una figura flotant i una línia oberta en caixes, gomes i una penalització.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.layoutPipeline,
    fileId: 'default-layout-pipeline',
    placement: { position: 'auto', span: 'column' },
    caption: byLang(
      'The pipeline: Markdown and a configuration are parsed, measured and laid out, in a loop of at most five passes, into the VDT that all three renderers draw.',
      'La tubería: el Markdown y la configuración se analizan, se miden y se maquetan, en un bucle de cinco pasadas como mucho, hasta el VDT que dibujan los tres renderizadores.',
      '流水线：Markdown和配置经过解析、测量和排版（排版最多循环5轮），得到三个渲染器共同绘制的VDT。',
      'La cadena de processament: el Markdown i la configuració s\'analitzen, es mesuren i es maqueten, en un bucle de cinc passades com a màxim, fins al VDT que dibuixen els tres renderitzadors.',
    ),
    altText: byLang(
      'Markdown and Configuration flow into Parse, Measure and Layout, which loops on itself, then into the VDT and out to Canvas, HTML and PDF.',
      'Markdown y Configuración entran en Análisis, Medición y Maquetación, que vuelve sobre sí misma; después el VDT y las salidas Canvas, HTML y PDF.',
      'Markdown和配置依次进入解析、测量和排版；排版自我循环，然后得到VDT，再输出为Canvas、HTML和PDF。',
      'Markdown i Configuració entren a Anàlisi, Mesura i Maquetació, que torna sobre si mateixa; després el VDT i les sortides Canvas, HTML i PDF.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.measurementSpeed,
    fileId: 'default-measurement-speed',
    placement: { position: 'auto', span: 'column' },
    caption: byLang(
      'Measuring with canvas metrics and arithmetic instead of DOM reflow is 300 to 600 times faster.',
      'Medir con métricas de canvas y aritmética, en lugar de reflujos del DOM, es entre 300 y 600 veces más rápido.',
      '用Canvas字体度量和算术代替DOM回流来测量，快300～600倍。',
      'Mesurar amb mètriques de canvas i aritmètica, en lloc de reflux del DOM, és entre 300 i 600 vegades més ràpid.',
    ),
    altText: byLang(
      'A tall bar for DOM-based measurement beside a tiny bar for DOM-free measurement, annotated 300–600× faster.',
      'Una barra alta para la medición con DOM junto a una barra diminuta para la medición sin DOM, con la anotación 300–600× más rápido.',
      '借助DOM测量是一根高柱，不借助DOM测量是旁边一根极矮的柱，标注“300–600×更快”。',
      'Una barra alta per a la mesura amb DOM al costat d\'una barra minúscula per a la mesura sense DOM, amb l\'anotació 300–600× més ràpid.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.convergenceLoop,
    fileId: 'default-convergence-loop',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The convergence loop: place, check, adjust what conflicts and place again, until nothing moves — five iterations at most, usually one or two.',
      'El bucle de convergencia: colocar, comprobar, ajustar lo que choca y volver a colocar hasta que nada se mueva; cinco iteraciones como mucho, casi siempre una o dos.',
      '收敛循环：排布、检查，调整发生冲突的部分后再排布，直到什么都不再移动。最多5轮，通常一两轮就够。',
      'El bucle de convergència: col·locar, comprovar, ajustar el que xoca i tornar a col·locar fins que res no es mogui; cinc iteracions com a màxim, gairebé sempre una o dues.',
    ),
    altText: byLang(
      'A flow from Place to Check to Converged, with a conflict branch through Adjust looping back to Place, capped at five iterations.',
      'Un flujo de Colocar a Comprobar y a Convergido, con una rama de conflicto por Ajustar que vuelve a Colocar, limitada a cinco iteraciones.',
      '从排布到检查再到收敛的流程；发生冲突时经调整回到排布，最多5轮。',
      'Un flux de Col·locar a Comprovar i a Convergit, amb una branca de conflicte per Ajustar que torna a Col·locar, limitada a cinc iteracions.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.knuthPlass,
    fileId: 'default-knuth-plass',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'Knuth-Plass sees a line as boxes, glue and penalties; the flagged penalty is a hyphenation point, and the ratio r measures how far the glue stretches.',
      'Knuth-Plass ve una línea como cajas, gomas y penalizaciones; la penalización marcada es un punto de guion y la razón r mide cuánto se estiran las gomas.',
      'Knuth–Plass算法把一行西文看成盒子、粘连和惩罚值；带标记的惩罚值是一个断词点，伸缩比r表示粘连伸展了多少。',
      'Knuth-Plass veu una línia com a caixes, gomes i penalitzacions; la penalització marcada és un punt de guionet i la raó r mesura quant s\'estiren les gomes.',
    ),
    altText: byLang(
      'The words Every paragraph is balan- ced as boxes joined by springs, a hyphen penalty with a flag, and a legend.',
      'Las palabras Cada párrafo se equili- bra como cajas unidas por muelles, una penalización de guion con bandera y una leyenda.',
      '英文单词Every paragraph is balan- ced排成由弹簧相连的盒子，一个带小旗的断词惩罚值，以及图例。',
      'Les paraules Cada paràgraf és equili- brat com a caixes unides per molles, una penalització de guionet amb bandera i una llegenda.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.cjkComposition,
    fileId: 'default-cjk-composition',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'One Chinese line three ways: every mark a full em; in the mainland Kaiming style, where brackets and the full stop at the end take half an em; and set vertically, the brackets turned and the full stop moved to the corner of its cell.',
      'Una misma línea en chino de tres maneras: cada signo un cuadratín entero; en el estilo Kaiming de China continental, donde los paréntesis, los signos de título y el punto final ocupan medio cuadratín; y en vertical, con los paréntesis y los signos de título girados y el punto en la esquina de su casilla.',
      '同一行中文的三种排法：每个标点占一个全角；大陆的开明式，括号、书名号和行末句号只占半个字；竖排，括号转90度，句号移到字格的右上角。',
      'Una mateixa línia en xinès de tres maneres: cada signe un quadratí sencer; en l\'estil Kaiming de la Xina continental, on els parèntesis, els signes de títol i el punt final ocupen mig quadratí; i en vertical, amb els parèntesis i els signes de títol girats i el punt a la cantonada de la seva casella.',
    ),
    altText: byLang(
      'Two rows of the same Chinese sentence on a grid of em squares, the second shorter because its brackets take half a square, and the sentence again in two vertical columns.',
      'Dos filas de la misma frase en chino sobre una rejilla de cuadratines, la segunda más corta porque sus paréntesis y signos de título ocupan medio cuadratín, y la misma frase en dos columnas verticales.',
      '同一句中文排在全角字格上的两行，第二行较短，因为括号和书名号只占半格；右边是同一句竖排成的两列。',
      'Dues files de la mateixa frase en xinès sobre una retícula de quadratins, la segona més curta perquè els parèntesis i els signes de títol ocupen mig quadratí, i la mateixa frase en dues columnes verticals.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.orphanWidow,
    fileId: 'default-orphan-widow',
    placement: { position: 'auto', span: 'column' },
    caption: byLang(
      'A widow at the foot of one column and an orphan at the head of the next: the two defects the split optimiser prices.',
      'Una viuda al pie de una columna y una huérfana en la cabeza de la siguiente: los dos defectos que pondera el optimizador de cortes.',
      '一栏栏底落单的段首孤行，下一栏栏顶落单的段末孤行：段落跨栏时，优化器为这两种缺陷计价。',
      'Una vídua al peu d\'una columna i una òrfena al capdamunt de la següent: els dos defectes que pondera l\'optimitzador de talls.',
    ),
    altText: byLang(
      'Two columns: the left ends with a lone short line, the right begins with a lone line.',
      'Dos columnas: la izquierda termina con una línea corta sola y la derecha empieza con una línea sola.',
      '两栏：左栏以一个段落的第一行结束，右栏以一个段落落单的最后一行开始。',
      'Dues columnes: l\'esquerra acaba amb una línia curta sola i la dreta comença amb una línia sola.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.columnLayouts,
    fileId: 'default-column-layouts',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The column structures: one column, two, and a column and a half whose side column carries text or only floats.',
      'Las estructuras de columnas: una, dos y columna y media, cuya columna lateral lleva texto o solo flotantes.',
      '分栏结构：单栏、双栏和一栏半；一栏半的边栏可以排文字，也可以只放浮动体。',
      'Les estructures de columnes: una, dues i columna i mitja, la columna lateral de la qual porta text o només flotants.',
    ),
    altText: byLang(
      'Four page thumbnails: single column, two columns, a main column with a narrow text column, and a main column with figures and boxes in the side column.',
      'Cuatro miniaturas de página: una columna, dos columnas, una columna principal con otra estrecha de texto y una columna principal con figuras y recuadros en la lateral.',
      '四个页面缩略图：单栏；双栏；一个主栏加一条排文字的窄栏；一个主栏加一条放图和标注框的边栏。',
      'Quatre miniatures de pàgina: una columna, dues columnes, una columna principal amb una altra columna estreta de text i una columna principal amb figures i requadres a la lateral.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.baselineGrid,
    fileId: 'default-baseline-grid',
    placement: { position: 'auto', span: 'column' },
    caption: byLang(
      'The baseline grid sets every line on a shared rhythm, so lines face each other across the gutter.',
      'La rejilla de línea base asienta cada línea en un ritmo común, de modo que las líneas se miran a través del medianil.',
      '基线网格让每一行遵循同一种纵向节奏，栏间距两侧的行因此彼此相对。',
      'La retícula de línia de base assenta cada línia en un ritme comú, de manera que les línies es miren a través de l\'espai entre columnes.',
    ),
    altText: byLang(
      'Two columns of lines resting on a shared horizontal grid, with a dashed alignment guide.',
      'Dos columnas de líneas apoyadas en una rejilla horizontal común, con una guía discontinua.',
      '两栏文字行落在同一套水平网格上，一条虚线标出两栏的对齐。',
      'Dues columnes de línies assentades en una retícula horitzontal comuna, amb una guia discontínua.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.balancing,
    fileId: 'default-balancing',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'Balancing a short column: a grid line above a heading, a line after a list and a paragraph set one line looser bring it level with its neighbour.',
      'Equilibrar una columna corta: una línea de rejilla sobre un título, una línea tras una lista y un párrafo compuesto una línea más suelto la igualan con su vecina.',
      '补齐一栏短栏：标题上方加一个网格行，列表后加一行，再把一个段落排松一行，这一栏就与旁边一栏齐底了。',
      'Equilibrar una columna curta: una línia de retícula sobre un títol, una línia després d\'una llista i un paràgraf compost una línia més solt la igualen amb la seva veïna.',
    ),
    altText: byLang(
      'Two page sketches: before, the second column ends three lines short; after, the three levers are highlighted and both columns end level.',
      'Dos esbozos de página: antes, la segunda columna acaba tres líneas más corta; después, las tres palancas aparecen resaltadas y ambas columnas acaban a la par.',
      '两幅页面草图：平衡前，第二栏比第一栏短三行；平衡后，三种调节手段都做了标记，两栏齐底。',
      'Dos esbossos de pàgina: abans, la segona columna acaba tres línies més curta; després, les tres palanques apareixen ressaltades i totes dues columnes acaben a la mateixa alçada.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.floatSlots,
    fileId: 'default-float-slots',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'Where a float lands: the slots after its reference are tried in order — the foot of the same column, the head of the next, a band on the next page — and the first with room wins.',
      'Dónde cae un flotante: los huecos tras su referencia se prueban en orden —el pie de la misma columna, la cabeza de la siguiente, una banda en la página siguiente— y gana el primero con sitio.',
      '浮动体落在哪里：引用之后的空位按顺序逐个尝试——同一栏的栏底、下一栏的栏顶、下一页的一个浮动区——第一个放得下的空位胜出。',
      'On cau un flotant: els espais després de la seva referència es proven en ordre —el peu de la mateixa columna, el capdamunt de la següent, una banda a la pàgina següent— i guanya el primer que té lloc.',
    ),
    altText: byLang(
      'A page with a reference near the foot of column 1; slot 1 below it has no room, slot 2 at the head of column 2 is filled; slot 3 on the next page is not needed.',
      'Una página con una referencia cerca del pie de la columna 1; el hueco 1 no tiene sitio, el hueco 2 en la cabeza de la columna 2 está ocupado y el hueco 3, en la página siguiente, no hace falta.',
      '一页中，引用处靠近第1栏栏底；它下面的空位1放不下，第2栏栏顶的空位2被占用，下一页的空位3用不上。',
      'Una pàgina amb una referència a prop del peu de la columna 1; a l\'espai 1 no hi cap, l\'espai 2, al capdamunt de la columna 2, està ocupat i l\'espai 3, a la pàgina següent, no cal.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.bookAnatomy,
    fileId: 'default-book-anatomy',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The anatomy of this book: a cover set by a heading style, a self-numbering contents, a part divider, a chapter opener and body pages with running heads.',
      'La anatomía de este libro: una cubierta compuesta con un estilo de título, un índice que se numera solo, una portadilla de parte, una apertura de capítulo y páginas de cuerpo con cabeceras.',
      '本书的构成：用标题样式排出的封面、自动编好页码的目录、篇章页、章首页，以及带书眉的正文页。',
      'L\'anatomia d\'aquest llibre: una coberta composta amb un estil de títol, un índex que es numera sol, una portadella de part, una obertura de capítol i pàgines de cos amb capçaleres.',
    ),
    altText: byLang(
      'Six page thumbnails: a dark cover, a contents page with leaders, a gilt part page, a chapter opener with a band, and two body pages.',
      'Seis miniaturas: una cubierta oscura, un índice con puntos guía, una portadilla dorada, una apertura con banda y dos páginas de cuerpo.',
      '六个页面缩略图：深色的封面、带前导点的目录页、金色的篇章页、带色带的章首页，以及两个正文页。',
      'Sis miniatures: una coberta fosca, un índex amb punts guia, una portadella daurada, una obertura amb banda i dues pàgines de cos.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.sandboxUi,
    fileId: 'default-sandbox-ui',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The Sandbox: the activity bar with its seven panels, the text editor with the chapter switcher, and the viewport with its five tabs, from Canvas to EPUB 3.',
      'El Sandbox: la barra de actividad con sus siete paneles, el editor de texto con el selector de capítulos y el visor con sus cinco pestañas, de Canvas a EPUB 3.',
      'Sandbox：带七个面板的活动栏、带章节切换器的文字编辑器，以及带Canvas、PDF、书页、HTML和EPUB 3五个标签页的视图区。',
      'El Sandbox: la barra d\'activitat amb els seus set taulers, l\'editor de text amb el selector de capítols i el visor amb les seves cinc pestanyes, de Canvas a EPUB 3.',
    ),
    altText: byLang(
      'Interface sketch: a column of seven icons, an editor panel with a chapter title, and a viewport showing a two-page spread.',
      'Esbozo de la interfaz: una columna de siete iconos, un panel de editor con el título del capítulo y un visor con un pliego de dos páginas.',
      '界面草图：一列七个图标，一个显示章名的编辑器面板，以及一个显示跨页的视图区。',
      'Esbós de la interfície: una columna de set icones, un tauler d\'editor amb el títol del capítol i un visor amb un plec de dues pàgines.',
    ),
  },
];

FIGURE_SPECS.push(
  {
    id: DEFAULT_RESOURCE_IDS.vectorRosette,
    fileId: 'default-vector-rosette',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'Bézier petals, hairline rings and a line of microtext: zoom into the PDF as far as you like and every edge stays sharp.',
      'Pétalos de Bézier, anillos de trazo fino y una línea de microtexto: amplía el PDF cuanto quieras y todos los bordes siguen nítidos.',
      '贝塞尔曲线画成的花瓣、极细的圆环和一行微缩文字：把PDF放大到任意倍数，每一条边都依然锐利。',
      'Pètals de Bézier, anells de traç fi i una línia de microtext: amplia el PDF tant com vulguis i totes les vores continuen nítides.',
    ),
    altText: byLang(
      'A rosette of eighteen overlapping blue and gilt petals inside thin rings, above five lines of tiny text.',
      'Una roseta de dieciocho pétalos azules y dorados superpuestos dentro de anillos finos, sobre cinco líneas de texto diminuto.',
      '由十八片相互重叠的蓝色和金色花瓣组成的玫瑰花饰，外有细圆环，下面是五行极小的文字。',
      'Una roseta de divuit pètals blaus i daurats superposats dins d\'anells fins, sobre cinc línies de text minúscul.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.vectorChart,
    fileId: 'default-vector-chart',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'A chart drawn as paths and text: in the PDF its labels are real text, selectable and searchable.',
      'Un gráfico dibujado con trazados y texto: en el PDF sus etiquetas son texto real, que se puede seleccionar y buscar.',
      '用路径和文字画成的图表：在PDF里，它的标签是真正的文字，可以选中，也可以搜索。',
      'Un gràfic dibuixat amb traçats i text: al PDF les seves etiquetes són text real, que es pot seleccionar i cercar.',
    ),
    altText: byLang(
      'An area chart with a solid blue line and a dashed gilt line over eight months, with axis labels and a legend.',
      'Un gráfico de área con una línea azul continua y una dorada discontinua a lo largo de ocho meses, con etiquetas en los ejes y leyenda.',
      '一张面积图，一条蓝色实线和一条金色虚线跨越八个月，带坐标轴标签和图例。',
      'Un gràfic d\'àrea amb una línia blava contínua i una de daurada discontínua al llarg de vuit mesos, amb etiquetes als eixos i llegenda.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.vectorClip,
    fileId: 'default-vector-clip',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'A clipping path, three translucent circles and one star reused five times: all of it is converted to native PDF drawing operations.',
      'Un trazado de recorte, tres círculos translúcidos y una estrella reutilizada cinco veces: todo se convierte en operaciones de dibujo nativas del PDF.',
      '一条剪切路径、三个半透明的圆和一颗重复使用五次的星：全部转换成PDF原生的绘图操作。',
      'Un traçat de retall, tres cercles translúcids i una estrella reutilitzada cinc vegades: tot es converteix en operacions de dibuix natives del PDF.',
    ),
    altText: byLang(
      'Blue stripes clipped to a disc, three overlapping translucent circles in vermilion, blue and gilt, and five gilt stars.',
      'Franjas azules recortadas en un disco, tres círculos translúcidos superpuestos en bermellón, azul y oro, y cinco estrellas doradas.',
      '剪切成圆盘形的蓝色条纹，三个相互重叠的朱红、蓝色和金色半透明圆，以及五颗金色的星。',
      'Franges blaves retallades en un disc, tres cercles translúcids superposats en vermelló, blau i or, i cinc estrelles daurades.',
    ),
  },
);

const TABLE_SPECS: TableSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.featureTable,
    model: featureTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('What editorial layout needs, in plain CSS and in Postext.', 'Lo que necesita la maquetación editorial, en CSS y en Postext.', '出版排版需要的能力：纯CSS与Postext对比。', 'El que necessita la maquetació editorial, en CSS i en Postext.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.toolsTable,
    model: toolsTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('How Postext compares with established editorial tools.', 'Cómo se sitúa Postext frente a las herramientas editoriales establecidas.', 'Postext与现有出版工具的比较。', 'Com se situa Postext davant de les eines editorials establertes.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementTable,
    model: placementTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The placement fields of a resource.', 'Los campos de colocación de un recurso.', '资源的位置字段。', 'Els camps de col·locació d\'un recurs.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.documentFormatTable,
    model: documentFormatTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The extensions of the document format.', 'Las extensiones del formato del documento.', '文档格式的扩展语法。', 'Les extensions del format del document.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.presetTable,
    model: presetTableModel,
    placement: { position: 'auto', span: 'column' },
    caption: byLang('Preset page sizes and their typical use.', 'Tamaños de página predefinidos y su uso habitual.', '预设开本及其常见用途。', 'Mides de pàgina predefinides i el seu ús habitual.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.paperStocksTable,
    model: paperStocksTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The paper stocks of the Folio view and the values each one sets: weight, the caliper of one sheet and the finish.',
      'Los papeles del visor Folio y los valores que fija cada uno: gramaje, grosor de una hoja y acabado.',
      '书页视图的纸种及各自设定的数值：克重、单张厚度和表面。',
      'Els papers del visor Folio i els valors que fixa cadascun: gramatge, gruix d\'un full i acabat.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.phasesTable,
    model: phasesTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The four phases of the project: what has shipped and what is still open.', 'Las cuatro fases del proyecto: lo que ya está hecho y lo que sigue abierto.', '项目的四个阶段：已完成的和待完成的。', 'Les quatre fases del projecte: el que ja està fet i el que continua obert.'),
  },
];

/** A figure's or table's placement in an edition. The Chinese edition is
 *  vertical: a figure or table stands upright in its tier and the breadth
 *  it takes on the sheet is the room it uses in the flow, so one set across
 *  both tiers would hold a whole page for the strip it fills. There each
 *  takes one tier, the other going on with the text. */
function figurePlacement(placement: ResourcePlacement, lang: GuideLang): ResourcePlacement {
  return lang === 'zh-Hans' && placement.span === 'page' ? { ...placement, span: 'column' } : placement;
}

/** The blob id a figure's SVG is stored under in one language. Each
 *  language keeps its own copy: the Spanish and the English guide can be
 *  open (and edited, as drafts) side by side without one's figures
 *  overwriting the other's. The bare ids of earlier versions are no longer
 *  written, so a book saved with them keeps the figures it had. */
export function figureBlobId(fileId: string, lang: GuideLang): string {
  return `${fileId}-${lang === 'zh-Hans' ? 'zh-hans' : lang}`;
}

/** A pure description of every example resource in every language — the
 *  SVG markup, captions, alt texts, placements and table models — for the
 *  built-in preset's fingerprint (no blob is written). */
export function defaultResourcesSignature(): string {
  // `blob-ids-by-locale`: each language's figures moved to ids of their own.
  const parts: unknown[] = ['blob-ids-by-locale'];
  for (const lang of GUIDE_LANGS) {
    for (const [fileId, fig] of Object.entries(SVG_FIGURES)) parts.push(fileId, fig.generate(lang));
    for (const f of FIGURE_SPECS) parts.push(f.id, f.fileId, figurePlacement(f.placement, lang), f.caption[lang], f.altText[lang]);
    for (const t of TABLE_SPECS) parts.push(t.id, figurePlacement(t.placement, lang), t.caption[lang], t.model(lang));
  }
  return JSON.stringify(parts);
}

/** Build (and persist the blobs for) the default example resources for the
 *  given document `locale` (defaults to English). Captions, table content, and
 *  diagram labels follow the locale so they match the seeded markdown — a
 *  Spanish document gets Spanish tables and figures, a Chinese one Chinese
 *  ones. Safe to call repeatedly — blob writes are idempotent on their
 *  deterministic ids. */
export async function buildDefaultResources(locale = 'en'): Promise<Resource[]> {
  const now = Date.now();
  const lang = guideLang(locale);

  // Persist every figure's SVG blob; tolerate IndexedDB being unavailable.
  // Without storage the SVGs won't render, but tables still work and the
  // warnings panel flags the unresolved blobs.
  await Promise.all(
    Object.entries(SVG_FIGURES).map(async ([fileId, fig]) => {
      try {
        const bytes = new TextEncoder().encode(fig.generate(lang)).buffer;
        const blobId = figureBlobId(fileId, lang);
        await putBlobAt(blobId, bytes, 'image/svg+xml');
        // The blob may replace an earlier seed under the same fileId (a new
        // version of the guide) — drop any cached decode so viewers
        // re-register it.
        invalidateResourceImage(blobId);
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
      svg: { fileId: figureBlobId(spec.fileId, lang), ...figureSize(fig, lang) },
      placement: figurePlacement(spec.placement, lang),
      caption: spec.caption[lang],
      altText: spec.altText[lang],
      createdAt: now,
      updatedAt: now,
    };
  });

  const tables: Resource[] = TABLE_SPECS.map((spec) => ({
    id: spec.id,
    typeId: 'table',
    kind: 'table',
    table: { model: spec.model(lang) },
    placement: figurePlacement(spec.placement, lang),
    caption: spec.caption[lang],
    createdAt: now,
    updatedAt: now,
  }));

  return [...figures, ...tables];
}
