// Lengths, colours and paints, and the style cascade of presentation
// attributes and style declarations (#1276: split out of svgVector.ts).
import { LineCapStyle, LineJoinStyle } from 'pdf-lib';
import type { VectorPaint } from '../svgVector.js';
import { unsupported } from './geometry.js';

// ------------------------------------------------------------ styling

/** Parse a length in user units. Absolute CSS units are converted at 96 dpi
 *  (the SVG user unit is a CSS px); relative units are unsupported. */
export function parseLength(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z%]*)\s*$/.exec(value);
  if (!m) return unsupported(`length ${value}`);
  const num = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const factor: Record<string, number> = { '': 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
  const f = factor[unit];
  if (f === undefined) unsupported(`length unit ${unit}`);
  return num * f!;
}

function parseNumberOrPercent(value: string, fallback: number): number {
  const v = value.trim();
  if (v === '') return fallback;
  if (v.endsWith('%')) {
    const p = Number(v.slice(0, -1));
    return Number.isFinite(p) ? p / 100 : fallback;
  }
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff',
  beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff',
  blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9',
  darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1',
  darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22', fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899',
  lightslategrey: '#778899', lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970',
  mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd',
  powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f',
  royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
  slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4',
  tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0',
  violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

/** A parsed paint: a colour, `none`, or `currentColor` (resolved later). */
export type Paint = VectorPaint | 'none' | 'currentColor';

function parsePaint(value: string): Paint {
  const v = value.trim();
  const lower = v.toLowerCase();
  if (lower === 'none') return 'none';
  if (lower === 'transparent') return { hex: '#000000', alpha: 0 };
  if (lower === 'currentcolor') return 'currentColor';
  if (v.startsWith('#')) {
    const h = v.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(h)) unsupported(`colour ${v}`);
    const expand = (c: string) => c + c;
    if (h.length === 3) return { hex: `#${expand(h[0]!)}${expand(h[1]!)}${expand(h[2]!)}`.toLowerCase(), alpha: 1 };
    if (h.length === 4) {
      return {
        hex: `#${expand(h[0]!)}${expand(h[1]!)}${expand(h[2]!)}`.toLowerCase(),
        alpha: parseInt(expand(h[3]!), 16) / 255,
      };
    }
    if (h.length === 6) return { hex: `#${h}`.toLowerCase(), alpha: 1 };
    if (h.length === 8) return { hex: `#${h.slice(0, 6)}`.toLowerCase(), alpha: parseInt(h.slice(6), 16) / 255 };
    return unsupported(`colour ${v}`);
  }
  const fn = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (fn) {
    const parts = fn[1]!.split(/[\s,/]+/).filter((s) => s !== '');
    if (parts.length < 3 || parts.length > 4) unsupported(`colour ${v}`);
    const chan = (s: string): number => {
      const c = s.endsWith('%') ? (Number(s.slice(0, -1)) / 100) * 255 : Number(s);
      if (!Number.isFinite(c)) unsupported(`colour ${v}`);
      return Math.max(0, Math.min(255, Math.round(c)));
    };
    const hex = `#${[parts[0]!, parts[1]!, parts[2]!].map((p) => chan(p).toString(16).padStart(2, '0')).join('')}`;
    const alpha = parts.length === 4 ? Math.max(0, Math.min(1, parseNumberOrPercent(parts[3]!, 1))) : 1;
    return { hex, alpha };
  }
  const named = NAMED_COLORS[lower];
  if (named) return { hex: named, alpha: 1 };
  // url(#gradient), var(), hsl(), … — no vector equivalent here.
  return unsupported(`paint ${v}`);
}

/** Inherited / cascaded presentation state. */
export interface Style {
  fill: Paint;
  fillOpacity: number;
  evenOdd: boolean;
  stroke: Paint;
  strokeOpacity: number;
  strokeWidth: number;
  cap: LineCapStyle;
  join: LineJoinStyle;
  miterLimit: number;
  dash: number[] | null;
  dashOffset: number;
  /** Accumulated group opacity (not inherited in SVG; multiplied here). */
  opacity: number;
  color: VectorPaint;
  visible: boolean;
  clipEvenOdd: boolean;
  fontFamilies: string[];
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  textAnchor: 'start' | 'middle' | 'end';
  /** CSS `direction`: the base direction of text, and which end
   *  `text-anchor: start` names. */
  direction: 'ltr' | 'rtl';
}

export const ROOT_STYLE: Style = {
  fill: { hex: '#000000', alpha: 1 },
  fillOpacity: 1,
  evenOdd: false,
  stroke: 'none',
  strokeOpacity: 1,
  strokeWidth: 1,
  cap: LineCapStyle.Butt,
  join: LineJoinStyle.Miter,
  miterLimit: 4,
  dash: null,
  dashOffset: 0,
  opacity: 1,
  color: { hex: '#000000', alpha: 1 },
  visible: true,
  clipEvenOdd: false,
  fontFamilies: [],
  fontSize: 16,
  fontWeight: 400,
  italic: false,
  textAnchor: 'start',
  direction: 'ltr',
};

/** Presentation properties honoured from attributes and `style`. */
const STYLE_PROPS = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color',
  'visibility', 'display', 'clip-path', 'clip-rule',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'direction',
  // Text properties that change glyph placement: accepted only at their defaults.
  'letter-spacing', 'word-spacing', 'writing-mode', 'text-decoration',
]);

/** Properties that may appear in `style` and are harmless to ignore
 *  (typography for text we never render, rendering hints, Inkscape extras). */
const IGNORED_STYLE_PROPS = new Set([
  'font-variant', 'font-stretch', 'font-size-adjust',
  'font-feature-settings', 'font-variant-ligatures', 'font-variant-caps', 'font-variant-numeric',
  'font-variant-east-asian', 'line-height', 'text-align',
  'text-rendering', 'unicode-bidi', 'dominant-baseline',
  'baseline-shift', 'kerning', 'glyph-orientation-vertical', 'glyph-orientation-horizontal', 'white-space',
  'inline-size', 'shape-padding', 'shape-margin', 'shape-rendering', 'color-rendering', 'image-rendering',
  'color-interpolation', 'color-interpolation-filters', 'overflow', 'paint-order', 'vector-effect',
  'mix-blend-mode', 'isolation', 'enable-background', 'stop-color', 'stop-opacity', 'cursor', 'pointer-events',
  'transform-origin', 'transform-box',
]);

/** Merge presentation attributes and the `style` attribute (which wins) into
 *  a flat property map. Unknown properties in `style` bail out unless known
 *  to be harmless. */
function collectProps(attrs: Record<string, string>): Map<string, string> {
  const props = new Map<string, string>();
  for (const [k, v] of Object.entries(attrs)) if (STYLE_PROPS.has(k)) props.set(k, v);
  const style = attrs['style'];
  if (style) {
    for (const decl of style.split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) {
        if (decl.trim() !== '') unsupported('style syntax');
        continue;
      }
      const name = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim().replace(/\s*!important$/i, '');
      if (name.startsWith('-')) continue; // vendor / Inkscape prefixed
      if (STYLE_PROPS.has(name)) props.set(name, value);
      else if (!IGNORED_STYLE_PROPS.has(name)) unsupported(`style ${name}`);
    }
  }
  return props;
}

export function cascade(parent: Style, attrs: Record<string, string>): Style {
  const props = collectProps(attrs);
  const next: Style = { ...parent, opacity: parent.opacity };
  const get = (name: string): string | undefined => {
    const v = props.get(name);
    if (v === undefined || v.trim().toLowerCase() === 'inherit') return undefined;
    return v;
  };
  const color = get('color');
  if (color !== undefined) {
    const c = parsePaint(color);
    if (c === 'none' || c === 'currentColor') unsupported('color value');
    next.color = c;
  }
  const fill = get('fill');
  if (fill !== undefined) next.fill = parsePaint(fill);
  const fillOpacity = get('fill-opacity');
  if (fillOpacity !== undefined) next.fillOpacity = Math.max(0, Math.min(1, parseNumberOrPercent(fillOpacity, 1)));
  const fillRule = get('fill-rule');
  if (fillRule !== undefined) next.evenOdd = fillRule.trim() === 'evenodd';
  const clipRule = get('clip-rule');
  if (clipRule !== undefined) next.clipEvenOdd = clipRule.trim() === 'evenodd';
  const stroke = get('stroke');
  if (stroke !== undefined) next.stroke = parsePaint(stroke);
  const strokeOpacity = get('stroke-opacity');
  if (strokeOpacity !== undefined) next.strokeOpacity = Math.max(0, Math.min(1, parseNumberOrPercent(strokeOpacity, 1)));
  const strokeWidth = get('stroke-width');
  if (strokeWidth !== undefined) {
    if (strokeWidth.trim().endsWith('%')) unsupported('percent stroke width');
    next.strokeWidth = Math.max(0, parseLength(strokeWidth, 1));
  }
  const cap = get('stroke-linecap');
  if (cap !== undefined) {
    const v = cap.trim();
    next.cap = v === 'round' ? LineCapStyle.Round : v === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt;
  }
  const join = get('stroke-linejoin');
  if (join !== undefined) {
    const v = join.trim();
    next.join = v === 'round' ? LineJoinStyle.Round : v === 'bevel' ? LineJoinStyle.Bevel : LineJoinStyle.Miter;
  }
  const miter = get('stroke-miterlimit');
  if (miter !== undefined) next.miterLimit = Math.max(1, Number(miter) || 4);
  const dash = get('stroke-dasharray');
  if (dash !== undefined) {
    const v = dash.trim().toLowerCase();
    if (v === 'none' || v === '') next.dash = null;
    else {
      const parts = v.split(/[\s,]+/).filter((s) => s !== '').map((s) => parseLength(s, 0));
      if (parts.some((p) => p < 0)) unsupported('negative dash');
      next.dash = parts.every((p) => p === 0) ? null : parts;
    }
  }
  const dashOffset = get('stroke-dashoffset');
  if (dashOffset !== undefined) next.dashOffset = parseLength(dashOffset, 0);
  const opacity = get('opacity');
  if (opacity !== undefined) next.opacity = parent.opacity * Math.max(0, Math.min(1, parseNumberOrPercent(opacity, 1)));
  const visibility = get('visibility');
  if (visibility !== undefined) next.visible = visibility.trim() !== 'hidden' && visibility.trim() !== 'collapse';
  const fontFamily = get('font-family');
  if (fontFamily !== undefined) {
    next.fontFamilies = fontFamily.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter((f) => f !== '');
  }
  const fontSize = get('font-size');
  if (fontSize !== undefined) {
    const v = fontSize.trim();
    if (/[%]$|em$|rem$|ex$|ch$/.test(v) || /^[a-z-]+$/i.test(v)) unsupported('relative font-size');
    next.fontSize = parseLength(v, 16);
  }
  const fontWeight = get('font-weight');
  if (fontWeight !== undefined) {
    const v = fontWeight.trim().toLowerCase();
    if (v === 'normal') next.fontWeight = 400;
    else if (v === 'bold') next.fontWeight = 700;
    else if (v === 'bolder') next.fontWeight = Math.min(900, parent.fontWeight + 300);
    else if (v === 'lighter') next.fontWeight = Math.max(100, parent.fontWeight - 300);
    else if (/^\d+$/.test(v)) next.fontWeight = Number(v);
    else unsupported('font-weight');
  }
  const fontStyle = get('font-style');
  if (fontStyle !== undefined) next.italic = fontStyle.trim() !== 'normal';
  const anchor = get('text-anchor');
  if (anchor !== undefined) {
    const v = anchor.trim();
    next.textAnchor = v === 'middle' ? 'middle' : v === 'end' ? 'end' : 'start';
  }
  const direction = get('direction');
  if (direction !== undefined && direction.trim() !== 'inherit') next.direction = direction.trim() === 'rtl' ? 'rtl' : 'ltr';
  for (const name of ['letter-spacing', 'word-spacing'] as const) {
    const v = get(name);
    if (v !== undefined && v.trim() !== 'normal' && parseLength(v, 0) !== 0) unsupported(name);
  }
  const writingMode = get('writing-mode');
  if (writingMode !== undefined && !/^(horizontal-tb|lr|lr-tb|rl|rl-tb)$/.test(writingMode.trim())) unsupported('writing-mode');
  const decoration = get('text-decoration');
  if (decoration !== undefined && decoration.trim() !== 'none') unsupported('text-decoration');
  return next;
}
