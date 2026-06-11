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
import { invalidateResourceImage } from '../controls/resourceImages';
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

/** Canvas width (in SVG user units) for figures placed at column span. */
const COLUMN_VW = 300;
/** Canvas width for figures placed at page span: COLUMN_VW × the default
 *  page/column width ratio, so both spans share one physical unit scale. */
const PAGE_VW = 634;

/** Shared type scale, in canvas units (≈0.63 pt per unit at the default page
 *  geometry, against an 8 pt body): primary labels, secondary annotations,
 *  and the single emphasised metric. */
const FS = { label: 11.5, small: 10, strong: 13 };

/** Typeface stack for all diagram labels. Single quotes only — these strings
 *  land inside double-quoted SVG attributes. */
const FONT = "-apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** Shared diagram palette. */
const P = {
  text: '#44586d',     // primary labels
  muted: '#7b8da0',    // annotations, secondary labels
  line: '#8296a9',     // connectors and arrowheads
  hair: '#dde4eb',     // hairline strokes
  edgeSoft: '#c5d1dd', // card / chip outlines
  barSoft: '#cdd7e1',  // placeholder text-line bars
  panel: '#f2f5f8',    // neutral panel fill
  paper: '#ffffff',
  blue: '#295aa3',
  blueDark: '#1c3f73',
  blueMid: '#7d9cc7',
  blueTint: '#e7eef7',
  amber: '#c97a10',
  amberDark: '#8a5408',
  amberTint: '#fbf0de',
};

/** Arrowhead markers (slate for regular edges, blue for emphasis). */
const DEFS = `<defs>
    <marker id="ah" markerWidth="9" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0.5,0.5 L7.5,3.5 L0.5,6.5 C1.6,5.3 1.6,1.7 0.5,0.5 Z" fill="${P.line}" />
    </marker>
    <marker id="ahBlue" markerWidth="9" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0.5,0.5 L7.5,3.5 L0.5,6.5 C1.6,5.3 1.6,1.7 0.5,0.5 Z" fill="${P.blue}" />
    </marker>
    <marker id="ahAmber" markerWidth="9" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0.5,0.5 L7.5,3.5 L0.5,6.5 C1.6,5.3 1.6,1.7 0.5,0.5 Z" fill="${P.amber}" />
    </marker>
  </defs>`;

interface TextOpts {
  size?: number;
  color?: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  italic?: boolean;
}

function text(x: number, y: number, content: string, o: TextOpts = {}): string {
  const { size = FS.label, color = P.text, weight = 400, anchor = 'middle', italic = false } = o;
  const weightDecl = weight !== 400 ? ` font-weight="${weight}"` : '';
  const italicDecl = italic ? ' font-style="italic"' : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${weightDecl}${italicDecl} fill="${color}">${content}</text>`;
}

type NodeTone = 'neutral' | 'tint' | 'solid' | 'accent';

const NODE_TONES: Record<NodeTone, { fill: string; stroke: string; label: string }> = {
  neutral: { fill: P.panel, stroke: '#b9c7d5', label: P.text },
  tint: { fill: P.blueTint, stroke: P.blue, label: P.blueDark },
  solid: { fill: P.blue, stroke: P.blueDark, label: '#ffffff' },
  accent: { fill: P.amberTint, stroke: P.amber, label: P.amberDark },
};

/** A rounded node with a centred single-line label. */
function node(x: number, y: number, w: number, h: number, label: string, tone: NodeTone, size = FS.label): string {
  const t = NODE_TONES[tone];
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" />
  ${text(x + w / 2, y + h / 2 + size * 0.36, label, { size, color: t.label, weight: 600 })}`;
}

/** A connector path with an arrowhead. */
function edge(d: string, o: { color?: string; dash?: string; marker?: 'ah' | 'ahBlue' | 'ahAmber' | null } = {}): string {
  const { color = P.line, dash, marker = 'ah' } = o;
  const dashDecl = dash ? ` stroke-dasharray="${dash}"` : '';
  const markerDecl = marker ? ` marker-end="url(#${marker})"` : '';
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"${dashDecl}${markerDecl} />`;
}

/** A placeholder text-line bar. */
function bar(x: number, y: number, w: number, color = P.barSoft, h = 5): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}" />`;
}

/** The Postext pipeline: Markdown → parse → layout → three renderers. A
 *  column-span figure, so the stages stack vertically and fan out to the
 *  three output chips at the foot. The stage fills deepen top to bottom
 *  (source → engine). */
function pipelineSvg(es: boolean): string {
  const parse = es ? 'Análisis' : 'Parse';
  const layout = es ? 'Maquetación' : 'Layout';
  const ariaLabel = es ? 'tubería de Postext' : 'Postext pipeline';
  const chip = (x: number, label: string, dot: string): string =>
    `<rect x="${x}" y="186" width="82" height="26" rx="13" fill="${P.paper}" stroke="${P.edgeSoft}" stroke-width="1.2" />
  <circle cx="${x + 13}" cy="199" r="3.5" fill="${dot}" />
  ${text(x + 22, 203, label, { size: FS.label, weight: 600, anchor: 'start' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 225" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(95, 14, 110, 32, 'Markdown', 'neutral')}
  ${node(95, 70, 110, 32, parse, 'tint')}
  ${node(95, 126, 110, 32, layout, 'solid')}
  ${chip(12, 'Canvas', P.blue)}
  ${chip(109, 'PDF', P.amber)}
  ${chip(206, 'HTML', P.muted)}
  ${edge('M150,46 L150,66')}
  ${edge('M150,102 L150,122')}
  ${edge('M150,158 C150,172 53,168 53,182')}
  ${edge('M150,158 L150,182')}
  ${edge('M150,158 C150,172 247,168 247,182')}
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

/** The Knuth-Plass primitives: boxes (words), glue (stretchable spaces) and a
 *  flagged penalty (a hyphenation point), with a legend. */
function knuthPlassSvg(es: boolean): string {
  const box = es ? 'Caja' : 'Box';
  const glue = es ? 'Goma' : 'Glue';
  const penalty = es ? 'Penalización' : 'Penalty';
  const ariaLabel = es
    ? 'primitivas de Knuth-Plass: cajas, gomas y penalizaciones'
    : 'Knuth-Plass primitives: boxes, glue and penalties';
  // A line of word boxes joined by stretchable glue springs, ending at a
  // flagged penalty: the hyphen tick and the dashed box that would follow it.
  const spring = (x: number, y: number): string =>
    `<path d="M${x},${y} q3,-8 6,0 t6,0 t6,0 t6,0" fill="none" stroke="${P.blueMid}" stroke-width="2" stroke-linecap="round" />`;
  const wordBox = (x: number, w: number): string =>
    `<rect x="${x}" y="30" width="${w}" height="32" rx="4" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.3" />`;
  const hyphen = (x: number, y: number, w: number): string =>
    `<path d="M${x},${y} l${w},0" stroke="${P.amber}" stroke-width="2.5" stroke-linecap="round" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 130" role="img" aria-label="${ariaLabel}">
  ${wordBox(32, 84)}
  ${spring(126, 46)}
  ${wordBox(160, 116)}
  ${spring(288, 46)}
  ${wordBox(322, 146)}
  ${hyphen(480, 46, 12)}
  <rect x="506" y="30" width="82" height="32" rx="4" fill="#f3f7fb" stroke="${P.blueMid}" stroke-width="1.3" stroke-dasharray="4 3" />
  <line x1="32" y1="86" x2="600" y2="86" stroke="${P.hair}" stroke-width="1" />
  <rect x="32" y="100" width="18" height="13" rx="3" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.2" />
  ${text(58, 110.5, box, { size: FS.label, anchor: 'start' })}
  ${spring(150, 106.5)}
  ${text(186, 110.5, glue, { size: FS.label, anchor: 'start' })}
  ${hyphen(286, 106.5, 14)}
  ${text(308, 110.5, penalty, { size: FS.label, anchor: 'start' })}
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

/** Four page thumbnails showing the supported column structures. */
function columnLayoutsSvg(es: boolean): string {
  const ariaLabel = es ? 'estructuras de columnas soportadas' : 'supported column structures';
  const one = es ? 'Una' : 'Single';
  const two = es ? 'Dos' : 'Two';
  const three = es ? 'Tres' : 'Three';
  const half = es ? 'Columna y media' : 'One-and-a-half';
  // Each thumbnail is a page card; columns render as faux text-line bars so
  // the structures read as flowing text rather than solid slabs.
  const page = (x: number, inner: string): string =>
    `<rect x="${x}" y="14" width="108" height="106" rx="5" fill="${P.paper}" stroke="${P.edgeSoft}" />${inner}`;
  const col = (x: number, w: number): string => {
    const lines: string[] = [];
    for (let i = 0; i < 9; i++) {
      const lw = i % 4 === 3 ? w * 0.72 : w;
      lines.push(`<rect x="${x}" y="${24 + i * 10}" width="${lw.toFixed(1)}" height="4.5" rx="2.25" fill="#bcd0e8" />`);
    }
    return lines.join('');
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 150" role="img" aria-label="${ariaLabel}">
  ${page(41, col(53, 84))}
  ${page(189, col(201, 37) + col(248, 37))}
  ${page(337, col(349, 22) + col(380, 22) + col(411, 22))}
  ${page(485, col(497, 52) + col(557, 24))}
  ${text(95, 138, one, { size: FS.label })}
  ${text(243, 138, two, { size: FS.label })}
  ${text(391, 138, three, { size: FS.label })}
  ${text(539, 138, half, { size: FS.label })}
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
  const leftWidths = [174, 165, 174, 157];
  const rightWidths = [174, 163, 174, 152, 174, 168, 174, 160, 171, 174];
  const left = leftWidths.map((w, i) => bar(58, 92 + i * 12, w)).join('\n  ');
  const right = rightWidths.map((w, i) => bar(248, 28 + i * 12, w)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 200" role="img" aria-label="${ariaLabel}">
  <rect x="36" y="14" width="408" height="172" rx="7" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="58" y="26" width="174" height="50" rx="5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.3" />
  ${text(145, 54.5, top, { size: FS.label, color: P.blueDark, weight: 600 })}
  ${left}
  ${right}
  <rect x="58" y="148" width="364" height="26" rx="5" fill="${P.blue}" stroke="${P.blueDark}" stroke-width="1" />
  ${text(240, 164.5, full, { size: FS.label, color: '#ffffff', weight: 600 })}
  <line x1="444" y1="49" x2="463" y2="49" stroke="${P.muted}" stroke-width="1.2" stroke-dasharray="3 3" />
  <rect x="463" y="26" width="141" height="46" rx="5" fill="${P.amberTint}" stroke="${P.amber}" stroke-width="1.3" />
  ${text(533, 52.5, margin, { size: FS.label, color: P.amberDark, weight: 600 })}
</svg>`;
}

/** The Sandbox interface: activity bar, sidebar editor, and a three-tab
 *  viewport. */
function sandboxUiSvg(es: boolean): string {
  const ariaLabel = es ? 'disposición de la interfaz del Sandbox' : 'Sandbox interface layout';
  // Activity bar icons (first one active), editor card with markdown-ish
  // lines, and a viewport card with a tab bar and a miniature rendered page.
  const icons = [46, 88, 130]
    .map((y, i) => `<rect x="35" y="${y}" width="28" height="28" rx="7" fill="${i === 0 ? P.blue : '#c9d4df'}" />`)
    .join('\n  ');
  const editorWidths = [102, 155, 144, 155, 123, 155, 148, 88, 155, 137];
  const editorLines = editorWidths
    .map((w, i) => bar(106, 84 + i * 19, w, i === 0 ? '#9fb0c2' : P.barSoft, 8))
    .join('\n  ');
  const pageLines = [123, 139, 155, 218, 234, 250]
    .map((y) => bar(394, y, 102, '#dbe3ea', 6))
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 335" role="img" aria-label="${ariaLabel}">
  <rect x="18" y="21" width="599" height="292" rx="14" fill="${P.panel}" stroke="${P.edgeSoft}" />
  ${icons}
  <rect x="85" y="39" width="190" height="257" rx="11" fill="${P.paper}" stroke="${P.hair}" />
  ${text(106, 65, 'Editor', { size: FS.small, color: P.muted, weight: 600, anchor: 'start' })}
  ${editorLines}
  <rect x="289" y="39" width="310" height="257" rx="11" fill="${P.paper}" stroke="${P.hair}" />
  ${text(345, 70, 'Canvas', { size: FS.label, color: P.blueDark, weight: 600 })}
  <rect x="317" y="79" width="56" height="4" rx="2" fill="${P.blue}" />
  ${text(444, 70, 'HTML', { size: FS.label, color: P.muted })}
  ${text(539, 70, 'PDF', { size: FS.label, color: P.muted })}
  <line x1="290" y1="88" x2="598" y2="88" stroke="${P.hair}" stroke-width="1" />
  <rect x="380" y="106" width="130" height="169" rx="5" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${pageLines}
  <rect x="394" y="169" width="102" height="39" rx="3" fill="${P.blueTint}" />
</svg>`;
}

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads.
 *  Widths follow the shared unit system: COLUMN_VW for column-span figures,
 *  PAGE_VW for page-span ones (see FIGURE_SPECS placements). */
export const SVG_FIGURES: Record<string, { generate: (es: boolean) => string; width: number; height: number }> = {
  'default-layout-pipeline': { generate: pipelineSvg, width: COLUMN_VW, height: 225 },
  'default-convergence-loop': { generate: convergenceLoopSvg, width: PAGE_VW, height: 170 },
  'default-measurement-speed': { generate: measurementSpeedSvg, width: COLUMN_VW, height: 190 },
  'default-orphan-widow': { generate: orphanWidowSvg, width: COLUMN_VW, height: 180 },
  'default-knuth-plass': { generate: knuthPlassSvg, width: PAGE_VW, height: 130 },
  'default-baseline-grid': { generate: baselineGridSvg, width: COLUMN_VW, height: 170 },
  'default-column-layouts': { generate: columnLayoutsSvg, width: PAGE_VW, height: 150 },
  'default-placement-strategies': { generate: placementStrategiesSvg, width: PAGE_VW, height: 200 },
  'default-sandbox-ui': { generate: sandboxUiSvg, width: PAGE_VW, height: 335 },
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
