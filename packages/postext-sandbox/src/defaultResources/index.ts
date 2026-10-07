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
// once per edition of the guide (English, Spanish, Simplified Chinese,
// Catalan, Arabic, Japanese and Brazilian Portuguese; see `lang.ts`). The Arabic edition's figures read from
// the right: those whose layout follows the reading order are drawn as
// their mirror image, their labels set right to left (see `drawn`).

import type { Resource, ResourcePlacement, TableCell, TableModel } from 'postext';
import { invalidateResourceImage } from '../controls/resourceImages';
import { putBlobAt } from '../storage/blobStore';
import { COVER_VH, COVER_VW, COVER_ZH_VH, COVER_ZH_VW, coverArtSvg, coverArtVerticalSvg } from './cover';
import { GUIDE_LANGS, byLang, guideLang, type ByLang, type GuideLang } from './lang';
import { guideVideoPosters, guideVideoResources, guideVideosSignature } from './videos';

export { GUIDE_LANGS, guideLang, type GuideLang } from './lang';
export { GUIDE_VIDEO_IDS, guideHasVideos, guideVideoPosters } from './videos';

/** Stable ids referenced by the default markdown (en.ts, es.ts, zh-Hans.ts…).
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
  epubRenditions: 'epub-renditions',
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
// A Chinese or Japanese label is about one em per character (FS.label: 11.5
// units), so their wording is kept to what fits the boxes the Latin labels
// sit in.
// ───────────────────────────────────────────────────────────────────────────

import { COLUMN_VW, DEFS, FS, P, PAGE_VW, bar, edge, localizeFigure, mirrorFragment, mirrorSvg, node, text } from './svgKit';
import { balancingSvg, bookAnatomySvg, cjkCompositionSvg, columnLayoutsSvg, epubRenditionsSvg, floatSlotsSvg, sandboxUiSvg, vectorChartSvg, vectorClipSvg, vectorRosetteSvg } from './guideFigures';

const PIPELINE = byLang(
  { parse: 'Parse', measure: 'Measure', layout: 'Layout', config: 'Configuration', loop: ['at most', '5 passes'], aria: 'Postext pipeline' },
  { parse: 'Análisis', measure: 'Medición', layout: 'Maquetación', config: 'Configuración', loop: ['hasta', '5 pasadas'], aria: 'tubería de Postext' },
  { parse: '解析', measure: '测量', layout: '排版', config: '配置', loop: ['最多5轮'], aria: 'Postext的处理流水线' },
  { parse: 'Anàlisi', measure: 'Mesura', layout: 'Maquetació', config: 'Configuració', loop: ['fins a', '5 passades'], aria: 'cadena de processament de Postext' },
  { parse: 'التحليل', measure: 'القياس', layout: 'التنضيد', config: 'الإعدادات', loop: ['حتى', '٥ تمريرات'], aria: 'خط معالجة Postext' },
  { parse: '解析', measure: '計測', layout: '組版', config: '設定', loop: ['最大5回'], aria: 'Postextの処理の流れ' },
  { parse: 'Análise', measure: 'Medição', layout: 'Diagramação', config: 'Configuração', loop: ['até', '5 passadas'], aria: 'pipeline do Postext' },
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
  { place: 'وضع', check: 'تحقق', adjust: 'تعديل', done: 'استقرار', ok: 'مستوفى', conflict: 'تعارض', iters: '٥ تكرارات على الأكثر', aria: 'حلقة تقارب التنضيد', itersWidth: 110 },
  { place: '配置', check: '検査', adjust: '調整', done: '収束', ok: '問題なし', conflict: '衝突', iters: '最大5回', aria: '組版の収束ループ', itersWidth: 72 },
  { place: 'Posicionar', check: 'Verificar', adjust: 'Ajustar', done: 'Convergiu', ok: 'atende', conflict: 'conflito', iters: 'até 5 iterações', aria: 'laço de convergência da diagramação', itersWidth: 104 },
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
  { withDom: 'عبر DOM', withoutDom: 'بلا DOM', faster: 'أسرع', time: 'الزمن', aria: 'مقارنة سرعة القياس عبر DOM وبلا DOM' },
  { withDom: 'DOMを使う', withoutDom: 'DOMを使わない', faster: '高速', time: '時間', aria: 'DOMを使う計測と使わない計測の速度比較' },
  { withDom: 'Com DOM', withoutDom: 'Sem DOM', faster: 'mais rápido', time: 'tempo', aria: 'comparação de velocidade entre a medição com DOM e sem DOM' },
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
  ${text(230, 106, lang === 'ar' ? '٣٠٠–٦٠٠×' : '300–600×', { size: FS.strong, color: P.blueDark, weight: 700 })}
  ${text(230, 121, fasterWord, { size: FS.small, color: P.muted })}
  ${text(94, 169, withDom, { size: FS.label, weight: 600 })}
  ${text(222, 169, withoutDom, { size: FS.label, weight: 600 })}
</svg>`;
}

/** The two labels of the orphan-and-widow figure: the one under the foot of
 *  the left column and the one over the head of the right. The Latin
 *  editions follow the engine's names (`avoidWidows` at a column's foot,
 *  `avoidOrphans` at the next one's head); the Chinese and Japanese editions
 *  name them by place, as their text does (段首孤行, オーファン at the foot:
 *  a paragraph's first line; 段末孤行, ウィドウ at the head: its last). */
const ORPHAN_WIDOW = byLang(
  { foot: 'Widow', head: 'Orphan', aria: 'widow and orphan lines across columns' },
  { foot: 'Viuda', head: 'Huérfana', aria: 'líneas viuda y huérfana entre columnas' },
  { foot: '段首孤行', head: '段末孤行', aria: '分栏处两侧的段首孤行与段末孤行' },
  { foot: 'Vídua', head: 'Òrfena', aria: 'línies vídua i òrfena entre columnes' },
  { foot: 'أرملة', head: 'يتيمة', aria: 'سطر أرملة وسطر يتيم بين عمودين' },
  { foot: 'オーファン', head: 'ウィドウ', aria: '段の切れ目の両側にできるオーファンとウィドウ' },
  { foot: 'Viúva', head: 'Órfã', aria: 'linhas viúva e órfã entre colunas' },
);

/** Two columns of text lines illustrating a widow (lone last line at the foot of
 *  a column) and an orphan (lone first line at the head of the next). In
 *  the Chinese and Japanese editions the stranded lines are drawn the way
 *  their names read them: a full first line at the foot, a short last line
 *  at the head. */
function orphanWidowSvg(lang: GuideLang): string {
  const { foot: widow, head: orphan, aria: ariaLabel } = ORPHAN_WIDOW[lang];
  const byPlace = lang === 'zh-Hans' || lang === 'ja';
  // Full body lines fill the left column; its paragraph's last line strands
  // alone at the foot. The continuation paragraph opens the right column with
  // a lone first line before the next paragraph begins.
  const leftWidths = [96, 90, 96, 86, 96, 92, 96, 88, 94];
  const leftLines = leftWidths.map((w, i) => bar(26, 32 + i * 12, w)).join('\n  ');
  const rightWidths = [92, 96, 86, 96, 90, 96, 84, 94];
  const rightLines = rightWidths.map((w, i) => bar(178, 56 + i * 12, w)).join('\n  ');
  const footLine = byPlace ? bar(36, 144, 86, P.amber) : bar(26, 144, 56, P.amber);
  const headLine = byPlace ? bar(178, 32, 52, P.amber) : bar(178, 32, 96, P.amber);
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
  {
    box: 'صندوق', glue: 'مسافة مرنة', penalty: 'جزاء', measure: 'عرض السطر · r = 0.42 · الرداءة ٧',
    aria: 'عناصر Knuth-Plass: الصناديق والمسافات المرنة والجزاءات',
  },  {
    box: 'ボックス', glue: 'グルー', penalty: 'ペナルティ', measure: '行長 · r = 0.42 · 不良度 7',
    aria: 'Knuth–Plass法の基本要素：ボックス、グルー、ペナルティ',
  },
  {
    box: 'Caixa', glue: 'Cola', penalty: 'Penalidade', measure: 'medida da linha · r = 0,42 · badness 7',
    aria: 'primitivas de Knuth-Plass: caixas, colas e penalidades',
  },
);
/** The words of the example line. The hyphenated line is a Western one, so
 *  the Chinese and Arabic editions show the English line (Arabic is never
 *  hyphenated). */
const KP_WORDS = byLang(
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'párrafo', 'se', 'equili', 'bra'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'paràgraf', 'és', 'equili', 'brat'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],  ['Cada', 'parágrafo', 'é', 'equili', 'brado'],
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
  // The legend reads from the right in the Arabic edition; the English line
  // above it stays as English is set.
  const legend = `<rect x="32" y="118" width="18" height="13" rx="3" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.2" />
  ${text(58, 128.5, box, { size: FS.label, anchor: 'start' })}
  ${spring(150, 124.5)}
  ${text(186, 128.5, glue, { size: FS.label, anchor: 'start' })}
  ${hyphen(286, 124.5, 14)}
  ${text(308, 128.5, penalty, { size: FS.label, anchor: 'start' })}`;
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
  ${lang === 'ar' ? mirrorFragment(legend, PAGE_VW) : legend}
</svg>`;
}

const BASELINE = byLang(
  { label: 'Baseline grid', aria: 'baseline grid alignment', pillW: 100 },
  { label: 'Rejilla de línea base', aria: 'alineación a la rejilla de línea base', pillW: 144 },
  { label: '基线网格', aria: '文字对齐基线网格', pillW: 76 },
  { label: 'Retícula de línia de base', aria: 'alineació a la retícula de línia de base', pillW: 172 },
  { label: 'شبكة خطوط القاعدة', aria: 'المحاذاة على شبكة خطوط القاعدة', pillW: 116 },
  { label: 'ベースライングリッド', aria: '行をベースライングリッドにそろえる', pillW: 128 },
  { label: 'Grade de linhas de base', aria: 'alinhamento à grade de linhas de base', pillW: 160 },
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

/** A figure drawn with the kit, its labels set in the edition's label face
 *  (see `localizeFigure`). `mirrored`: a figure whose layout follows the
 *  reading order (a flow, a sequence of pages, columns, a chart's axis) is
 *  drawn as its mirror image in the Arabic edition, which reads from the
 *  right; the others keep their layout and set their labels right to left
 *  in place. */
const drawn = (draw: (lang: GuideLang) => string, mirrored = false) => (lang: GuideLang): string => {
  const svg = draw(lang);
  return localizeFigure(mirrored && lang === 'ar' ? mirrorSvg(svg) : svg, lang);
};

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads.
 *  Widths follow the shared unit system: COLUMN_VW for column-span figures,
 *  PAGE_VW for page-span ones (see FIGURE_SPECS placements). */
export const SVG_FIGURES: Record<string, GuideFigure> = {
  // The Chinese and Japanese editions, vertical books, have a portrait
  // cover: one of their own pages beside the title strip.
  'default-guide-cover': {
    // The Arabic edition's spread is drawn mirrored (see `coverArtSvg`).
    generate: (lang) => (lang === 'zh-Hans' || lang === 'ja' ? coverArtVerticalSvg(lang) : coverArtSvg(lang)),
    width: COVER_VW, height: COVER_VH,
    sizeIn: { 'zh-Hans': { width: COVER_ZH_VW, height: COVER_ZH_VH }, ja: { width: COVER_ZH_VW, height: COVER_ZH_VH } },
  },
  'default-layout-pipeline': { generate: drawn(pipelineSvg, true), width: COLUMN_VW, height: 300 },
  'default-convergence-loop': { generate: drawn(convergenceLoopSvg, true), width: PAGE_VW, height: 170 },
  'default-measurement-speed': { generate: drawn(measurementSpeedSvg, true), width: COLUMN_VW, height: 190 },
  'default-orphan-widow': { generate: drawn(orphanWidowSvg, true), width: COLUMN_VW, height: 180 },
  'default-knuth-plass': { generate: drawn(knuthPlassSvg), width: PAGE_VW, height: 150 },
  'default-cjk-composition': { generate: drawn(cjkCompositionSvg), width: PAGE_VW, height: 232 },
  'default-baseline-grid': { generate: drawn(baselineGridSvg, true), width: COLUMN_VW, height: 170 },
  'default-column-layouts': { generate: drawn(columnLayoutsSvg, true), width: PAGE_VW, height: 196 },
  'default-float-slots': { generate: drawn(floatSlotsSvg, true), width: PAGE_VW, height: 214 },
  'default-balancing': { generate: drawn(balancingSvg, true), width: PAGE_VW, height: 200 },
  'default-book-anatomy': { generate: drawn(bookAnatomySvg, true), width: PAGE_VW, height: 168 },
  'default-sandbox-ui': { generate: drawn(sandboxUiSvg, true), width: PAGE_VW, height: 322 },
  'default-epub-renditions': { generate: drawn(epubRenditionsSvg, true), width: PAGE_VW, height: 232 },
  'default-vector-rosette': { generate: drawn(vectorRosetteSvg), width: PAGE_VW, height: 222 },
  'default-vector-chart': { generate: drawn(vectorChartSvg, true), width: PAGE_VW, height: 186 },
  'default-vector-clip': { generate: drawn(vectorClipSvg, true), width: PAGE_VW, height: 170 },
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
  if (lang === 'ar') {
    const yes = '**نعم**';
    return table(
      ['القدرة', 'CSS', 'Postext'],
      [
        ['أعمدة متوازنة بحسب محتواها', 'جزئيًا', yes],
        ['الأرامل واليتامى والأسطر القصيرة', 'متفاوت', yes],
        ['قطع الفقرة الأمثل (Knuth-Plass)', 'لا', yes],
        ['أشكال تطفو بعد الإحالة إليها', 'لا', yes],
        ['شبكة خطوط قاعدة عبر الأعمدة', 'لا', yes],
        ['ترويسات وأرقام صفحات وفهرس مرقّم', 'لا', yes],
        ['PDF موسوم من المصدر نفسه', 'لا', yes],
      ],
    );
  }
  if (lang === 'ja') {
    // ○ △ × as Japanese comparison tables mark them.
    const yes = '**○**';
    return table(
      ['機能', 'CSS', 'Postext'],
      [
        ['内容に応じた段末そろえ', '△', yes],
        ['オーファン、ウィドウ、孤立した最終行', '△', yes],
        ['段落全体での最適な行分割（Knuth–Plass）', '×', yes],
        ['参照のあとに置かれる図', '×', yes],
        ['段をまたぐベースライングリッド', '×', yes],
        ['柱、ノンブル、ページ番号入りの目次', '×', yes],
        ['同じ原稿から作るタグ付きPDF', '×', yes],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    const yes = '**Sim**';
    return table(
      ['Recurso', 'CSS', 'Postext'],
      [
        ['Colunas balanceadas pelo conteúdo', 'Parcial', yes],
        ['Órfãs, viúvas e linhas curtas', 'Irregular', yes],
        ['Quebra ótima de parágrafo (Knuth-Plass)', 'Não', yes],
        ['Figuras que flutuam depois da referência', 'Não', yes],
        ['Grade de linhas de base entre colunas', 'Não', yes],
        ['Cabeços, fólios e sumário paginado', 'Não', yes],
        ['PDF com tags a partir da mesma fonte', 'Não', yes],
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
  if (lang === 'ar') {
    const full = '**كامل**';
    const yes = '**نعم**';
    return table(
      ['الأداة', 'التحكم التحريري', 'على الويب', 'قابلة للتضمين', 'مفتوحة المصدر'],
      [
        ['معالجات النصوص', 'أساسي', 'جزئيًا', 'لا', 'لا'],
        ['Adobe InDesign', full, 'لا', 'لا', 'لا'],
        ['LaTeX', full, 'لا', 'لا', yes],
        ['CSS المرقّم صفحاتٍ', 'جزئيًا', yes, 'جزئيًا', yes],
        ['Postext', full, yes, yes, yes],
      ],
    );
  }
  if (lang === 'ja') {
    const yes = '**○**';
    return table(
      ['ツール', '組版の制御', 'Webで動く', '組み込める', 'オープンソース'],
      [
        ['ワープロ', '△', '△', '×', '×'],
        ['Adobe InDesign', yes, '×', '×', '×'],
        ['LaTeX', yes, '×', '×', yes],
        ['ページ組みのCSS', '△', yes, '△', yes],
        ['Postext', yes, yes, yes, yes],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    const full = '**Completo**';
    const yes = '**Sim**';
    const basic = 'Básico';
    const partial = 'Parcial';
    return table(
      ['Ferramenta', 'Controle editorial', 'Na web', 'Incorporável', 'Código aberto'],
      [
        ['Processadores de texto', basic, partial, 'Não', 'Não'],
        ['Adobe InDesign', full, 'Não', 'Não', 'Não'],
        ['LaTeX', full, 'Não', 'Não', yes],
        ['CSS paginado', partial, yes, partial, yes],
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
  if (lang === 'ar') {
    return table(
      ['الحقل', 'القيم', 'الأثر'],
      [
        ['position', 'auto · top · bottom · here', 'أول مكان شاغر، أو رأس العمود أو ذيله، أو النقطة نفسها'],
        ['span', 'column · page · side', 'عمود واحد، أو الصفحة كلها، أو العمود الجانبي'],
        ['width', '0–1', 'نسبة من العرض المتاح'],
        ['align', 'left · center · right', 'الموضع داخل ذلك العرض'],
        ['rotate', 'ccw · cw', 'ربع دورة، في صفحة خاصة به'],
        ['captionSide', 'نعم · لا', 'التعليق في العمود الجانبي'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['フィールド', '値', '効果'],
      [
        ['position', 'auto · top · bottom · here', '最初の空き、段頭か段末、またはその場'],
        ['span', 'column · page · side', '1段分、版面の全幅、または脇段'],
        ['width', '0–1', '使える幅に対する割合'],
        ['align', 'left · center · right', 'その幅の中での位置'],
        ['rotate', 'ccw · cw', '90度回して専用のページに置く'],
        ['captionSide', 'true · false', 'キャプションを脇段に置く'],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    return table(
      ['Campo', 'Valores', 'Efeito'],
      [
        ['position', 'auto · top · bottom · here', 'Primeiro espaço livre, topo ou pé da coluna, ou o ponto exato'],
        ['span', 'column · page · side', 'Uma coluna, a página inteira ou a coluna lateral'],
        ['width', '0–1', 'Fração da largura disponível'],
        ['align', 'left · center · right', 'Posição dentro dessa largura'],
        ['rotate', 'ccw · cw', 'Um quarto de volta, numa página própria'],
        ['captionSide', 'sim · não', 'Legenda na coluna lateral'],
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
  if (lang === 'ar') {
    return table(
      ['الصيغة', 'ما تفعله'],
      [
        [':::pagebreak', 'صفحة جديدة؛ parity="odd" أو "even" تطلب صفحة فردية أو زوجية'],
        [':::columnbreak', 'تُنهي العمود الحالي'],
        [':::space', 'سطر فارغ؛ lines=2 تترك سطرين'],
        [':::numbering', 'تبدّل تسلسل أرقام الصفحات: الصيغة والبداية'],
        [':::toc', 'تطبع فهرس المحتويات بأرقام صفحات حقيقية'],
        [':::part', 'تفتح صفحة جزء بعنوان ورقم ولوحة ألوان'],
        [':::callout', 'إطار بأحد أنماط الإطارات: ملاحظة، اقتباس، أرقام…'],
        [':::columns', 'أعمدة متوازنة داخل إطار'],
        [':::paragraphs', 'تطبّق نمط فقرة على ما تحيط به'],
        [':::paper', 'صفحات مطبوعة على ورق آخر، يعرضها عارض Folio'],
        [':ref', 'تذكر موردًا، فترقّمه وتجعله يطفو'],
        ['::resource', 'تُدرج موردًا في النقطة نفسها'],
        [':swatch', 'عيّنة لون داخل السطر'],
        ['[^id]', 'علامة حاشية؛ و[^id]: تفتح نصها'],
        [':index', 'تُدرج مصطلحًا في الفهرس الأبجدي'],
        [':::index', 'تطبع الفهرس الأبجدي بأرقام صفحات حقيقية'],
        [':::verse', 'قصيدة عمودية، يفصل || بين شطري البيت'],
        [':::page · ::panel', 'صفحة قصة مصوّرة تقسّمها split إلى إطارات، ويحمل كل ::panel رسمًا ونصّه'],
        ['المتحدث{…}: النص', 'فقاعة من نص القصة؛ والمفاتيح المحجوزة caption: وsfx: وnote:'],
        [':chip', 'كلمة في إطار صغير يجري مع السطر'],
        [':ltr · :rtl', 'مقطع من اليسار إلى اليمين أو من اليمين إلى اليسار'],
        ['# العنوان {style="…"}', 'نمط عنوان، وسمات تستعملها التصاميم'],
      ],
    );
  }
  if (lang === 'ja') {
    // The Japanese edition adds the marks its text describes; a backslash
    // keeps the compact ruby as written.
    return table(
      ['記法', 'はたらき'],
      [
        [':::pagebreak', '改ページ。parity="odd"か"even"で奇数ページか偶数ページを指定する'],
        [':::columnbreak', 'いまの段を終える'],
        [':::space', '1行アキ。lines=2で2行アキ'],
        [':::numbering', 'ノンブルの系列を切り替える：書式と開始番号'],
        [':::toc', '実際のページ番号の入った目次を組む'],
        [':::part', '部扉を開く。タイトル、番号、パレット付き'],
        [':::callout', '囲みのスタイルの一つで組む囲み：メモ、引用、数字など'],
        [':::columns', '囲みの中でそろえて組む段'],
        [':::paragraphs', '囲んだ段落に段落スタイルを適用する'],
        [':::paper', '別の用紙に刷るページ。Folioビューで表示される'],
        [':ref', 'リソースに言及し、番号を振ってフロートさせる'],
        ['::resource', 'リソースをその位置に埋め込む'],
        [':swatch', '行内の色見本'],
        ['[^id]', '注の合印。[^id]:で注の本文を始める'],
        [':index', '用語を巻末索引に登録する。yomiで読みを与える'],
        [':::index', '実際のページ番号の入った索引を組む'],
        ['\\{漢字|かん|じ}', 'ルビ。読みを一字ずつ、または語全体に'],
        [':sideline · :dots', '傍線と圏点'],
        [':tcy · :warichu', '縦中横と割注'],
        [':::verse', 'アラビア語の古典詩。前半句と後半句を||で区切る'],
        [':::page · ::panel', 'マンガのページ。splitでコマに割り、::panelごとに絵と台本を置く'],
        ['話し手{…}: テキスト', '台本のフキダシ一つ。caption:、sfx:、note:は予約されたキー'],
        [':chip', '行と一緒に流れる小さな枠の中の語'],
        [':ltr · :rtl', '左から右、または右から左に組む一続きの文字'],
        ['# 見出し {style="…"}', '見出しスタイルと、デザインが使う属性'],
      ],
    );
  }
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
        ['[^id]', '脚注标记；[^id]:开始注文'],
        [':index', '把词条收进书末索引'],
        [':::index', '排出索引，页码都是真实的'],
        [':::verse', '阿拉伯古典诗，上下半句用||隔开'],
        [':::page · ::panel', '漫画页，用split切成分格；每个::panel放一幅画和它的台词'],
        ['角色{…}: 文字', '漫画脚本里的一个对白框；caption:、sfx:和note:是保留的键'],
        [':chip', '随行排进小框里的词'],
        [':ltr · :rtl', '从左到右或从右到左排的一段文字'],
        ['# 标题 {style="…"}', '标题样式，以及供版面设计取用的属性'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    return table(
      ['Sintaxe', 'O que faz'],
      [
        [':::pagebreak', 'Uma página nova; parity="odd" ou "even" pede uma página ímpar ou par'],
        [':::columnbreak', 'Encerra a coluna atual'],
        [':::space', 'Uma linha em branco; lines=2 deixa duas'],
        [':::numbering', 'Troca a sequência de fólios: formato e número inicial'],
        [':::toc', 'Imprime o sumário, com os números de página reais'],
        [':::part', 'Abre uma página de parte, com título, número e paleta'],
        [':::callout', 'Um boxe em um dos estilos: nota, citação, números…'],
        [':::columns', 'Colunas balanceadas dentro de um boxe'],
        [':::paragraphs', 'Aplica um estilo de parágrafo ao que envolve'],
        [':::paper', 'Páginas impressas em outro papel, mostradas pelo visualizador Folio'],
        [':ref', 'Cita um recurso, numera-o e faz que ele flutue'],
        ['::resource', 'Insere um recurso no ponto exato'],
        [':swatch', 'Uma amostra de cor na linha'],
        ['[^id]', 'Chamada de nota; [^id]: abre o seu texto'],
        [':index', 'Registra um termo no índice remissivo'],
        [':::index', 'Imprime o índice remissivo, com os números de página reais'],
        [':::verse', 'Um poema clássico, com os hemistíquios separados por ||'],
        [':::page · ::panel', 'Uma página de quadrinhos dividida em quadros por split; cada ::panel traz um desenho e o seu roteiro'],
        ['personagem{…}: texto', 'Um balão do roteiro; caption:, sfx: e note: são as chaves reservadas'],
        [':chip', 'Uma palavra numa caixinha que corre com a linha'],
        [':ltr · :rtl', 'Um trecho da esquerda para a direita ou da direita para a esquerda'],
        ['# Título {style="…"}', 'Estilo de título e atributos para os designs'],
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
        ['[^id]', 'Crida de nota; [^id]: n\'obre el text'],
        [':index', 'Registra un terme a l\'índex analític'],
        [':::index', 'Imprimeix l\'índex analític, amb folis reals'],
        [':::verse', 'Un poema clàssic, amb els hemistiquis separats per ||'],
        [':::page · ::panel', 'Una pàgina de còmic dividida en vinyetes per split; cada ::panel porta un dibuix i el seu guió'],
        ['personatge{…}: text', 'Una bafarada del guió; caption:, sfx: i note: són les claus reservades'],
        [':chip', 'Una paraula en una capseta que flueix amb la línia'],
        [':ltr · :rtl', 'Un tram d\'esquerra a dreta o de dreta a esquerra'],
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
          ['[^id]', 'Llamada de nota; [^id]: abre su texto'],
          [':index', 'Registra un término en el índice analítico'],
          [':::index', 'Imprime el índice analítico, con folios reales'],
          [':::verse', 'Un poema clásico, con los hemistiquios separados por ||'],
          [':::page · ::panel', 'Una página de cómic dividida en viñetas por split; cada ::panel lleva un dibujo y su guion'],
          ['personaje{…}: texto', 'Un globo del guion; caption:, sfx: y note: son las claves reservadas'],
          [':chip', 'Una palabra en una cajita que fluye con la línea'],
          [':ltr · :rtl', 'Un tramo de izquierda a derecha o de derecha a izquierda'],
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
          ['[^id]', 'A footnote marker; [^id]: opens its text'],
          [':index', 'Files a term in the back-of-book index'],
          [':::index', 'Prints the index, with real page numbers'],
          [':::verse', 'A classical poem, its halves split by ||'],
          [':::page · ::panel', 'A comic page cut into panels by split; each ::panel holds a picture and its script'],
          ['speaker{…}: text', 'A balloon of the comic script; caption:, sfx: and note: are the reserved keys'],
          [':chip', 'A word in a small box that flows with the line'],
          [':ltr · :rtl', 'A run set left to right or right to left'],
          ['# Title {style="…"}', 'A heading style, and attributes for the designs'],
        ],
      );
}

/** The Folio paper stocks and what each sets (`FOLIO_PAPER_STOCKS`). */
function paperStocksTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    return table(
      ['الورق', 'الغراماج', 'السُّمك', 'التشطيب', 'الاستعمال المعتاد'],
      [
        ['أوفست غير مطلي', '90 g/m²', '113 µm', 'غير مطلي', 'الكتب والتقارير'],
        ['ورق كتب كريمي عالي الحجم', '80 g/m²', '128 µm', 'غير مطلي', 'الروايات والمقالات'],
        ['مطلي مطفأ', '115 g/m²', '115 µm', 'مطفأ', 'الكتب المدرسية وكتب الفن'],
        ['مطلي حريري', '115 g/m²', '104 µm', 'حريري', 'الكتالوجات والمجلات'],
        ['مطلي لامع', '115 g/m²', '92 µm', 'لامع', 'المجلات واللوحات'],
        ['ورق الكتاب المقدس', '40 g/m²', '44 µm', 'غير مطلي', 'المعاجم والكتب التراثية'],
        ['ورق الصحف', '48 g/m²', '72 µm', 'غير مطلي', 'الصحف'],
        ['ورق مقوّى', '250 g/m²', '300 µm', 'غير مطلي', 'الأغلفة والفواصل'],
        ['كرتون', '1250 g/m²', '2000 µm', 'حريري', 'كتب الأطفال الكرتونية'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['用紙', '坪量', '紙厚', '表面', '主な用途'],
      [
        ['上質紙', '90 g/m²', '113 µm', '非塗工', '書籍と報告書'],
        ['書籍用紙（クリーム、嵩高）', '80 g/m²', '128 µm', '非塗工', '小説と随筆'],
        ['マットコート紙', '115 g/m²', '115 µm', 'マット', '教科書と美術書'],
        ['ダルコート紙', '115 g/m²', '104 µm', 'ダル', 'カタログと雑誌'],
        ['グロスコート紙', '115 g/m²', '92 µm', 'グロス', '雑誌と図版'],
        ['インディア紙', '40 g/m²', '44 µm', '非塗工', '辞書と古典'],
        ['新聞用紙', '48 g/m²', '72 µm', '非塗工', '新聞'],
        ['厚紙', '250 g/m²', '300 µm', '非塗工', '表紙と仕切り'],
        ['板紙', '1250 g/m²', '2000 µm', 'ダル', '幼児向けのボードブック'],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    return table(
      ['Papel', 'Gramatura', 'Espessura', 'Acabamento', 'Uso habitual'],
      [
        ['Offset', '90 g/m²', '113 µm', 'Não revestido', 'Livros e relatórios'],
        ['Pólen de alto volume', '80 g/m²', '128 µm', 'Não revestido', 'Romances e ensaios'],
        ['Couché fosco', '115 g/m²', '115 µm', 'Fosco', 'Livros didáticos, livros de arte'],
        ['Couché seda', '115 g/m²', '104 µm', 'Seda', 'Catálogos e revistas'],
        ['Couché brilho', '115 g/m²', '92 µm', 'Brilho', 'Revistas e pranchas'],
        ['Bíblia', '40 g/m²', '44 µm', 'Não revestido', 'Dicionários e clássicos'],
        ['Jornal', '48 g/m²', '72 µm', 'Não revestido', 'Jornais'],
        ['Cartão', '250 g/m²', '300 µm', 'Não revestido', 'Capas e divisórias'],
        ['Papelão', '1250 g/m²', '2000 µm', 'Seda', 'Livros cartonados infantis'],
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
  if (lang === 'ar') {
    return table(
      ['المقاس', 'الاستعمال المعتاد'],
      [
        ['11 × 17 cm', 'أدلة الجيب'],
        ['12 × 19 cm', 'الروايات بغلاف ورقي'],
        ['17 × 24 cm', 'الكتب المدرسية والأدلة التقنية'],
        ['21 × 28 cm', 'المجلات والقطع الكبير وهذا الدليل'],
        ['مخصّص', 'أي مقاس، بالسنتيمتر أو المليمتر أو البوصة أو النقطة'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['判型', '主な用途'],
      [
        ['11 × 17 cm', '新書に近い。ポケットガイド'],
        ['12 × 19 cm', '四六判に近い。小説の単行本'],
        ['17 × 24 cm', '教科書とマニュアル'],
        ['21 × 28 cm', '雑誌、大判の本、このガイド'],
        ['カスタム', '任意の寸法。cm、mm、インチ、ポイントで指定'],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    return table(
      ['Formato', 'Uso habitual'],
      [
        ['11 × 17 cm', 'Guias de bolso'],
        ['12 × 19 cm', 'Romances de bolso'],
        ['17 × 24 cm', 'Livros didáticos e manuais'],
        ['21 × 28 cm', 'Revistas, formatos grandes e este guia'],
        ['Personalizado', 'Qualquer formato, em cm, mm, polegadas ou pontos'],
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
  if (lang === 'ar') {
    const open = 'مفتوح';
    return table(
      ['المرحلة', 'ما أُنجز', 'ما بقي'],
      [
        ['1 · الأسس', 'نموذج البيانات، والمحلّل، والقياس بلا DOM، وصيغة المستند', open + ': تثبيت صيغة الإعدادات'],
        ['2 · التنضيد التحريري', 'الأعمدة، والموازنة، والعناصر العائمة، والجداول التي تنقسم أو تدور، والكتب والأجزاء', open + ': نص يلتف حول العوائق'],
        ['3 · الطباعة الاحترافية', 'Knuth-Plass، وتقطيع الكلمات في 8 لغات، والأرامل واليتامى والأسطر القصيرة، والرياضيات، والحواشي وتعليقات نهاية الفصل، والصينية أفقيًا وعموديًا، والعربية من اليمين إلى اليسار بالكشيدة', open + ': حواشي الهامش'],
        ['4 · المخرجات', 'Canvas، وHTML، وPDF موسوم، وworker، وSandbox بكتب جاهزة', '**أُنجز**'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['段階', '完了', '残り'],
      [
        ['1 · 基盤', 'データモデル、パーサー、DOMを使わない計測、文書形式', '設定形式の確定'],
        ['2 · 書籍の組版', '段組、段末そろえ、フロート、分割・回転できる表、本と部', '障害物を避けて流れる文字'],
        ['3 · 本格的な組版', 'Knuth–Plass、8言語のハイフネーション、オーファン・ウィドウ・孤立した最終行、数式、脚注と章末注、中国語と日本語の横組み・縦組み', '欄外の注'],
        ['4 · 出力', 'Canvas、HTML、タグ付きPDF、EPUB 3、ワーカー、プリセット付きのSandbox', '**完了**'],
      ],
    );
  }
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
  if (lang === 'pt-BR') {
    const open = 'Em aberto';
    return table(
      ['Fase', 'Entregue', 'Pendente'],
      [
        ['1 · Fundamentos', 'Modelo de dados, parser, medição sem DOM, formato do documento', open + ': fechar o formato de configuração'],
        ['2 · Diagramação editorial', 'Colunas, balanceamento, flutuantes, tabelas que se dividem ou giram, livros e partes', open + ': texto que contorna obstáculos'],
        ['3 · Tipografia profissional', 'Knuth-Plass, hifenização em 8 idiomas, órfãs, viúvas e linhas curtas, matemática, notas de rodapé e notas de fim de capítulo, chinês na horizontal e na vertical', open + ': notas de margem'],
        ['4 · Saída', 'Canvas, HTML, PDF com tags, EPUB 3, worker, Sandbox com predefinições', '**Entregue**'],
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
    caption: byLang('Cover art of the guide.', 'Arte de cubierta de la guía.', '本指南的封面图。', 'Art de coberta de la guia.', 'صورة غلاف الدليل.', 'ガイドの表紙画。', 'Arte da capa do guia.'),
    altText: byLang(
      'An open spread drawn the way the engine sees it: justified lines of word boxes, a chapter band, a floated figure and one line opened into boxes, glue and a penalty.',
      'Un pliego abierto dibujado como lo ve el motor: líneas justificadas de cajas de palabra, una banda de capítulo, una figura flotante y una línea abierta en cajas, gomas y una penalización.',
      '按引擎眼中的样子画出的一个跨页：由词块组成的两端对齐的行、一条章首色带、一幅浮动图，以及拆成盒子、粘连和惩罚值的一行。',
      'Un plec obert dibuixat tal com el veu el motor: línies justificades de caixes de paraula, una banda de capítol, una figura flotant i una línia oberta en caixes, gomes i una penalització.',
      'صفحتان متقابلتان مرسومتان كما يراهما المحرّك: أسطر مضبوطة من صناديق الكلمات، وشريط فصل، وشكل عائم، وسطر مفتوح على صناديق ومسافات مرنة وجزاء.',
      'エンジンの目で描いた縦組みの一ページ：上下二段に並ぶ縦の行、右端を走る章扉の帯、フロートした図、そしてボックスとグルーとペナルティに分けた一行。',
      'Uma página dupla aberta desenhada como o motor a vê: linhas justificadas de caixas de palavra, uma faixa de capítulo, uma figura flutuante e uma linha aberta em caixas, colas e uma penalidade.',
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
      'خط المعالجة: يُحلَّل نص Markdown والإعدادات ويُقاسان ويُنضَّدان، في حلقة من خمس تمريرات على الأكثر، حتى شجرة VDT التي ترسمها المُصيِّرات الثلاثة.',
      '処理の流れ：Markdownと設定を解析し、計測し、組版して（組版は最大5回まで繰り返す）、三つのレンダラーが共通に描くVDTを得る。',
      'O pipeline: o Markdown e a configuração são analisados, medidos e diagramados, num laço de no máximo cinco passadas, até chegar ao VDT que os três renderizadores desenham.',
    ),
    altText: byLang(
      'Markdown and Configuration flow into Parse, Measure and Layout, which loops on itself, then into the VDT and out to Canvas, HTML and PDF.',
      'Markdown y Configuración entran en Análisis, Medición y Maquetación, que vuelve sobre sí misma; después el VDT y las salidas Canvas, HTML y PDF.',
      'Markdown和配置依次进入解析、测量和排版；排版自我循环，然后得到VDT，再输出为Canvas、HTML和PDF。',
      'Markdown i Configuració entren a Anàlisi, Mesura i Maquetació, que torna sobre si mateixa; després el VDT i les sortides Canvas, HTML i PDF.',
      'يدخل Markdown والإعدادات إلى التحليل ثم القياس ثم التنضيد الذي يعود على نفسه، ثم شجرة VDT، فالمخرجات Canvas وHTML وPDF.',
      'Markdownと設定が解析、計測、組版へと進み、組版は自分自身に戻る。そのあとVDTを経て、Canvas、HTML、PDFに出力される。',
      'Markdown e Configuração entram em Análise, Medição e Diagramação, que volta sobre si mesma; depois vêm o VDT e as saídas Canvas, HTML e PDF.',
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
      'القياس بمقاييس canvas والحساب، بدل إعادة تدفق DOM، أسرع بما بين ٣٠٠ و٦٠٠ مرة.',
      'DOMのリフローではなく、Canvasのフォントメトリクスと計算で計測すると、300〜600倍速い。',
      'Medir com as métricas do canvas e aritmética, em vez de refluxos do DOM, é de 300 a 600 vezes mais rápido.',
    ),
    altText: byLang(
      'A tall bar for DOM-based measurement beside a tiny bar for DOM-free measurement, annotated 300–600× faster.',
      'Una barra alta para la medición con DOM junto a una barra diminuta para la medición sin DOM, con la anotación 300–600× más rápido.',
      '借助DOM测量是一根高柱，不借助DOM测量是旁边一根极矮的柱，标注“300–600×更快”。',
      'Una barra alta per a la mesura amb DOM al costat d\'una barra minúscula per a la mesura sense DOM, amb l\'anotació 300–600× més ràpid.',
      'عمود طويل للقياس عبر DOM بجانب عمود ضئيل للقياس بلا DOM، وعليهما «أسرع ٣٠٠–٦٠٠ مرة».',
      'DOMを使う計測の高い棒と、DOMを使わない計測のごく低い棒。「300–600×　高速」と注記がある。',
      'Uma barra alta para a medição com DOM ao lado de uma barra minúscula para a medição sem DOM, com a anotação 300–600× mais rápido.',
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
      'حلقة التقارب: وضعٌ فتحقق فتعديلُ ما يتعارض ثم وضعٌ من جديد، حتى لا يتحرك شيء؛ خمسة تكرارات على الأكثر، وفي الغالب واحد أو اثنان.',
      '収束ループ：配置し、検査し、衝突した箇所を調整して配置し直す。何も動かなくなるまで繰り返し、最大5回、たいていは1〜2回で済む。',
      'O laço de convergência: posicionar, verificar, ajustar o que entra em conflito e posicionar de novo até que nada se mova; no máximo cinco iterações, quase sempre uma ou duas.',
    ),
    altText: byLang(
      'A flow from Place to Check to Converged, with a conflict branch through Adjust looping back to Place, capped at five iterations.',
      'Un flujo de Colocar a Comprobar y a Convergido, con una rama de conflicto por Ajustar que vuelve a Colocar, limitada a cinco iteraciones.',
      '从排布到检查再到收敛的流程；发生冲突时经调整回到排布，最多5轮。',
      'Un flux de Col·locar a Comprovar i a Convergit, amb una branca de conflicte per Ajustar que torna a Col·locar, limitada a cinc iteracions.',
      'مسار من «وضع» إلى «تحقق» إلى «استقرار»، وفرع للتعارض يمر بـ«تعديل» ويعود إلى «وضع»، بحد أقصى خمسة تكرارات.',
      '配置から検査、収束へと進む流れ。衝突があると調整を経て配置に戻る。繰り返しは最大5回。',
      'Um fluxo de Posicionar a Verificar e a Convergiu, com um ramo de conflito por Ajustar que volta a Posicionar, limitado a cinco iterações.',
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
      'يرى Knuth-Plass السطر صناديق ومسافات مرنة وجزاءات؛ الجزاء المعلَّم نقطة قطع بشَرطة في كلمة إنجليزية، والنسبة r تقيس مقدار تمدد المسافات.',
      'Knuth–Plass法は欧文の一行をボックス、グルー、ペナルティの列として見る。旗の付いたペナルティはハイフネーションの位置で、比rはグルーがどれだけ伸びたかを表す。',
      'O Knuth-Plass vê uma linha como caixas, colas e penalidades; a penalidade marcada é um ponto de hifenização, e a razão r mede quanto as colas se esticam.',
    ),
    altText: byLang(
      'The words Every paragraph is balan- ced as boxes joined by springs, a hyphen penalty with a flag, and a legend.',
      'Las palabras Cada párrafo se equili- bra como cajas unidas por muelles, una penalización de guion con bandera y una leyenda.',
      '英文单词Every paragraph is balan- ced排成由弹簧相连的盒子，一个带小旗的断词惩罚值，以及图例。',
      'Les paraules Cada paràgraf és equili- brat com a caixes unides per molles, una penalització de guionet amb bandera i una llegenda.',
      'الكلمات الإنجليزية Every paragraph is balan- ced صناديقَ تصل بينها نوابض، وجزاء شَرطة عليه راية، ومفتاح للرموز.',
      '英単語Every paragraph is balan- cedをばねでつないだボックスとして並べ、旗の付いたハイフンのペナルティと凡例を添えた図。',
      'As palavras Cada parágrafo é equili- brado como caixas unidas por molas, uma penalidade de hífen com bandeira e uma legenda.',
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
      'سطر صيني واحد بثلاث طرق: لكل علامة مربع كامل؛ وبأسلوب كايمينغ في البر الصيني، حيث تشغل الأقواس وعلامات العناوين والنقطة في آخر السطر نصف مربع؛ ومنضّدًا عموديًا، والأقواس مُدارة والنقطة في زاوية خانتها.',
      '同じ一行を三通りに組む：約物をすべて全角で組むベタ組み、JLReqに従って隣り合う約物の間のアキを詰めた組み、そして縦組み（括弧は縦向きになり、句点は字面の右上に移る）。',
      'Uma mesma linha em chinês de três maneiras: cada sinal ocupando um quadratim inteiro; no estilo Kaiming da China continental, em que os parênteses, os sinais de título e o ponto final ocupam meio quadratim; e na vertical, com os parênteses e os sinais de título girados e o ponto no canto da sua casa.',
    ),
    altText: byLang(
      'Two rows of the same Chinese sentence on a grid of em squares, the second shorter because its brackets take half a square, and the sentence again in two vertical columns.',
      'Dos filas de la misma frase en chino sobre una rejilla de cuadratines, la segunda más corta porque sus paréntesis y signos de título ocupan medio cuadratín, y la misma frase en dos columnas verticales.',
      '同一句中文排在全角字格上的两行，第二行较短，因为括号和书名号只占半格；右边是同一句竖排成的两列。',
      'Dues files de la mateixa frase en xinès sobre una retícula de quadratins, la segona més curta perquè els parèntesis i els signes de títol ocupen mig quadratí, i la mateixa frase en dues columnes verticals.',
      'صفّان من الجملة الصينية نفسها على شبكة من المربعات، الثاني أقصر لأن أقواسه وعلامات عناوينه تشغل نصف مربع، والجملة نفسها في عمودين رأسيين.',
      '全角の升目に組んだ同じ日本語の文が二行。二行目は約物どうしの間のアキを詰めた分だけ短い。右には同じ文を縦二行に組んだもの。',
      'Duas fileiras da mesma frase em chinês sobre uma grade de quadratins, a segunda mais curta porque os seus parênteses ocupam meio quadratim, e a frase de novo em duas colunas verticais.',
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
      'سطر أرملة في ذيل عمود وسطر يتيم في رأس العمود التالي: العيبان اللذان يزنهما مُحسِّن القطع.',
      '段末に取り残されたオーファンと、次の段の頭に送られたウィドウ：段落が段をまたぐとき、分割の最適化はこの二つの欠陥に代価を課す。',
      'Uma viúva no pé de uma coluna e uma órfã no topo da seguinte: os dois defeitos que o otimizador de quebras avalia.',
    ),
    altText: byLang(
      'Two columns: the left ends with a lone short line, the right begins with a lone line.',
      'Dos columnas: la izquierda termina con una línea corta sola y la derecha empieza con una línea sola.',
      '两栏：左栏以一个段落的第一行结束，右栏以一个段落落单的最后一行开始。',
      'Dues columnes: l\'esquerra acaba amb una línia curta sola i la dreta comença amb una línia sola.',
      'عمودان: الأيمن ينتهي بسطر قصير وحيد، والأيسر يبدأ بسطر وحيد.',
      '二つの段。左の段は段落の最初の一行で終わり、右の段は前の段落の最後の一行だけで始まる。',
      'Duas colunas: a da esquerda termina com uma linha curta isolada, a da direita começa com uma linha isolada.',
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
      'بنى الأعمدة: عمود واحد، وعمودان، وعمود ونصف يحمل عموده الجانبي نصًا أو العناصر العائمة وحدها.',
      '段組の構成：1段組、2段組、そして主段に脇段を添えた構成。脇段には本文を流すことも、フロートだけを置くこともできる。',
      'As estruturas de colunas: uma coluna, duas, e coluna e meia, cuja coluna lateral leva texto ou só flutuantes.',
    ),
    altText: byLang(
      'Four page thumbnails: single column, two columns, a main column with a narrow text column, and a main column with figures and boxes in the side column.',
      'Cuatro miniaturas de página: una columna, dos columnas, una columna principal con otra estrecha de texto y una columna principal con figuras y recuadros en la lateral.',
      '四个页面缩略图：单栏；双栏；一个主栏加一条排文字的窄栏；一个主栏加一条放图和标注框的边栏。',
      'Quatre miniatures de pàgina: una columna, dues columnes, una columna principal amb una altra columna estreta de text i una columna principal amb figures i requadres a la lateral.',
      'أربع صفحات مصغّرة: عمود واحد، وعمودان، وعمود رئيسي بجانبه عمود نص ضيّق، وعمود رئيسي بجانبه عمود جانبي فيه أشكال وإطارات.',
      '四つのページの縮小図：1段組、2段組、主段と本文を流す細い脇段、主段と図や囲みを置く脇段。',
      'Quatro miniaturas de página: uma coluna, duas colunas, uma coluna principal com uma coluna estreita de texto, e uma coluna principal com figuras e boxes na coluna lateral.',
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
      'تضع شبكة خطوط القاعدة كل سطر على إيقاع مشترك، فتتقابل الأسطر عبر الفاصل بين العمودين.',
      'ベースライングリッドはすべての行を共通のリズムに乗せ、段間をはさんで行どうしが向かい合う。',
      'A grade de linhas de base põe todas as linhas no mesmo ritmo, de modo que elas se correspondem de um lado e do outro da medianiz.',
    ),
    altText: byLang(
      'Two columns of lines resting on a shared horizontal grid, with a dashed alignment guide.',
      'Dos columnas de líneas apoyadas en una rejilla horizontal común, con una guía discontinua.',
      '两栏文字行落在同一套水平网格上，一条虚线标出两栏的对齐。',
      'Dues columnes de línies assentades en una retícula horitzontal comuna, amb una guia discontínua.',
      'عمودان من الأسطر يستندان إلى شبكة أفقية مشتركة، مع خط إرشاد متقطع.',
      '共通の水平グリッドに乗った二段の行と、そろいを示す破線のガイド。',
      'Duas colunas de linhas apoiadas numa grade horizontal comum, com uma guia de alinhamento tracejada.',
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
      'موازنة عمود قصير: سطر من الشبكة فوق عنوان، وسطر بعد قائمة، وفقرة منضّدة أرحب بسطر تجعله في مستوى جاره.',
      '短い段をそろえる：見出しの前にグリッド1行分、リストのあとに1行、そして1行ゆるく組んだ段落で、隣の段と段末がそろう。',
      'Balancear uma coluna curta: uma linha de grade acima de um título, uma linha depois de uma lista e um parágrafo composto uma linha mais solto a deixam no mesmo nível da vizinha.',
    ),
    altText: byLang(
      'Two page sketches: before, the second column ends three lines short; after, the three levers are highlighted and both columns end level.',
      'Dos esbozos de página: antes, la segunda columna acaba tres líneas más corta; después, las tres palancas aparecen resaltadas y ambas columnas acaban a la par.',
      '两幅页面草图：平衡前，第二栏比第一栏短三行；平衡后，三种调节手段都做了标记，两栏齐底。',
      'Dos esbossos de pàgina: abans, la segona columna acaba tres línies més curta; després, les tres palanques apareixen ressaltades i totes dues columnes acaben a la mateixa alçada.',
      'رسمان لصفحة: قبلُ، ينتهي العمود الثاني أقصر بثلاثة أسطر؛ وبعدُ، تظهر الروافع الثلاث مميَّزة وينتهي العمودان في مستوى واحد.',
      '二つのページの略図。調整前は二段目が三行短く、調整後は三つの手段が強調され、両段の段末がそろっている。',
      'Dois esboços de página: antes, a segunda coluna termina três linhas mais curta; depois, os três recursos aparecem destacados e as duas colunas terminam no mesmo nível.',
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
      'أين يستقر العنصر العائم: تُجرَّب الأماكن التالية للإحالة إليه بالترتيب ــ ذيل العمود نفسه، ثم رأس العمود التالي، ثم شريط في الصفحة التالية ــ ويفوز أول مكان يتسع له.',
      'フロートの行き先：参照のあとの場所を順に試す——同じ段の段末、次の段の段頭、次ページの帯——そして最初に入る場所に決まる。',
      'Onde cai um flutuante: os espaços depois da sua referência são testados em ordem (o pé da mesma coluna, o topo da seguinte, uma faixa na página seguinte), e fica com o primeiro que tiver lugar.',
    ),
    altText: byLang(
      'A page with a reference near the foot of column 1; slot 1 below it has no room, slot 2 at the head of column 2 is filled; slot 3 on the next page is not needed.',
      'Una página con una referencia cerca del pie de la columna 1; el hueco 1 no tiene sitio, el hueco 2 en la cabeza de la columna 2 está ocupado y el hueco 3, en la página siguiente, no hace falta.',
      '一页中，引用处靠近第1栏栏底；它下面的空位1放不下，第2栏栏顶的空位2被占用，下一页的空位3用不上。',
      'Una pàgina amb una referència a prop del peu de la columna 1; a l\'espai 1 no hi cap, l\'espai 2, al capdamunt de la columna 2, està ocupat i l\'espai 3, a la pàgina següent, no cal.',
      'صفحة فيها إحالة قرب ذيل العمود ١ (الأيمن)؛ المكان ١ تحتها لا يتسع، والمكان ٢ في رأس العمود ٢ مشغول، والمكان ٣ في الصفحة التالية لا حاجة إليه.',
      '第1段の段末近くに参照のあるページ。その下の場所1には入らず、第2段の段頭の場所2に入る。次ページの場所3は使われない。',
      'Uma página com uma referência perto do pé da coluna 1; o espaço 1, abaixo dela, não tem lugar, e o espaço 2, no topo da coluna 2, é ocupado; o espaço 3, na página seguinte, não é necessário.',
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
      'بنية هذا الكتاب: غلاف منضّد بنمط عنوان، وفهرس محتويات يرقّم نفسه، وصفحة جزء، وافتتاحية فصل، وصفحات متن بترويسات.',
      'この本の構成：見出しスタイルで組んだ表紙、ページ番号を自動で入れる目次、部扉、章扉、柱とノンブルの付いた本文ページ。',
      'A anatomia deste livro: uma capa composta por um estilo de título, um sumário que se numera sozinho, uma página de parte, uma abertura de capítulo e páginas de miolo com cabeços.',
    ),
    altText: byLang(
      'Six page thumbnails: a dark cover, a contents page with leaders, a gilt part page, a chapter opener with a band, and two body pages.',
      'Seis miniaturas: una cubierta oscura, un índice con puntos guía, una portadilla dorada, una apertura con banda y dos páginas de cuerpo.',
      '六个页面缩略图：深色的封面、带前导点的目录页、金色的篇章页、带色带的章首页，以及两个正文页。',
      'Sis miniatures: una coberta fosca, un índex amb punts guia, una portadella daurada, una obertura amb banda i dues pàgines de cos.',
      'ست صفحات مصغّرة من اليمين إلى اليسار: غلاف داكن، وصفحة محتويات بنقاط إرشاد، وصفحة جزء ذهبية، وافتتاحية بشريط، وصفحتا متن.',
      '右から左へ並ぶ六つのページの縮小図：暗い表紙、リーダー付きの目次、金色の部扉、帯のある章扉、二つの本文ページ。',
      'Seis miniaturas de página: uma capa escura, um sumário com linhas pontilhadas, uma página de parte dourada, uma abertura de capítulo com faixa e duas páginas de miolo.',
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
      'Sandbox: شريط النشاط بلوحاته السبع، ومحرر النص بمبدّل الفصول، والعارض بألسنته الخمسة، من Canvas إلى EPUB 3.',
      'Sandbox：七つのパネルを持つアクティビティバー、章の切り替えを備えたテキストエディター、CanvasからEPUB 3までの五つのタブを持つビューポート。',
      'O Sandbox: a barra de atividades com os seus sete painéis, o editor de texto com o seletor de capítulos e a área de visualização com as suas cinco abas, de Canvas a EPUB 3.',
    ),
    altText: byLang(
      'Interface sketch: a column of seven icons, an editor panel with a chapter title, and a viewport showing a two-page spread.',
      'Esbozo de la interfaz: una columna de siete iconos, un panel de editor con el título del capítulo y un visor con un pliego de dos páginas.',
      '界面草图：一列七个图标，一个显示章名的编辑器面板，以及一个显示跨页的视图区。',
      'Esbós de la interfície: una columna de set icones, un tauler d\'editor amb el títol del capítol i un visor amb un plec de dues pàgines.',
      'رسم للواجهة: عمود من سبع أيقونات، ولوحة محرر فيها عنوان الفصل، وعارض يعرض صفحتين متقابلتين.',
      '画面の略図：七つのアイコンの列、章題を表示したエディターのパネル、見開きを表示したビューポート。',
      'Esboço da interface: uma coluna de sete ícones, um painel de editor com um título de capítulo e uma área de visualização que mostra uma página dupla.',
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
      'بتلات بمنحنيات Bézier، وحلقات بخطوط شعرية، وسطر من النص المجهري: كبّر ملف PDF قدر ما تشاء فتبقى كل حافة حادة.',
      'ベジェ曲線の花弁、極細の円環、一行の微小文字：PDFをどこまで拡大しても輪郭は鮮明なままである。',
      'Pétalas de Bézier, anéis de traço finíssimo e uma linha de microtexto: aproxime o PDF quanto quiser e todas as bordas continuam nítidas.',
    ),
    altText: byLang(
      'A rosette of eighteen overlapping blue and gilt petals inside thin rings, above five lines of tiny text.',
      'Una roseta de dieciocho pétalos azules y dorados superpuestos dentro de anillos finos, sobre cinco líneas de texto diminuto.',
      '由十八片相互重叠的蓝色和金色花瓣组成的玫瑰花饰，外有细圆环，下面是五行极小的文字。',
      'Una roseta de divuit pètals blaus i daurats superposats dins d\'anells fins, sobre cinc línies de text minúscul.',
      'وردة من ثماني عشرة بتلة زرقاء وذهبية متراكبة داخل حلقات رفيعة، فوق خمسة أسطر من نص دقيق جدًا.',
      '細い円環の中で重なり合う青と金の十八枚の花弁と、その下の五行のごく小さな文字。',
      'Uma roseta de dezoito pétalas azuis e douradas sobrepostas dentro de anéis finos, acima de cinco linhas de texto minúsculo.',
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
      'رسم بياني مرسوم بمسارات ونص: تسمياته في ملف PDF نص حقيقي يمكن تحديده والبحث فيه.',
      'パスと文字で描いたグラフ：PDFではラベルが本物のテキストで、選択も検索もできる。',
      'Um gráfico desenhado com caminhos e texto: no PDF os seus rótulos são texto de verdade, selecionável e pesquisável.',
    ),
    altText: byLang(
      'An area chart with a solid blue line and a dashed gilt line over eight months, with axis labels and a legend.',
      'Un gráfico de área con una línea azul continua y una dorada discontinua a lo largo de ocho meses, con etiquetas en los ejes y leyenda.',
      '一张面积图，一条蓝色实线和一条金色虚线跨越八个月，带坐标轴标签和图例。',
      'Un gràfic d\'àrea amb una línia blava contínua i una de daurada discontínua al llarg de vuit mesos, amb etiquetes als eixos i llegenda.',
      'رسم بياني مساحي بخط أزرق متصل وخط ذهبي متقطع على مدى ثمانية أشهر، مع تسميات على المحورين ومفتاح.',
      '8か月にわたる青い実線と金色の破線の面グラフ。軸のラベルと凡例が付く。',
      'Um gráfico de área com uma linha azul contínua e uma linha dourada tracejada ao longo de oito meses, com rótulos nos eixos e uma legenda.',
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
      'مسار قص، وثلاث دوائر شفافة، ونجمة واحدة مستعملة خمس مرات: كل ذلك يتحول إلى أوامر رسم أصلية في PDF.',
      'クリッピングパス、半透明の三つの円、五回再利用した一つの星：どれもPDFのネイティブな描画命令に変換される。',
      'Um traçado de recorte, três círculos translúcidos e uma estrela reutilizada cinco vezes: tudo é convertido em operações de desenho nativas do PDF.',
    ),
    altText: byLang(
      'Blue stripes clipped to a disc, three overlapping translucent circles in vermilion, blue and gilt, and five gilt stars.',
      'Franjas azules recortadas en un disco, tres círculos translúcidos superpuestos en bermellón, azul y oro, y cinco estrellas doradas.',
      '剪切成圆盘形的蓝色条纹，三个相互重叠的朱红、蓝色和金色半透明圆，以及五颗金色的星。',
      'Franges blaves retallades en un disc, tres cercles translúcids superposats en vermelló, blau i or, i cinc estrelles daurades.',
      'خطوط زرقاء مقصوصة في قرص، وثلاث دوائر شفافة متراكبة بالزنجفري والأزرق والذهبي، وخمس نجوم ذهبية.',
      '円盤の形に切り抜いた青い縞、朱・青・金の三つの半透明の円の重なり、五つの金色の星。',
      'Listras azuis recortadas num disco, três círculos translúcidos sobrepostos em vermelhão, azul e dourado, e cinco estrelas douradas.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.epubRenditions,
    fileId: 'default-epub-renditions',
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'One layout, two e-books: the fixed layout keeps every printed page, the reflowable book keeps the text and lets the reading system set it again, with a marker where each printed page begins.',
      'Una maquetación, dos libros electrónicos: la maquetación fija conserva cada página impresa; la fluida conserva el texto y deja que el sistema de lectura lo componga de nuevo, con una marca donde empieza cada página impresa.',
      '同一个版面，两种电子书：固定版式保留每一个印刷页，流式版式保留文字，交给阅读系统重新排版，并在每个印刷页开始的地方留下标记。',
      'Una maquetació, dos llibres electrònics: la maquetació fixa conserva cada pàgina impresa; la fluida conserva el text i deixa que el sistema de lectura el torni a compondre, amb una marca on comença cada pàgina impresa.',
      'إخراج واحد وكتابان إلكترونيان: التخطيط الثابت يحفظ كل صفحة مطبوعة، والكتاب القابل لإعادة التدفق يحفظ النص ويترك لنظام القراءة أن ينضّده من جديد، مع علامة حيث تبدأ كل صفحة مطبوعة.',
      '一つの版面から二種類の電子書籍：固定レイアウトは印刷ページをそのまま残し、リフロー型はテキストを残して組み直しを読書システムに任せ、印刷ページの始まりごとに印を置く。',
      'Uma diagramação, dois livros digitais: o layout fixo conserva cada página impressa; o fluido conserva o texto e deixa que o sistema de leitura o componha de novo, com uma marca onde começa cada página impressa.',
    ),
    altText: byLang(
      'A two-column page in the middle, with arrows to a tablet on one side showing the same spread and to a phone on the other showing one column of larger text, a figure and a page marker.',
      'Una página a dos columnas en el centro, con flechas hacia una tableta que muestra el mismo pliego y hacia un teléfono que muestra una sola columna de letra más grande, una figura y una marca de página.',
      '中间是一张双栏页面，箭头一边指向显示同一跨页的平板电脑，另一边指向手机，手机上是一栏字号较大的文字、一幅图和一个页码标记。',
      'Una pàgina a dues columnes al centre, amb fletxes cap a una tauleta que mostra el mateix plec i cap a un telèfon que mostra una sola columna de lletra més grossa, una figura i una marca de pàgina.',
      'صفحة بعمودين في الوسط، تخرج منها أسهم إلى جهاز لوحي يعرض الصفحتين المتقابلتين نفسيهما، وإلى هاتف يعرض عمودًا واحدًا بحرف أكبر وشكلًا وعلامة صفحة.',
      '中央に二段組のページ。矢印の一方は同じ見開きを表示するタブレットへ、もう一方は大きめの文字の一段、図、ページの印を表示するスマートフォンへ向かう。',
      'Uma página de duas colunas no meio, com setas para um tablet de um lado, que mostra a mesma página dupla, e para um celular do outro, que mostra uma coluna de texto maior, uma figura e uma marca de página.',
    ),
  },
);

const TABLE_SPECS: TableSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.featureTable,
    model: featureTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('What editorial layout needs, in plain CSS and in Postext.', 'Lo que necesita la maquetación editorial, en CSS y en Postext.', '出版排版需要的能力：纯CSS与Postext对比。', 'El que necessita la maquetació editorial, en CSS i en Postext.', 'ما يحتاجه التنضيد التحريري، في CSS وحده وفي Postext.', '組版に必要な機能：CSSだけの場合とPostextの比較。', 'O que a diagramação editorial exige, em CSS puro e no Postext.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.toolsTable,
    model: toolsTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('How Postext compares with established editorial tools.', 'Cómo se sitúa Postext frente a las herramientas editoriales establecidas.', 'Postext与现有出版工具的比较。', 'Com se situa Postext davant de les eines editorials establertes.', 'موقع Postext من أدوات النشر الراسخة.', '既存の組版ツールとPostextの比較。', 'Como o Postext se compara com as ferramentas editoriais consagradas.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementTable,
    model: placementTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The placement fields of a resource.', 'Los campos de colocación de un recurso.', '资源的位置字段。', 'Els camps de col·locació d\'un recurs.', 'حقول موضع المورد.', 'リソースの配置フィールド。', 'Os campos de posicionamento de um recurso.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.documentFormatTable,
    model: documentFormatTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The extensions of the document format.', 'Las extensiones del formato del documento.', '文档格式的扩展语法。', 'Les extensions del format del document.', 'امتدادات صيغة المستند.', '文書形式の拡張記法。', 'As extensões do formato de documento.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.presetTable,
    model: presetTableModel,
    placement: { position: 'auto', span: 'column' },
    caption: byLang('Preset page sizes and their typical use.', 'Tamaños de página predefinidos y su uso habitual.', '预设开本及其常见用途。', 'Mides de pàgina predefinides i el seu ús habitual.', 'مقاسات الصفحة الجاهزة واستعمالاتها المعتادة.', '定義済みの判型と主な用途。', 'Formatos de página predefinidos e o seu uso habitual.'),
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
      'أنواع الورق في عارض Folio والقيم التي يضبطها كل منها: الغراماج، وسُمك الورقة الواحدة، والتشطيب.',
      'Folioビューの用紙と、それぞれが決める値：坪量、一枚の厚さ、表面。',
      'Os papéis da visualização Folio e os valores que cada um define: gramatura, espessura de uma folha e acabamento.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.phasesTable,
    model: phasesTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The four phases of the project: what has shipped and what is still open.', 'Las cuatro fases del proyecto: lo que ya está hecho y lo que sigue abierto.', '项目的四个阶段：已完成的和待完成的。', 'Les quatre fases del projecte: el que ja està fet i el que continua obert.', 'مراحل المشروع الأربع: ما أُنجز وما لا يزال مفتوحًا.', 'プロジェクトの四つの段階：完了したことと残っていること。', 'As quatro fases do projeto: o que já foi entregue e o que continua em aberto.'),
  },
];

/** A figure's or table's placement in an edition. The Chinese and Japanese
 *  editions are vertical: a figure or table stands upright in its tier and
 *  the breadth it takes on the sheet is the room it uses in the flow, so one
 *  set across both tiers would hold a whole page for the strip it fills.
 *  There each takes one tier, the other going on with the text. */
function figurePlacement(placement: ResourcePlacement, lang: GuideLang): ResourcePlacement {
  return (lang === 'zh-Hans' || lang === 'ja') && placement.span === 'page' ? { ...placement, span: 'column' } : placement;
}

/** The blob id a figure's SVG is stored under in one language. Each
 *  language keeps its own copy: the Spanish and the English guide can be
 *  open (and edited, as drafts) side by side without one's figures
 *  overwriting the other's. The bare ids of earlier versions are no longer
 *  written, so a book saved with them keeps the figures it had. */
export function figureBlobId(fileId: string, lang: GuideLang): string {
  // Lower-cased: `-zh-hans`, `-pt-br`.
  return `${fileId}-${lang.toLowerCase()}`;
}

/** A pure description of every example resource in every language — the
 *  SVG markup, captions, alt texts, placements and table models — for the
 *  built-in preset's fingerprint (no blob is written). */
export function defaultResourcesSignature(): string {
  // `blob-ids-by-locale`: each language's figures moved to ids of their own.
  const parts: unknown[] = ['blob-ids-by-locale', guideVideosSignature()];
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
 *  Spanish document gets Spanish tables and figures, a Japanese one Japanese
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

  // The videos (#478), in the editions they were cut in: their posters
  // stored like the figures.
  const posters = await guideVideoPosters(lang).catch(() => ({} as Record<string, Uint8Array>));
  await Promise.all(
    Object.entries(posters).map(async ([blobId, bytes]) => {
      try {
        await putBlobAt(blobId, bytes.buffer as ArrayBuffer, 'image/jpeg');
        invalidateResourceImage(blobId);
      } catch {
        // as for the figures
      }
    }),
  );
  const videos: Resource[] = guideVideoResources(lang, now).map((r) => ({ ...r, placement: figurePlacement(r.placement!, lang) }));

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

  return [...figures, ...videos, ...tables];
}
