// Single-ink recolouring of SVG markup (diagramStyle.singleInk).
//
// Maps every colour literal in an SVG to a tint of one ink so the figure
// reproduces faithfully when printed with a single spot colour. The mapping
// preserves perceived value: a colour's relative luminance picks the tint
// strength (white → paper, black → full ink), so light fills stay light and
// dark strokes/text stay dark regardless of their original hue.
//
// Operates on the markup as text (DOM-free): hex literals and rgb()/rgba()
// and hsl()/hsla() functions (integer, decimal or percentage channels, comma
// or space syntax) are rewritten wherever they appear — presentation
// attributes, inline `style`, gradients, `<defs>` — and the keywords `white`
// and `black` where they are a paint value. `none`, `transparent`,
// `currentColor` and other named colours are left untouched, and so is the
// default black of a shape or text with no fill; alpha channels are
// preserved.
//
// The mapping is not idempotent (a second pass lightens every colour), so
// the recoloured markup is marked on its root element and never recoloured
// again: see SINGLE_INK_MARK.

import type { ResolvedConfig } from '../vdt';
import { resolveColorValue } from '../defaults/shared';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

/** Relative luminance in [0, 1] (Rec. 709 coefficients on gamma-encoded
 *  channels — a perceptual approximation that is plenty for tint mapping). */
function luminance(c: Rgb): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/** Mix `ink` over white at the strength implied by the source colour's
 *  darkness: white maps to white, black maps to the full ink. */
function tint(source: Rgb, ink: Rgb): Rgb {
  const strength = 1 - luminance(source);
  return {
    r: Math.round(255 + (ink.r - 255) * strength),
    g: Math.round(255 + (ink.g - 255) * strength),
    b: Math.round(255 + (ink.b - 255) * strength),
  };
}

function toHex(c: Rgb): string {
  const ch = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
/** A number or percentage inside a colour function. */
const NUM = String.raw`([0-9]*\.?[0-9]+%?)`;
/** Between two components: a comma, or spaces (CSS Color 4). */
const SEP = String.raw`\s*(?:,\s*|\s+)`;
/** The optional alpha: after a comma or a slash. */
const ALPHA = String.raw`(?:\s*[,/]\s*${NUM})?`;
const RGB_RE = new RegExp(String.raw`rgba?\(\s*${NUM}${SEP}${NUM}${SEP}${NUM}${ALPHA}\s*\)`, 'gi');
const HSL_RE = new RegExp(
  String.raw`hsla?\(\s*([+-]?[0-9]*\.?[0-9]+)(deg|grad|rad|turn)?${SEP}([0-9]*\.?[0-9]+)%${SEP}([0-9]*\.?[0-9]+)%${ALPHA}\s*\)`,
  'gi',
);

/** An rgb() channel, 0..255 (a percentage of 255), or null out of range. */
function channel(token: string): number | null {
  const v = token.endsWith('%') ? (parseFloat(token) / 100) * 255 : parseFloat(token);
  return Number.isFinite(v) && v >= 0 && v <= 255 ? v : null;
}

/** The alpha of a colour function as written in the output: a number
 *  (`0.5`) kept verbatim, a percentage turned into one. */
function alphaToken(token: string): string {
  return token.endsWith('%') ? String(+(parseFloat(token) / 100).toFixed(4)) : token;
}

/** `hsl()` components to RGB channels, 0..255. */
function hslToRgb(hue: number, unit: string | undefined, sat: number, light: number): Rgb | null {
  const turns = unit === 'turn' ? hue : unit === 'rad' ? hue / (2 * Math.PI) : unit === 'grad' ? hue / 400 : hue / 360;
  if (sat > 100 || light > 100) return null;
  const h = (((turns % 1) + 1) % 1) * 6;
  const s = sat / 100;
  const l = light / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** A tinted colour in the function form of its source. */
function rgbFunction(t: Rgb, alpha: string | undefined): string {
  return alpha !== undefined ? `rgba(${t.r}, ${t.g}, ${t.b}, ${alphaToken(alpha)})` : `rgb(${t.r}, ${t.g}, ${t.b})`;
}

/**
 * The attribute {@link applySingleInkToSvg} writes on the root `<svg>` of
 * the markup it recolours, naming the ink (`data-postext-single-ink="#1f3a93"`).
 * Markup that carries it is never recoloured again — the mapping is not
 * idempotent, so a second pass would lighten every colour: black would come
 * out at `1 − luminance(ink)` of the ink.
 */
export const SINGLE_INK_MARK = 'data-postext-single-ink';

/** Every `<svg` start tag. */
const SVG_OPEN_RE = /<svg(?=[\s/>])/gi;

/** Where the root `<svg` start tag begins (one inside an XML comment does
 *  not count), or -1 when the markup has none. */
function rootSvgStart(svgText: string): number {
  SVG_OPEN_RE.lastIndex = 0;
  for (let m = SVG_OPEN_RE.exec(svgText); m; m = SVG_OPEN_RE.exec(svgText)) {
    const open = svgText.lastIndexOf('<!--', m.index);
    if (open >= 0) {
      const close = svgText.indexOf('-->', open + 4);
      if (close < 0 || close > m.index) continue;
    }
    return m.index;
  }
  return -1;
}

/** Whether SVG markup was recoloured by {@link applySingleInkToSvg} already:
 *  its root element carries {@link SINGLE_INK_MARK}. */
export function isSingleInkSvg(svgText: string): boolean {
  const start = rootSvgStart(svgText);
  if (start < 0) return false;
  const end = svgText.indexOf('>', start);
  const tag = end < 0 ? svgText.slice(start) : svgText.slice(start, end);
  return new RegExp(`\\s${SINGLE_INK_MARK}\\s*=`).test(tag);
}

/** How much of a data URL's payload {@link isSingleInkSvgUrl} reads: the
 *  root start tag sits at the top of the markup. */
const DATA_URL_HEAD = 8192;

/**
 * Whether an image URL is an SVG data URI whose markup carries
 * {@link SINGLE_INK_MARK} — a picture recoloured by
 * {@link applySingleInkToSvg} before it was handed over as a URL. Only the
 * head of the payload is read. A blob or network URL cannot tell (false).
 */
export function isSingleInkSvgUrl(url: string): boolean {
  const head = /^data:image\/svg\+xml(;[^,]*)?,/i.exec(url);
  if (!head) return false;
  const body = url.slice(head[0].length, head[0].length + DATA_URL_HEAD);
  let text: string;
  try {
    text = /;base64/i.test(head[1] ?? '')
      ? atob(body.slice(0, body.length - (body.length % 4)))
      : decodeURIComponent(body.replace(/%[0-9a-f]?$/i, ''));
  } catch {
    return false;
  }
  return isSingleInkSvg(text);
}

/**
 * Recolour an SVG document to tints of a single ink.
 *
 * The result carries {@link SINGLE_INK_MARK} on its root element, and
 * markup that already carries it is returned as it is — whatever ink it
 * names — so a picture is never tinted twice, whichever of the host and
 * the backends recolours it first.
 *
 * @param svgText The SVG markup.
 * @param inkHex  The ink colour as a hex string (e.g. `'#295AA3'`).
 * @returns The recoloured markup; returns the input unchanged when `inkHex`
 *          cannot be parsed or the markup is marked as recoloured already.
 */
export function applySingleInkToSvg(svgText: string, inkHex: string): string {
  const ink = parseHex(inkHex);
  if (!ink) return svgText;
  if (isSingleInkSvg(svgText)) return svgText;

  const recoloured = svgText
    .replace(HEX_RE, (match, digits: string) => {
      const rgb = parseHex(digits);
      if (!rgb) return match;
      // Preserve a trailing alpha nibble/byte (#rgba / #rrggbbaa).
      const alpha = digits.length === 4 ? digits[3]! + digits[3]! : digits.length === 8 ? digits.slice(6) : '';
      return toHex(tint(rgb, ink)) + alpha;
    })
    .replace(RGB_RE, (match, r: string, g: string, b: string, a: string | undefined) => {
      const [cr, cg, cb] = [channel(r), channel(g), channel(b)];
      if (cr === null || cg === null || cb === null) return match;
      return rgbFunction(tint({ r: cr, g: cg, b: cb }, ink), a);
    })
    .replace(HSL_RE, (match, h: string, unit: string | undefined, s: string, l: string, a: string | undefined) => {
      const rgb = hslToRgb(parseFloat(h), unit?.toLowerCase(), parseFloat(s), parseFloat(l));
      return rgb ? rgbFunction(tint(rgb, ink), a) : match;
    })
    // Keyword colours only where they appear as a paint value (attribute or
    // inline-style property) — never inside text content or labels.
    .replace(
      /(fill|stroke|stop-color|flood-color|color)(="|:\s*)(white|black)\b/g,
      (_m, prop: string, sep: string, kw: string) => `${prop}${sep}${kw === 'black' ? toHex(ink) : '#ffffff'}`,
    );
  // Marked after the colour pass, which would otherwise tint the mark's
  // own hex value.
  const root = rootSvgStart(recoloured);
  if (root < 0) return recoloured;
  const at = root + '<svg'.length;
  return `${recoloured.slice(0, at)} ${SINGLE_INK_MARK}="${toHex(ink)}"${recoloured.slice(at)}`;
}

/**
 * Recolour RGBA pixels in place to tints of a single ink — the mapping of
 * {@link applySingleInkToSvg}, applied to a rendered picture instead of its
 * markup (the canvas backend's path for SVG images it was handed decoded).
 * Alpha is kept; fully transparent pixels are skipped.
 *
 * @returns false (and leaves `data` as it was) when `inkHex` cannot be parsed.
 */
export function applySingleInkToPixels(data: Uint8ClampedArray, inkHex: string): boolean {
  const ink = parseHex(inkHex);
  if (!ink) return false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const t = tint({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }, ink);
    data[i] = t.r;
    data[i + 1] = t.g;
    data[i + 2] = t.b;
  }
  return true;
}

/**
 * The same mapping as the 4×5 matrix of an SVG `feColorMatrix` (values row
 * by row, on 0..1 gamma-encoded channels — use it with
 * `color-interpolation-filters="sRGB"`): each channel becomes
 * `ink + (1 − ink) · luminance`, alpha passes through. The HTML backend
 * filters SVG `<img>`s with it. Null when `inkHex` cannot be parsed.
 */
export function singleInkColorMatrix(inkHex: string): number[] | null {
  const ink = parseHex(inkHex);
  if (!ink) return null;
  const rows = [ink.r, ink.g, ink.b].map((c) => {
    const i = c / 255;
    const k = 1 - i;
    return [k * 0.2126, k * 0.7152, k * 0.0722, 0, i];
  });
  return [...rows.flat(), 0, 0, 0, 1, 0];
}

/** The ink a document's SVG pictures are recoloured to — its resolved
 *  `diagramStyle.inkColor` — or null when `diagramStyle.singleInk` is off.
 *  Shared by the canvas, HTML and PDF backends. */
export function documentInkHex(config: Pick<ResolvedConfig, 'diagramStyle' | 'colorPalette'>): string | null {
  const ds = config.diagramStyle;
  if (!ds?.singleInk) return null;
  return resolveColorValue(ds.inkColor, config.colorPalette, ds.inkColor).hex;
}
