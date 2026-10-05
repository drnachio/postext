// Shared drawing kit of the guide's example figures (see `index.ts` for the
// unit system and the design rules the figures follow).

import type { GuideLang } from './lang';

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

/** The labels' typeface in the Chinese edition: the guide's heading face,
 *  Noto Sans SC, which sets the Latin words of a label too (the PDF sets a
 *  whole run in the first family of the list it can provide). The system
 *  faces after it are what the previews fall back on, since a picture drawn
 *  through `<img>` cannot load web fonts. */
export const FONT_ZH = "'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif";

/** Chinese sample text inside a figure: the guide's Chinese body face. */
export const SERIF_ZH = "'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'Source Han Serif SC', serif";

/** The labels' typeface in the Japanese edition: the guide's Japanese
 *  heading face, Noto Sans JP (its `locl` gives the Japanese forms of the
 *  shared Han characters), then the system gothic faces the previews fall
 *  back on. */
export const FONT_JA = "'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Source Han Sans JP', sans-serif";

/** Japanese sample text inside a figure: the guide's Japanese body face. */
export const SERIF_JA = "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', 'MS Mincho', 'Source Han Serif JP', serif";

/** The labels' typeface in the Arabic edition: the guide's small face, IBM
 *  Plex Sans Arabic, which sets the Latin words of a label too (the PDF sets
 *  a whole run in the first family of the list it can provide, and shapes
 *  its Arabic with HarfBuzz, so the figure stays vector). The system faces
 *  after it are what the previews fall back on. */
export const FONT_AR = "'IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Geeza Pro', 'Segoe UI', Tahoma, sans-serif";

/** `text` with its European digits written as Arabic-Indic ones (١٢٣), the
 *  digits the Arabic edition prints. */
export function arabicDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

/** A kit label: a `<text>` element in {@link FONT}, as {@link text} writes it. */
const KIT_TEXT_RE = new RegExp(`<text x="(-?[\\d.]+)"([^>]*?) font-family="${FONT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');

/** `fragment` (SVG markup on a canvas `width` units wide) seen in a mirror,
 *  as a right-to-left book lays out what a left-to-right one does: shapes,
 *  arrows and the order of things turn about the canvas's centre line,
 *  while every kit label is turned back about its own anchor, so it reads
 *  the right way round at the mirrored place. Set the labels right to left
 *  afterwards (see {@link localizeFigure}): `text-anchor: start` then names
 *  the right end of a label, the mirror of the left end it named. */
export function mirrorFragment(fragment: string, width: number): string {
  const turned = fragment.replace(KIT_TEXT_RE, (_m, x: string, rest: string) =>
    `<text x="${x}" transform="matrix(-1 0 0 1 ${+(2 * Number(x)).toFixed(2)} 0)"${rest} font-family="${FONT}"`);
  return `<g transform="matrix(-1 0 0 1 ${width} 0)">${turned}</g>`;
}

/** A whole figure seen in a mirror (see {@link mirrorFragment}): the
 *  content of its root `<svg>`, on the width its `viewBox` gives. */
export function mirrorSvg(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (!open || close < 0) return svg;
  const width = Number(/viewBox="\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)/.exec(open[0])?.[1]);
  if (!Number.isFinite(width)) return svg;
  const at = open.index + open[0].length;
  return `${svg.slice(0, at)}${mirrorFragment(svg.slice(at, close), width)}${svg.slice(close)}`;
}

/** A figure drawn with the kit, relabelled for its edition. The Chinese
 *  edition sets its labels in {@link FONT_ZH}, the Japanese one in
 *  {@link FONT_JA}, upright (neither has an italic; a slanted Han character
 *  or kana is a browser's fake). The Arabic edition
 *  sets them in {@link FONT_AR}, upright, right to left (`direction="rtl"`):
 *  a label turned back by {@link mirrorFragment} keeps its anchor, which now
 *  names its mirrored end; any other keeps the place it had, its `start`
 *  and `end` swapped. Latin editions are returned as drawn. */
export function localizeFigure(svg: string, lang: GuideLang): string {
  if (lang === 'zh-Hans' || lang === 'ja') {
    const face = lang === 'ja' ? FONT_JA : FONT_ZH;
    return svg.split(`font-family="${FONT}"`).join(`font-family="${face}"`).split(' font-style="italic"').join('');
  }
  if (lang !== 'ar') return svg;
  const labelled = svg.replace(/<text\b[^>]*>/g, (tag) => {
    if (!tag.includes(`font-family="${FONT}"`)) return tag;
    let out = tag.replace(` font-family="${FONT}"`, ` font-family="${FONT_AR}" direction="rtl"`).replace(' font-style="italic"', '');
    if (!out.includes(' transform="')) {
      out = out.replace(/ text-anchor="(start|end)"/, (_m, a: string) => ` text-anchor="${a === 'start' ? 'end' : 'start'}"`);
    }
    return out;
  });
  return labelled;
}

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

