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
// ───────────────────────────────────────────────────────────────────────────

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
  const { size = 12, color = P.text, weight = 400, anchor = 'middle', italic = false } = o;
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
function node(x: number, y: number, w: number, h: number, label: string, tone: NodeTone, size = 12.5): string {
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

/** The Postext pipeline: Markdown → parse → layout → three renderers. The
 *  stage fills deepen left to right (source → engine), and the three output
 *  targets render as pill chips fed by a fan-out. */
function pipelineSvg(es: boolean): string {
  const parse = es ? 'Análisis' : 'Parse';
  const layout = es ? 'Maquetación' : 'Layout';
  const ariaLabel = es ? 'tubería de Postext' : 'Postext pipeline';
  const chip = (y: number, label: string, dot: string): string =>
    `<rect x="394" y="${y}" width="74" height="28" rx="14" fill="${P.paper}" stroke="${P.edgeSoft}" stroke-width="1.2" />
  <circle cx="${394 + 15}" cy="${y + 14}" r="3.5" fill="${dot}" />
  ${text(394 + 26, y + 18, label, { size: 11.5, weight: 600, anchor: 'start' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(10, 50, 94, 40, 'Markdown', 'neutral')}
  ${node(138, 50, 94, 40, parse, 'tint')}
  ${node(266, 50, 96, 40, layout, 'solid')}
  ${chip(16, 'Canvas', P.blue)}
  ${chip(56, 'PDF', P.amber)}
  ${chip(96, 'HTML', P.muted)}
  ${edge('M106,70 L132,70')}
  ${edge('M234,70 L260,70')}
  ${edge('M364,70 C380,70 378,30 390,30')}
  ${edge('M364,70 L390,70')}
  ${edge('M364,70 C380,70 378,110 390,110')}
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 170" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(26, 46, 104, 42, place, 'tint')}
  ${node(188, 46, 104, 42, check, 'tint')}
  ${node(350, 46, 104, 42, done, 'solid')}
  ${node(188, 118, 104, 36, adjust, 'accent', 12)}
  ${edge('M130,67 L184,67')}
  ${edge('M292,67 L346,67', { marker: 'ahBlue', color: P.blue })}
  ${text(319, 59, ok, { size: 10, color: P.blueDark, italic: true })}
  ${edge('M240,88 L240,114', { color: P.amber, marker: 'ahAmber' })}
  ${text(248, 105, conflict, { size: 10, color: P.amberDark, italic: true, anchor: 'start' })}
  ${edge('M184,136 L86,136 Q78,136 78,128 L78,94', { dash: '5 4' })}
  <rect x="${134 - itersWidth / 2}" y="127" width="${itersWidth}" height="18" rx="9" fill="${P.paper}" stroke="${P.hair}" />
  ${text(134, 139.5, iters, { size: 10, color: P.muted })}
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${gridlines}
  ${text(30, 40, timeAxis, { size: 9.5, color: P.muted, anchor: 'end', italic: true })}
  ${roundTopBar(64, 32, 60, '#c9d4df', '#9aaaba')}
  ${roundTopBar(192, 143, 60, P.blue, P.blueDark)}
  <line x1="36" y1="150" x2="276" y2="150" stroke="#9aaaba" stroke-width="1.5" />
  ${edge('M128,38 C168,52 186,94 210,136', { marker: 'ahBlue', color: P.blue })}
  ${text(230, 106, '300–600×', { size: 13.5, color: P.blueDark, weight: 700 })}
  ${text(230, 121, fasterWord, { size: 10.5, color: P.muted })}
  ${text(94, 169, withDom, { size: 11.5, weight: 600 })}
  ${text(222, 169, withoutDom, { size: 11.5, weight: 600 })}
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180" role="img" aria-label="${ariaLabel}">
  <rect x="16" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="168" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${leftLines}
  ${bar(26, 144, 56, P.amber)}
  ${text(74, 175, widow, { size: 10.5, color: P.amberDark, weight: 600 })}
  ${bar(178, 32, 96, P.amber)}
  ${text(226, 13, orphan, { size: 10.5, color: P.amberDark, weight: 600 })}
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 130" role="img" aria-label="${ariaLabel}">
  ${wordBox(24, 64)}
  ${spring(96, 46)}
  ${wordBox(128, 88)}
  ${spring(224, 46)}
  ${wordBox(256, 110)}
  ${hyphen(374, 46, 12)}
  <rect x="394" y="30" width="62" height="32" rx="4" fill="#f3f7fb" stroke="${P.blueMid}" stroke-width="1.3" stroke-dasharray="4 3" />
  <line x1="24" y1="86" x2="456" y2="86" stroke="${P.hair}" stroke-width="1" />
  <rect x="24" y="100" width="18" height="13" rx="3" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.2" />
  ${text(50, 110.5, box, { size: 11.5, anchor: 'start' })}
  ${spring(130, 106.5)}
  ${text(166, 110.5, glue, { size: 11.5, anchor: 'start' })}
  ${hyphen(246, 106.5, 14)}
  ${text(268, 110.5, penalty, { size: 11.5, anchor: 'start' })}
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
  const pillW = es ? 140 : 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 170" role="img" aria-label="${ariaLabel}">
  ${grid}
  ${left}
  ${right}
  <line x1="18" y1="88" x2="282" y2="88" stroke="${P.blue}" stroke-width="1.4" stroke-dasharray="5 4" />
  <rect x="${150 - pillW / 2}" y="142" width="${pillW}" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" stroke-width="1" />
  ${text(150, 155.5, label, { size: 11, color: P.blueDark, weight: 600 })}
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
    `<rect x="${x}" y="14" width="92" height="94" rx="5" fill="${P.paper}" stroke="${P.edgeSoft}" />${inner}`;
  const col = (x: number, w: number): string => {
    const lines: string[] = [];
    for (let i = 0; i < 8; i++) {
      const lw = i % 4 === 3 ? w * 0.72 : w;
      lines.push(`<rect x="${x}" y="${22 + i * 10}" width="${lw.toFixed(1)}" height="4.5" rx="2.25" fill="#bcd0e8" />`);
    }
    return lines.join('');
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" role="img" aria-label="${ariaLabel}">
  ${page(18, col(28, 72))}
  ${page(136, col(146, 33) + col(185, 33))}
  ${page(254, col(264, 20.5) + col(290, 20.5) + col(315.5, 20.5))}
  ${page(372, col(382, 46) + col(434, 20))}
  ${text(64, 126, one, { size: 11 })}
  ${text(182, 126, two, { size: 11 })}
  ${text(300, 126, three, { size: 11 })}
  ${text(418, 126, half, { size: 11 })}
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
  const leftWidths = [126, 120, 126, 114];
  const rightWidths = [126, 118, 126, 110, 126, 122, 126, 116, 124, 126];
  const left = leftWidths.map((w, i) => bar(42, 92 + i * 12, w)).join('\n  ');
  const right = rightWidths.map((w, i) => bar(180, 28 + i * 12, w)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 200" role="img" aria-label="${ariaLabel}">
  <rect x="26" y="14" width="296" height="172" rx="7" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="42" y="26" width="126" height="50" rx="5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.3" />
  ${text(105, 54.5, top, { size: 10.5, color: P.blueDark, weight: 600 })}
  ${left}
  ${right}
  <rect x="42" y="148" width="264" height="26" rx="5" fill="${P.blue}" stroke="${P.blueDark}" stroke-width="1" />
  ${text(174, 164.5, full, { size: 10.5, color: '#ffffff', weight: 600 })}
  <line x1="322" y1="49" x2="336" y2="49" stroke="${P.muted}" stroke-width="1.2" stroke-dasharray="3 3" />
  <rect x="336" y="26" width="102" height="46" rx="5" fill="${P.amberTint}" stroke="${P.amber}" stroke-width="1.3" />
  ${text(387, 52.5, margin, { size: 10.5, color: P.amberDark, weight: 600 })}
</svg>`;
}

/** The Sandbox interface: activity bar, sidebar editor, and a three-tab
 *  viewport. */
function sandboxUiSvg(es: boolean): string {
  const editor = es ? 'Editor' : 'Editor';
  const ariaLabel = es ? 'disposición de la interfaz del Sandbox' : 'Sandbox interface layout';
  // Activity bar icons (first one active), editor card with markdown-ish
  // lines, and a viewport card with a tab bar and a miniature rendered page.
  const icons = [26, 50, 74]
    .map((y, i) => `<rect x="20" y="${y}" width="16" height="16" rx="4" fill="${i === 0 ? P.blue : '#c9d4df'}" />`)
    .join('\n  ');
  const editorWidths = [58, 88, 82, 88, 70, 88, 84, 50, 88, 78];
  const editorLines = editorWidths
    .map((w, i) => bar(60, 46 + i * 11, w, i === 0 ? '#9fb0c2' : P.barSoft, 4.5))
    .join('\n  ');
  const pageLines = [70, 79, 88, 124, 133, 142]
    .map((y) => bar(224, y, 58, '#dbe3ea', 3.5))
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" role="img" aria-label="${ariaLabel}">
  <rect x="10" y="12" width="340" height="166" rx="8" fill="${P.panel}" stroke="${P.edgeSoft}" />
  ${icons}
  <rect x="48" y="22" width="108" height="146" rx="6" fill="${P.paper}" stroke="${P.hair}" />
  ${text(60, 37, editor, { size: 10, color: P.muted, weight: 600, anchor: 'start' })}
  ${editorLines}
  <rect x="164" y="22" width="176" height="146" rx="6" fill="${P.paper}" stroke="${P.hair}" />
  ${text(196, 40, 'Canvas', { size: 10, color: P.blueDark, weight: 600 })}
  <rect x="180" y="45" width="32" height="2.5" rx="1.25" fill="${P.blue}" />
  ${text(252, 40, 'HTML', { size: 10, color: P.muted })}
  ${text(306, 40, 'PDF', { size: 10, color: P.muted })}
  <line x1="165" y1="50" x2="339" y2="50" stroke="${P.hair}" stroke-width="1" />
  <rect x="216" y="60" width="74" height="96" rx="3" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${pageLines}
  <rect x="224" y="96" width="58" height="22" rx="2" fill="${P.blueTint}" />
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
