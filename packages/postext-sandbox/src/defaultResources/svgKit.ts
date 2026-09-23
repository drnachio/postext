// Shared drawing kit of the guide's example figures (see `index.ts` for the
// unit system and the design rules the figures follow).

/** Canvas width (in SVG user units) for figures placed at column span. */
export const COLUMN_VW = 300;
/** Canvas width for figures placed at page span: COLUMN_VW × the default
 *  page/column width ratio, so both spans share one physical unit scale. */
export const PAGE_VW = 634;

/** Shared type scale, in canvas units (≈0.63 pt per unit at the default page
 *  geometry, against an 8 pt body): primary labels, secondary annotations,
 *  and the single emphasised metric. */
export const FS = { label: 11.5, small: 10, strong: 13 };

/** Typeface stack for all diagram labels. Single quotes only — these strings
 *  land inside double-quoted SVG attributes. */
export const FONT = "Geist, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** Shared diagram palette. */
export const P = {
  text: '#44586d',     // primary labels
  muted: '#7b8da0',    // annotations, secondary labels
  line: '#8296a9',     // connectors and arrowheads
  hair: '#dde4eb',     // hairline strokes
  edgeSoft: '#c5d1dd', // card / chip outlines
  barSoft: '#cdd7e1',  // placeholder text-line bars
  panel: '#f2f5f8',    // neutral panel fill
  paper: '#ffffff',
  blue: '#2b4acb',
  blueDark: '#1d2f8c',
  blueMid: '#8c9de4',
  blueTint: '#eaeefb',
  amber: '#b7820f',
  amberDark: '#7a5608',
  amberTint: '#f7f1e3',
};

/** Kept for the figures that interpolate it: arrowheads are drawn as plain
 *  paths by {@link edge} (SVG markers are outside the vector subset the PDF
 *  draws natively, and would send the whole figure to the raster fallback). */
export const DEFS = '';

const ARROW_COLOURS = { ah: P.line, ahBlue: P.blue, ahAmber: P.amber } as const;

/** An arrowhead at the end of path `d`, pointing along its last segment (the
 *  last two coordinate pairs of the path: the end point and the point — or
 *  control point — before it). */
export function arrowHead(d: string, fill: string): string {
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  if (nums.length < 4) return '';
  const [x2, y2] = [nums[nums.length - 2]!, nums[nums.length - 1]!];
  const [x1, y1] = [nums[nums.length - 4]!, nums[nums.length - 3]!];
  const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return `<path d="M0.5,0.5 L7.5,3.5 L0.5,6.5 C1.6,5.3 1.6,1.7 0.5,0.5 Z" fill="${fill}" transform="translate(${x2.toFixed(2)},${y2.toFixed(2)}) rotate(${deg.toFixed(2)}) translate(-7,-3.5)" />`;
}

export interface TextOpts {
  size?: number;
  color?: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  italic?: boolean;
}

export function text(x: number, y: number, content: string, o: TextOpts = {}): string {
  const { size = FS.label, color = P.text, weight = 400, anchor = 'middle', italic = false } = o;
  const weightDecl = weight !== 400 ? ` font-weight="${weight}"` : '';
  const italicDecl = italic ? ' font-style="italic"' : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${weightDecl}${italicDecl} fill="${color}">${content}</text>`;
}

export type NodeTone = 'neutral' | 'tint' | 'solid' | 'accent';

export const NODE_TONES: Record<NodeTone, { fill: string; stroke: string; label: string }> = {
  neutral: { fill: P.panel, stroke: '#b9c7d5', label: P.text },
  tint: { fill: P.blueTint, stroke: P.blue, label: P.blueDark },
  solid: { fill: P.blue, stroke: P.blueDark, label: '#ffffff' },
  accent: { fill: P.amberTint, stroke: P.amber, label: P.amberDark },
};

/** A rounded node with a centred single-line label. */
export function node(x: number, y: number, w: number, h: number, label: string, tone: NodeTone, size = FS.label): string {
  const t = NODE_TONES[tone];
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.4" />
  ${text(x + w / 2, y + h / 2 + size * 0.36, label, { size, color: t.label, weight: 600 })}`;
}

/** A connector path with an arrowhead. */
export function edge(d: string, o: { color?: string; dash?: string; marker?: 'ah' | 'ahBlue' | 'ahAmber' | null } = {}): string {
  const { color = P.line, dash, marker = 'ah' } = o;
  const dashDecl = dash ? ` stroke-dasharray="${dash}"` : '';
  const head = marker ? arrowHead(d, ARROW_COLOURS[marker]) : '';
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"${dashDecl} />${head}`;
}

/** A placeholder text-line bar. */
export function bar(x: number, y: number, w: number, color = P.barSoft, h = 5): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${color}" />`;
}

