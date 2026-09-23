/**
 * Vector emission of SVG resources into the PDF content stream.
 *
 * Converts a conservative subset of SVG into a flat list of filled / stroked
 * paths in the SVG's root user space, which {@link drawVectorDrawing} then
 * paints with native PDF path operators — so the figure stays vector (sharp at
 * any zoom, tiny on disk) instead of going through a raster fallback.
 *
 * Supported: `svg` (root, `viewBox`, `preserveAspectRatio`), `g` / `a`,
 * `defs`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
 * `use` (of any of the above), `clipPath` (`userSpaceOnUse`), `transform`
 * lists, solid `fill` / `stroke` paints (hex, `rgb()`, named colours,
 * `currentColor`), `fill-rule`, opacities, line caps / joins / miter limit,
 * dash patterns, `display` / `visibility`, the same properties inside a
 * `style` attribute, and — when the caller supplies a {@link VectorFontResolver}
 * — `text` / `tspan` runs (`x`, `y`, single `dx` / `dy`, `font-family`,
 * `font-size`, `font-weight`, `font-style`, `text-anchor`), which are set as
 * real, selectable text in the document's embedded fonts.
 *
 * Anything else — images, gradients, patterns, masks, filters, markers,
 * symbols, nested `svg`, style sheets, `objectBoundingBox` clips, text on a
 * path or with per-glyph positioning, text in a font the resolver cannot
 * provide — makes {@link svgToVectorDrawing} return `null`, and the caller
 * falls back to a raster embed. Bailing out (rather than drawing an
 * approximation) keeps the printed figure faithful to what the screen
 * backends show.
 *
 * Known approximations: group `opacity` is folded into each descendant's fill
 * and stroke alpha (PDF group transparency would need a transparency group
 * XObject); a `clipPath` with several children is the union of its shapes in
 * SVG but is emitted as one nonzero path here; strokes under a non-uniform
 * transform get a uniform width (the geometric mean of the scale factors).
 */

import {
  PDFOperator,
  PDFOperatorNames,
  LineCapStyle,
  LineJoinStyle,
  type PDFFont,
  type PDFImage,
  type PDFName,
  appendBezierCurve,
  drawObject,
  beginText,
  clip,
  clipEvenOdd,
  closePath,
  concatTransformationMatrix,
  endPath,
  endText,
  fill,
  fillAndStroke,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setDashPattern,
  setFillingColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  setTextMatrix,
  stroke,
} from 'pdf-lib';
import { type PageCtx, colorFromHex, showTextShaped } from './primitives';

// ---------------------------------------------------------------- IR types

/** A solid paint: `#rrggbb` plus an alpha in [0, 1]. */
export interface VectorPaint {
  hex: string;
  alpha: number;
}

export interface VectorStroke extends VectorPaint {
  /** Line width in root user units. */
  width: number;
  cap: LineCapStyle;
  join: LineJoinStyle;
  miterLimit: number;
  /** Dash lengths in root user units; `null` for a solid line. */
  dash: number[] | null;
  dashOffset: number;
}

/** Absolute path segment in root user units. */
export type PathSeg =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export interface VectorClip {
  segs: PathSeg[];
  evenOdd: boolean;
}

export interface VectorShape {
  kind: 'path';
  segs: PathSeg[];
  fill: VectorPaint | null;
  evenOdd: boolean;
  stroke: VectorStroke | null;
  /** Clips to intersect before painting, outermost first. */
  clips: VectorClip[];
}

/** A 2-D affine matrix `[a, b, c, d, e, f]` (SVG / PDF convention). */
export type VectorMatrix = readonly [number, number, number, number, number, number];

/** A font the emitter can set text in. `widthOf` measures in the same units
 *  as `size` (the SVG `font-size`); `pdfFont` is the embedded pdf-lib font. */
export interface VectorFont {
  widthOf(text: string, size: number): number;
  pdfFont: PDFFont | null;
}

/** Maps an SVG `font-family` list plus weight / style to an embedded font,
 *  or `null` when none of the families can be provided. */
export type VectorFontResolver = (families: string[], weight: number, italic: boolean) => VectorFont | null;

/** One positioned run of text, in the user space of its `matrix`. */
export interface VectorTextRun {
  text: string;
  font: VectorFont;
  size: number;
  /** Pen position (baseline start) in local units. */
  x: number;
  y: number;
  /** Local → root transform. */
  matrix: VectorMatrix;
  fill: VectorPaint;
}

export interface VectorText {
  kind: 'text';
  runs: VectorTextRun[];
  clips: VectorClip[];
}

/** A raster picture embedded in the SVG (`<image href="data:…">`),
 *  stretched into its `(x, y, width, height)` box in the user space of
 *  `matrix`. `pdfImage` is filled in by the embedder before drawing. */
export interface VectorImage {
  kind: 'image';
  data: Uint8Array;
  format: 'png' | 'jpeg';
  x: number;
  y: number;
  width: number;
  height: number;
  matrix: VectorMatrix;
  clips: VectorClip[];
  pdfImage?: PDFImage;
}

export type VectorItem = VectorShape | VectorText | VectorImage;

export interface VectorDrawing {
  /** `[minX, minY, width, height]` of the root user space. */
  viewBox: [number, number, number, number];
  /** Parsed `preserveAspectRatio`; `null` for `none`. */
  aspect: { xAlign: 0 | 0.5 | 1; yAlign: 0 | 0.5 | 1; slice: boolean } | null;
  shapes: VectorItem[];
}

export interface SvgToVectorOptions {
  /** Font resolver for `text` elements. Without one, any text bails out. */
  fonts?: VectorFontResolver;
  /** Probe mode: unsupported subtrees are skipped instead of aborting the
   *  whole conversion, so a caller can discover every font the text runs
   *  ask for (through `fonts`) even in an SVG that will end up rasterised.
   *  The returned drawing is not meant to be painted. */
  probe?: boolean;
}

// ------------------------------------------------------------ XML parsing

interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlEl[];
  /** Child elements and character data in document order. */
  content: (XmlEl | string)[];
  /** True when the element holds non-whitespace character data. */
  hasText?: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

/** Local name of a qualified name (`svg:path` → `path`); `null` for names in
 *  foreign namespaces we can safely skip (`inkscape:*`, `sodipodi:*`, ...). */
function localName(qualified: string): { local: string; foreign: boolean } {
  const i = qualified.indexOf(':');
  if (i < 0) return { local: qualified, foreign: false };
  const prefix = qualified.slice(0, i);
  return { local: qualified.slice(i + 1), foreign: prefix !== 'svg' };
}

/** Minimal non-validating XML parser: elements, attributes, comments, CDATA,
 *  processing instructions and doctype. Character data is discarded (no
 *  supported element renders text). Returns `null` on malformed input. */
function parseXml(text: string): XmlEl | null {
  const root: XmlEl = { name: '#root', attrs: {}, children: [], content: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  const n = text.length;
  const markText = (from: number, to: number, raw = false): void => {
    if (to <= from) return;
    const top = stack[stack.length - 1]!;
    const chunk = text.slice(from, to);
    if (chunk.trim() !== '') top.hasText = true;
    top.content.push(raw ? chunk : decodeEntities(chunk));
  };
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      markText(i, n);
      break;
    }
    markText(i, lt);
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) return null;
      markText(i + 9, end, true);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!', i)) {
      // <!DOCTYPE ...> possibly with an internal subset in [ ... ].
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const ch = text[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth === 0) break;
      }
      if (j >= n) return null;
      i = j + 1;
      continue;
    }
    if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i + 2);
      if (end < 0) return null;
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) return null;
      i = end + 1;
      continue;
    }
    // Start tag.
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(text[j]!)) j++;
    const name = text.slice(i + 1, j);
    if (!name) return null;
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && /\s/.test(text[j]!)) j++;
      if (j >= n) return null;
      if (text[j] === '/') {
        selfClosing = true;
        j++;
        continue;
      }
      if (text[j] === '>') {
        j++;
        break;
      }
      let k = j;
      while (k < n && !/[\s=/>]/.test(text[k]!)) k++;
      const attrName = text.slice(j, k);
      if (!attrName) return null;
      j = k;
      while (j < n && /\s/.test(text[j]!)) j++;
      if (text[j] !== '=') {
        // Attribute without a value (not valid XML, but harmless).
        attrs[attrName] = '';
        continue;
      }
      j++;
      while (j < n && /\s/.test(text[j]!)) j++;
      const quote = text[j];
      if (quote !== '"' && quote !== "'") return null;
      const close = text.indexOf(quote, j + 1);
      if (close < 0) return null;
      attrs[attrName] = decodeEntities(text.slice(j + 1, close));
      j = close + 1;
    }
    const el: XmlEl = { name, attrs, children: [], content: [] };
    stack[stack.length - 1]!.children.push(el);
    stack[stack.length - 1]!.content.push(el);
    if (!selfClosing) stack.push(el);
    i = j;
  }
  if (stack.length !== 1) return null;
  return root;
}

// ------------------------------------------------------------ geometry

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform length scale of a matrix (geometric mean of its singular values). */
function lengthScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

function transformSegs(segs: PathSeg[], m: Matrix): PathSeg[] {
  return segs.map((s): PathSeg => {
    switch (s[0]) {
      case 'M':
      case 'L': {
        const [x, y] = apply(m, s[1], s[2]);
        return [s[0], x, y];
      }
      case 'C': {
        const [x1, y1] = apply(m, s[1], s[2]);
        const [x2, y2] = apply(m, s[3], s[4]);
        const [x, y] = apply(m, s[5], s[6]);
        return ['C', x1, y1, x2, y2, x, y];
      }
      default:
        return s;
    }
  });
}

class Unsupported extends Error {}

function unsupported(what: string): never {
  throw new Unsupported(what);
}

function parseTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = re.exec(value)) !== null) {
    if (value.slice(consumed, match.index).trim().replace(/,/g, '') !== '') unsupported('transform syntax');
    consumed = match.index + match[0].length;
    const args = match[2]!.trim().split(/[\s,]+/).filter((s) => s !== '').map(Number);
    if (args.some((v) => !Number.isFinite(v))) unsupported('transform args');
    let t: Matrix;
    switch (match[1]) {
      case 'matrix':
        if (args.length !== 6) unsupported('matrix()');
        t = [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!];
        break;
      case 'translate':
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const r: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const cx = args[1]!;
          const cy = args[2]!;
          t = mul(mul([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
        } else {
          t = r;
        }
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        return unsupported(`transform ${match[1]}`);
    }
    m = mul(m, t);
  }
  if (value.slice(consumed).trim() !== '') unsupported('transform syntax');
  return m;
}

// ------------------------------------------------------------ path data

const KAPPA = 0.5522847498307936;

/** Endpoint-parameterised elliptical arc → cubic Béziers (SVG 1.1 §F.6). */
function arcToCubics(
  x1: number, y1: number,
  rx: number, ry: number,
  phiDeg: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number,
): PathSeg[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [['L', x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(num / den);
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2) - 1e-9));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: PathSeg[] = [];
  let theta = theta1;
  for (let i = 0; i < segments; i++) {
    const cos1 = Math.cos(theta);
    const sin1 = Math.sin(theta);
    const cos2 = Math.cos(theta + delta);
    const sin2 = Math.sin(theta + delta);
    // Derivative points on the unit circle, mapped through the ellipse.
    const p = (c: number, s: number): [number, number] => [
      cx + rx * cosPhi * c - ry * sinPhi * s,
      cy + rx * sinPhi * c + ry * cosPhi * s,
    ];
    const [ex1, ey1] = p(cos1, sin1);
    const [ex2, ey2] = p(cos2, sin2);
    const d1x = -rx * cosPhi * sin1 - ry * sinPhi * cos1;
    const d1y = -rx * sinPhi * sin1 + ry * cosPhi * cos1;
    const d2x = -rx * cosPhi * sin2 - ry * sinPhi * cos2;
    const d2y = -rx * sinPhi * sin2 + ry * cosPhi * cos2;
    const last = i === segments - 1;
    out.push(['C', ex1 + t * d1x, ey1 + t * d1y, ex2 - t * d2x, ey2 - t * d2y, last ? x2 : ex2, last ? y2 : ey2]);
    theta += delta;
  }
  return out;
}

/** Parse SVG path data into absolute M / L / C / Z segments. Relative
 *  commands, H / V, smooth curves, quadratics and arcs are all normalised. */
export function parsePathData(d: string): PathSeg[] {
  const out: PathSeg[] = [];
  let i = 0;
  const n = d.length;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // Last cubic / quadratic control point, for S / T reflection.
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;

  const skipSep = (): void => {
    while (i < n && /[\s,]/.test(d[i]!)) i++;
  };
  const number = (): number => {
    skipSep();
    const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) unsupported('path number');
    i += m![0].length;
    return Number(m![0]);
  };
  const flag = (): boolean => {
    skipSep();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') unsupported('arc flag');
    i++;
    return ch === '1';
  };

  while (i < n) {
    skipSep();
    if (i >= n) break;
    const ch = d[i]!;
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd) {
      unsupported('path start');
    } else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (upper) {
      case 'M': {
        const x = number() + ox;
        const y = number() + oy;
        out.push(['M', x, y]);
        cx = sx = x;
        cy = sy = y;
        lastC = lastQ = null;
        break;
      }
      case 'L': {
        const x = number() + ox;
        const y = number() + oy;
        out.push(['L', x, y]);
        cx = x;
        cy = y;
        lastC = lastQ = null;
        break;
      }
      case 'H': {
        const x = number() + ox;
        out.push(['L', x, cy]);
        cx = x;
        lastC = lastQ = null;
        break;
      }
      case 'V': {
        const y = number() + oy;
        out.push(['L', cx, y]);
        cy = y;
        lastC = lastQ = null;
        break;
      }
      case 'C': {
        const x1 = number() + ox, y1 = number() + oy;
        const x2 = number() + ox, y2 = number() + oy;
        const x = number() + ox, y = number() + oy;
        out.push(['C', x1, y1, x2, y2, x, y]);
        lastC = [x2, y2];
        lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'S': {
        const x2 = number() + ox, y2 = number() + oy;
        const x = number() + ox, y = number() + oy;
        const x1 = lastC ? 2 * cx - lastC[0] : cx;
        const y1 = lastC ? 2 * cy - lastC[1] : cy;
        out.push(['C', x1, y1, x2, y2, x, y]);
        lastC = [x2, y2];
        lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Q':
      case 'T': {
        let qx: number, qy: number;
        if (upper === 'Q') {
          qx = number() + ox;
          qy = number() + oy;
        } else {
          qx = lastQ ? 2 * cx - lastQ[0] : cx;
          qy = lastQ ? 2 * cy - lastQ[1] : cy;
        }
        const x = number() + ox, y = number() + oy;
        out.push(['C',
          cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy),
          x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y),
          x, y]);
        lastQ = [qx, qy];
        lastC = null;
        cx = x;
        cy = y;
        break;
      }
      case 'A': {
        const rx = number(), ry = number(), rot = number();
        const large = flag(), sweep = flag();
        const x = number() + ox, y = number() + oy;
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y));
        lastC = lastQ = null;
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        out.push(['Z']);
        cx = sx;
        cy = sy;
        lastC = lastQ = null;
        break;
      }
      default:
        unsupported(`path command ${cmd}`);
    }
    if (upper === 'Z') {
      // A closepath takes no arguments; the next token must be a command.
      skipSep();
      if (i < n && !/[a-zA-Z]/.test(d[i]!)) unsupported('path data after Z');
    }
  }
  return out;
}

// ------------------------------------------------------------ shapes

function ellipseSegs(cx: number, cy: number, rx: number, ry: number): PathSeg[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
}

function rectSegs(x: number, y: number, w: number, h: number, rx: number, ry: number): PathSeg[] {
  if (rx <= 0 || ry <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', x + rx, y],
    ['L', x + w - rx, y],
    ['C', x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry],
    ['L', x + w, y + h - ry],
    ['C', x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h],
    ['L', x + rx, y + h],
    ['C', x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
    ['L', x, y + ry],
    ['C', x, y + ry - ky, x + rx - kx, y, x + rx, y],
    ['Z'],
  ];
}

function pointsSegs(points: string, close: boolean): PathSeg[] {
  const nums = points.trim().split(/[\s,]+/).filter((s) => s !== '').map(Number);
  if (nums.length < 2 || nums.length % 2 !== 0 || nums.some((v) => !Number.isFinite(v))) {
    unsupported('points');
  }
  const segs: PathSeg[] = [['M', nums[0]!, nums[1]!]];
  for (let i = 2; i < nums.length; i += 2) segs.push(['L', nums[i]!, nums[i + 1]!]);
  if (close) segs.push(['Z']);
  return segs;
}

// ------------------------------------------------------------ styling

/** Parse a length in user units. Absolute CSS units are converted at 96 dpi
 *  (the SVG user unit is a CSS px); relative units are unsupported. */
function parseLength(value: string | undefined, fallback: number): number {
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
type Paint = VectorPaint | 'none' | 'currentColor';

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
interface Style {
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
}

const ROOT_STYLE: Style = {
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
};

/** Presentation properties honoured from attributes and `style`. */
const STYLE_PROPS = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'color',
  'visibility', 'display', 'clip-path', 'clip-rule',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  // Text properties that change glyph placement: accepted only at their defaults.
  'letter-spacing', 'word-spacing', 'writing-mode', 'text-decoration',
]);

/** Properties that may appear in `style` and are harmless to ignore
 *  (typography for text we never render, rendering hints, Inkscape extras). */
const IGNORED_STYLE_PROPS = new Set([
  'font-variant', 'font-stretch', 'font-size-adjust',
  'font-feature-settings', 'font-variant-ligatures', 'font-variant-caps', 'font-variant-numeric',
  'font-variant-east-asian', 'line-height', 'text-align',
  'text-rendering', 'direction', 'unicode-bidi', 'dominant-baseline',
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

function cascade(parent: Style, attrs: Record<string, string>): Style {
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

// ------------------------------------------------------------ conversion

/** Elements that never render and can be skipped with their subtrees. */
const SKIPPED = new Set(['title', 'desc', 'metadata', 'defs', 'clipPath', 'style']);
/** Structural elements traversed like a group. */
const GROUPS = new Set(['g', 'a']);
/** Basic shapes. */
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

interface Walker {
  byId: Map<string, XmlEl>;
  shapes: VectorItem[];
  depth: number;
  fonts: VectorFontResolver | undefined;
  probe: boolean;
}

/** Walk a child; in probe mode an unsupported subtree is skipped, not fatal. */
function walkChild(w: Walker, el: XmlEl, ctm: Matrix, style: Style, clips: VectorClip[]): void {
  if (!w.probe) {
    walk(w, el, ctm, style, clips);
    return;
  }
  try {
    walk(w, el, ctm, style, clips);
  } catch (err) {
    if (!(err instanceof Unsupported)) throw err;
  }
}

/** Attributes that reposition glyphs individually; none are supported. */
const TEXT_UNSUPPORTED_ATTRS = ['rotate', 'textLength', 'lengthAdjust'];

/** Single numeric value of an `x` / `y` / `dx` / `dy` list, or undefined. */
function singleCoord(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parts = value.trim().split(/[\s,]+/).filter((v) => v !== '');
  if (parts.length === 0) return undefined;
  if (parts.length > 1) unsupported('per-glyph positioning');
  return parseLength(parts[0], 0);
}

/** Collapse whitespace the way `xml:space="default"` does for SVG text. */
function collapseWhitespace(raw: string): string {
  return raw.replace(/[\n\r\t]/g, ' ').replace(/ {2,}/g, ' ');
}

interface TextChunk {
  runs: VectorTextRun[];
  anchor: 'start' | 'middle' | 'end';
  /** Local → root transform of the run that opened the chunk. */
  matrix: Matrix;
}

/** Lay out a `text` element: walks its runs and `tspan`s, positions each run
 *  on the current pen, then applies `text-anchor` per absolutely positioned
 *  chunk. Text in a font the resolver cannot provide bails out. */
function layoutText(w: Walker, el: XmlEl, m: Matrix, style: Style, clips: VectorClip[]): void {
  if (!w.fonts) unsupported('text (no font resolver)');
  const resolver = w.fonts!;
  const chunks: TextChunk[] = [];
  let pen = { x: 0, y: 0 };
  let chunk: TextChunk | null = null;
  let pendingSpace = false;
  let started = false;

  const visit = (node: XmlEl, nm: Matrix, ns: Style, isRoot: boolean): void => {
    for (const a of TEXT_UNSUPPORTED_ATTRS) if (node.attrs[a] !== undefined) unsupported(a);
    if (node.attrs['transform'] !== undefined && !isRoot) unsupported('tspan transform');
    const x = singleCoord(node.attrs['x']);
    const y = singleCoord(node.attrs['y']);
    const dx = singleCoord(node.attrs['dx']) ?? 0;
    const dy = singleCoord(node.attrs['dy']) ?? 0;
    if (x !== undefined) pen = { ...pen, x };
    if (y !== undefined) pen = { ...pen, y };
    pen = { x: pen.x + dx, y: pen.y + dy };
    if (isRoot || x !== undefined || y !== undefined) {
      chunk = { runs: [], anchor: ns.textAnchor, matrix: nm };
      chunks.push(chunk);
    }
    for (const c of node.content) {
      if (typeof c === 'string') {
        let text = collapseWhitespace(c);
        if (text === '') continue;
        if (!started) {
          text = text.replace(/^ +/, '');
          if (text === '') continue;
        }
        if (pendingSpace && !text.startsWith(' ')) text = ' ' + text;
        pendingSpace = text.endsWith(' ');
        text = text.replace(/ +$/, '');
        if (text === '') continue;
        started = true;
        const font = resolver(ns.fontFamilies, ns.fontWeight, ns.italic);
        if (!font) unsupported(`font ${ns.fontFamilies.join(', ') || '(default)'}`);
        const fillPaint = ns.fill === 'none' ? null : ns.fill === 'currentColor' ? ns.color : ns.fill;
        const alpha = fillPaint ? fillPaint.alpha * ns.fillOpacity * ns.opacity : 0;
        if (ns.stroke !== 'none') unsupported('stroked text');
        const width = font!.widthOf(text, ns.fontSize);
        if (fillPaint && alpha > 0 && ns.visible) {
          chunk!.runs.push({
            text, font: font!, size: ns.fontSize, x: pen.x, y: pen.y, matrix: nm,
            fill: { hex: fillPaint.hex, alpha },
          });
        }
        pen = { x: pen.x + width, y: pen.y };
        continue;
      }
      const { local, foreign } = localName(c.name);
      if (foreign) continue;
      if (local !== 'tspan') unsupported(`text child ${local}`);
      if (c.attrs['display']?.trim() === 'none') continue;
      const cs = cascade(ns, c.attrs);
      visit(c, nm, cs, false);
    }
  };
  visit(el, m, style, true);

  const runs: VectorTextRun[] = [];
  for (const ch of chunks) {
    if (ch.runs.length === 0) continue;
    let shift = 0;
    if (ch.anchor !== 'start') {
      const first = ch.runs[0]!;
      const last = ch.runs[ch.runs.length - 1]!;
      const width = last.x + last.font.widthOf(last.text, last.size) - first.x;
      shift = ch.anchor === 'middle' ? -width / 2 : -width;
    }
    for (const r of ch.runs) runs.push(shift === 0 ? r : { ...r, x: r.x + shift });
  }
  if (runs.length > 0) w.shapes.push({ kind: 'text', runs, clips });
}

function shapeSegs(el: XmlEl): PathSeg[] {
  const a = el.attrs;
  const len = (name: string, fallback = 0): number => parseLength(a[name], fallback);
  switch (el.name) {
    case 'path': {
      const d = a['d'];
      if (!d || d.trim() === '') return [];
      return parsePathData(d);
    }
    case 'rect': {
      const w = len('width');
      const h = len('height');
      if (w <= 0 || h <= 0) return [];
      let rx = a['rx'] !== undefined && a['rx'] !== 'auto' ? len('rx') : -1;
      let ry = a['ry'] !== undefined && a['ry'] !== 'auto' ? len('ry') : -1;
      if (rx < 0 && ry < 0) rx = ry = 0;
      else if (rx < 0) rx = ry;
      else if (ry < 0) ry = rx;
      return rectSegs(len('x'), len('y'), w, h, rx, ry);
    }
    case 'circle': {
      const r = len('r');
      return r > 0 ? ellipseSegs(len('cx'), len('cy'), r, r) : [];
    }
    case 'ellipse': {
      const rx = a['rx'] === 'auto' ? len('ry') : len('rx');
      const ry = a['ry'] === 'auto' ? len('rx') : len('ry');
      return rx > 0 && ry > 0 ? ellipseSegs(len('cx'), len('cy'), rx, ry) : [];
    }
    case 'line':
      return [['M', len('x1'), len('y1')], ['L', len('x2'), len('y2')]];
    case 'polyline':
      return a['points'] ? pointsSegs(a['points'], false) : [];
    case 'polygon':
      return a['points'] ? pointsSegs(a['points'], true) : [];
    default:
      return unsupported(el.name);
  }
}

function hrefOf(el: XmlEl): string | undefined {
  return el.attrs['href'] ?? el.attrs['xlink:href'];
}

function resolveClip(w: Walker, attrs: Record<string, string>, ctm: Matrix, style: Style): VectorClip | null {
  const raw = attrs['clip-path'];
  if (raw === undefined) return null;
  const v = raw.trim();
  if (v === 'none' || v === '') return null;
  const m = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(v);
  if (!m) return unsupported(`clip-path ${v}`);
  const target = w.byId.get(m[1]!);
  if (!target || target.name !== 'clipPath') return unsupported('clip-path target');
  const units = target.attrs['clipPathUnits'];
  if (units !== undefined && units !== 'userSpaceOnUse') unsupported('clipPathUnits');
  if (target.attrs['clip-path'] !== undefined) unsupported('nested clip-path');
  const clipCtm = mul(ctm, parseTransform(target.attrs['transform']));
  const clipStyle = cascade(style, target.attrs);
  const segs: PathSeg[] = [];
  let evenOdd = clipStyle.clipEvenOdd;
  const visit = (el: XmlEl, m2: Matrix, s: Style, depth: number): void => {
    if (depth > 16) unsupported('clip recursion');
    const { local, foreign } = localName(el.name);
    if (foreign || local === 'title' || local === 'desc' || local === 'metadata') return;
    const s2 = cascade(s, el.attrs);
    if (el.attrs['display']?.trim() === 'none') return;
    const m3 = mul(m2, parseTransform(el.attrs['transform']));
    if (SHAPES.has(local)) {
      evenOdd = s2.clipEvenOdd;
      segs.push(...transformSegs(shapeSegs({ ...el, name: local }), m3));
    } else if (local === 'use') {
      const href = hrefOf(el);
      const id = href?.startsWith('#') ? href.slice(1) : undefined;
      const ref = id ? w.byId.get(id) : undefined;
      if (!ref) unsupported('use target');
      const m4 = mul(m3, [1, 0, 0, 1, parseLength(el.attrs['x'], 0), parseLength(el.attrs['y'], 0)]);
      visit(ref!, m4, s2, depth + 1);
    } else {
      unsupported(`clipPath child ${local}`);
    }
  };
  for (const child of target.children) visit(child, clipCtm, clipStyle, 0);
  return { segs, evenOdd };
}

function walk(w: Walker, el: XmlEl, ctm: Matrix, parentStyle: Style, clips: VectorClip[]): void {
  if (w.depth > 64) unsupported('nesting depth');
  const { local, foreign } = localName(el.name);
  if (foreign) return; // inkscape:*, sodipodi:*, rdf:* …
  if (SKIPPED.has(local)) {
    if (local === 'style' && el.hasText) unsupported('style sheet');
    return;
  }
  const attrs = el.attrs;
  if (attrs['display']?.trim() === 'none') return;
  if (!w.probe) {
    // Painting-only concerns: a probe still wants the text underneath.
    if (attrs['mask'] !== undefined && attrs['mask'].trim() !== 'none') unsupported('mask');
    if (attrs['filter'] !== undefined && attrs['filter'].trim() !== 'none') unsupported('filter');
    if (attrs['marker-start'] || attrs['marker-mid'] || attrs['marker-end']) unsupported('marker');
  }
  const style = cascade(parentStyle, attrs);
  const m = mul(ctm, parseTransform(attrs['transform']));
  const clipHere = w.probe ? null : resolveClip(w, attrs, m, style);
  const nextClips = clipHere ? [...clips, clipHere] : clips;

  if (GROUPS.has(local) || (local === 'svg' && w.depth === 0)) {
    w.depth++;
    for (const child of el.children) walkChild(w, child, m, style, nextClips);
    w.depth--;
    return;
  }
  if (local === 'use') {
    const href = hrefOf(el);
    const id = href?.startsWith('#') ? href.slice(1) : undefined;
    const ref = id ? w.byId.get(id) : undefined;
    if (!ref) return unsupported('use target');
    const refLocal = localName(ref.name).local;
    if (refLocal === 'symbol' || refLocal === 'svg') unsupported('use of symbol');
    const m2 = mul(m, [1, 0, 0, 1, parseLength(attrs['x'], 0), parseLength(attrs['y'], 0)]);
    w.depth++;
    walk(w, ref, m2, style, nextClips);
    w.depth--;
    return;
  }
  if (SHAPES.has(local)) {
    if (!style.visible) return;
    const segs = shapeSegs({ ...el, name: local });
    if (segs.length === 0) return;
    const resolve = (p: Paint): VectorPaint | null => {
      if (p === 'none') return null;
      return p === 'currentColor' ? style.color : p;
    };
    const fillPaint = resolve(style.fill);
    const strokePaint = resolve(style.stroke);
    const fillAlpha = fillPaint ? fillPaint.alpha * style.fillOpacity * style.opacity : 0;
    const strokeAlpha = strokePaint ? strokePaint.alpha * style.strokeOpacity * style.opacity : 0;
    const scale = lengthScale(m);
    const strokeWidth = style.strokeWidth * scale;
    const fillOut = fillPaint && fillAlpha > 0 ? { hex: fillPaint.hex, alpha: fillAlpha } : null;
    const strokeOut = strokePaint && strokeAlpha > 0 && strokeWidth > 0
      ? {
        hex: strokePaint.hex,
        alpha: strokeAlpha,
        width: strokeWidth,
        cap: style.cap,
        join: style.join,
        miterLimit: style.miterLimit,
        dash: style.dash ? style.dash.map((d) => d * scale) : null,
        dashOffset: style.dashOffset * scale,
      }
      : null;
    if (!fillOut && !strokeOut) return;
    w.shapes.push({ kind: 'path', segs: transformSegs(segs, m), fill: fillOut, evenOdd: style.evenOdd, stroke: strokeOut, clips: nextClips });
    return;
  }
  if (local === 'text') {
    layoutText(w, el, m, style, nextClips);
    return;
  }
  if (local === 'image') {
    // A data-URI PNG / JPEG stretched into its box (`preserveAspectRatio`
    // is not honoured: the box is taken as the picture's extent).
    if (!style.visible) return;
    const href = hrefOf(el) ?? '';
    const dm = /^data:image\/(png|jpeg|jpg);base64,([\s\S]*)$/i.exec(href.trim());
    if (!dm) return unsupported('image source');
    const width = parseLength(attrs['width'], 0);
    const height = parseLength(attrs['height'], 0);
    if (width <= 0 || height <= 0) return;
    if (w.probe) return;
    let data: Uint8Array;
    try {
      const bin = atob(dm[2]!.replace(/\s+/g, ''));
      data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    } catch {
      return unsupported('image data');
    }
    w.shapes.push({
      kind: 'image',
      data,
      format: dm[1]!.toLowerCase() === 'png' ? 'png' : 'jpeg',
      x: parseLength(attrs['x'], 0),
      y: parseLength(attrs['y'], 0),
      width,
      height,
      matrix: m,
      clips: nextClips,
    });
    return;
  }
  // tspan outside text, svg (nested), symbol, switch, foreignObject,
  // linearGradient outside defs, pattern, mask, filter, marker, …
  unsupported(local);
}

function indexIds(el: XmlEl, byId: Map<string, XmlEl>): void {
  const id = el.attrs['id'];
  if (id && !byId.has(id)) byId.set(id, el);
  for (const c of el.children) indexIds(c, byId);
}

function parseAspect(value: string | undefined): VectorDrawing['aspect'] {
  const v = (value ?? 'xMidYMid meet').trim().split(/\s+/);
  if (v[0] === 'none') return null;
  const m = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(v[0] ?? '');
  if (!m) return unsupported('preserveAspectRatio');
  const pos = (s: string): 0 | 0.5 | 1 => (s === 'Min' ? 0 : s === 'Mid' ? 0.5 : 1);
  return { xAlign: pos(m[1]!), yAlign: pos(m[2]!), slice: v[1] === 'slice' };
}

/**
 * Convert SVG markup to a {@link VectorDrawing}, or `null` when the document
 * uses anything outside the supported subset (see the module comment). Never
 * throws.
 */
export function svgToVectorDrawing(svgText: string, options: SvgToVectorOptions = {}): VectorDrawing | null {
  try {
    const doc = parseXml(svgText);
    if (!doc) return null;
    const root = doc.children.find((c) => localName(c.name).local === 'svg' && !localName(c.name).foreign);
    if (!root || doc.children.some((c) => localName(c.name).local !== 'svg')) return null;
    const byId = new Map<string, XmlEl>();
    indexIds(root, byId);

    let viewBox: [number, number, number, number];
    const vb = root.attrs['viewBox'];
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p)) || parts[2]! <= 0 || parts[3]! <= 0) return null;
      viewBox = [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    } else {
      const w = root.attrs['width'];
      const h = root.attrs['height'];
      if (w?.trim().endsWith('%') || h?.trim().endsWith('%')) return null;
      const width = parseLength(w, 300);
      const height = parseLength(h, 150);
      if (width <= 0 || height <= 0) return null;
      viewBox = [0, 0, width, height];
    }
    const aspect = parseAspect(root.attrs['preserveAspectRatio']);

    const walker: Walker = { byId, shapes: [], depth: 0, fonts: options.fonts, probe: options.probe === true };
    // The root's own transform / clip / style apply like a group's.
    walk(walker, root, IDENTITY, ROOT_STYLE, []);
    return { viewBox, aspect, shapes: walker.shapes };
  } catch (err) {
    if (typeof process !== 'undefined' && process.env?.POSTEXT_SVG_DEBUG) console.warn('svgToVectorDrawing:', (err as Error).message);
    if (err instanceof Unsupported) return null;
    return null;
  }
}

// ------------------------------------------------------------ emission

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function pathOps(segs: PathSeg[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
        ops.push(moveTo(round(s[1]), round(s[2])));
        break;
      case 'L':
        ops.push(lineTo(round(s[1]), round(s[2])));
        break;
      case 'C':
        ops.push(appendBezierCurve(round(s[1]), round(s[2]), round(s[3]), round(s[4]), round(s[5]), round(s[6])));
        break;
      case 'Z':
        ops.push(closePath());
        break;
    }
  }
  return ops;
}

/** ExtGState per distinct (fill alpha, stroke alpha) pair, per page. */
const alphaStates = new WeakMap<PageCtx['page'], Map<string, ReturnType<PageCtx['page']['node']['newExtGState']>>>();

/** Font resource name per (page, font). */
const fontNames = new WeakMap<PageCtx['page'], Map<PDFFont, PDFName>>();

function fontName(ctx: PageCtx, font: PDFFont): PDFName {
  let names = fontNames.get(ctx.page);
  if (!names) {
    names = new Map();
    fontNames.set(ctx.page, names);
  }
  let name = names.get(font);
  if (!name) {
    name = ctx.page.node.newFontDictionary(font.name, font.ref);
    names.set(font, name);
  }
  return name;
}

function alphaState(ctx: PageCtx, ca: number, CA: number): PDFOperator | null {
  if (ca >= 1 && CA >= 1) return null;
  let states = alphaStates.get(ctx.page);
  if (!states) {
    states = new Map();
    alphaStates.set(ctx.page, states);
  }
  const key = `${round(ca)}|${round(CA)}`;
  let name = states.get(key);
  if (!name) {
    const dict = ctx.page.doc.context.obj({ Type: 'ExtGState', ca: round(ca), CA: round(CA) });
    name = ctx.page.node.newExtGState('GSa', dict);
    states.set(key, name);
  }
  return setGraphicsState(name);
}

/**
 * Paint a {@link VectorDrawing} into the page, fitted to the given box in the
 * document's pixel space (top-down, like every other `PageCtx` primitive).
 */
export function drawVectorDrawing(
  ctx: PageCtx,
  drawing: VectorDrawing,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x0 = xPx * scale;
  const yTop = pageHeightPt - yPx * scale;
  const w = wPx * scale;
  const h = hPx * scale;
  if (w <= 0 || h <= 0) return;
  const [vx, vy, vw, vh] = drawing.viewBox;

  let sx = w / vw;
  let sy = h / vh;
  let ox = 0;
  let oy = 0;
  if (drawing.aspect) {
    const s = drawing.aspect.slice ? Math.max(sx, sy) : Math.min(sx, sy);
    ox = (w - vw * s) * drawing.aspect.xAlign;
    oy = (h - vh * s) * drawing.aspect.yAlign;
    sx = sy = s;
  }
  const ops: PDFOperator[] = [pushGraphicsState()];
  // Clip to the viewport (overflow: hidden on the root svg).
  ops.push(rectangle(round(x0), round(yTop - h), round(w), round(h)), clip(), endPath());
  // SVG user space → PDF points: scale, flip y, place the viewBox origin.
  ops.push(concatTransformationMatrix(
    round(sx), 0, 0, round(-sy),
    round(x0 + ox - vx * sx),
    round(yTop - oy + vy * sy),
  ));

  for (const shape of drawing.shapes) {
    ops.push(pushGraphicsState());
    for (const c of shape.clips) {
      ops.push(...pathOps(c.segs), c.evenOdd ? clipEvenOdd() : clip(), endPath());
    }
    if (shape.kind === 'image') {
      if (shape.pdfImage) {
        // The unit square maps onto the picture's box; the image's rows run
        // bottom-up in PDF, so the box is flipped inside the y-down root
        // space to keep the picture upright.
        const [a, b, c, d, e, f] = mul(shape.matrix, [shape.width, 0, 0, -shape.height, shape.x, shape.y + shape.height]);
        const name = ctx.page.node.newXObject('Image', shape.pdfImage.ref);
        ops.push(concatTransformationMatrix(round(a), round(b), round(c), round(d), round(e), round(f)), drawObject(name));
      }
      ops.push(popGraphicsState());
      continue;
    }
    if (shape.kind === 'text') {
      for (const run of shape.runs) {
        const font = run.font.pdfFont;
        if (!font) continue;
        const gs = alphaState(ctx, run.fill.alpha, 1);
        ops.push(pushGraphicsState());
        if (gs) ops.push(gs);
        // Text matrix: local → root, then undo the root y-flip so glyphs
        // stand upright, with the pen at the run's baseline start.
        const [a, b, c, d, e, f] = mul(run.matrix, [1, 0, 0, -1, run.x, run.y]);
        ops.push(
          setFillingColor(colorFromHex(run.fill.hex, ctx.colorSpace)),
          beginText(),
          setFontAndSize(fontName(ctx, font), round(run.size)),
          setTextMatrix(round(a), round(b), round(c), round(d), round(e), round(f)),
          showTextShaped(font, run.text),
          endText(),
          popGraphicsState(),
        );
      }
      ops.push(popGraphicsState());
      continue;
    }
    const gs = alphaState(ctx, shape.fill?.alpha ?? 1, shape.stroke?.alpha ?? 1);
    if (gs) ops.push(gs);
    if (shape.fill) ops.push(setFillingColor(colorFromHex(shape.fill.hex, ctx.colorSpace)));
    if (shape.stroke) {
      const st = shape.stroke;
      ops.push(
        setStrokingColor(colorFromHex(st.hex, ctx.colorSpace)),
        setLineWidth(round(st.width)),
        setLineCap(st.cap),
        setLineJoin(st.join),
        PDFOperator.of(PDFOperatorNames.SetLineMiterLimit, [ctx.page.doc.context.obj(round(st.miterLimit))]),
      );
      if (st.dash) ops.push(setDashPattern(st.dash.map(round), round(st.dashOffset)));
    }
    ops.push(...pathOps(shape.segs));
    if (shape.fill && shape.stroke) {
      ops.push(shape.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke) : fillAndStroke());
    } else if (shape.fill) {
      ops.push(shape.evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill());
    } else {
      ops.push(stroke());
    }
    ops.push(popGraphicsState());
  }
  ops.push(popGraphicsState());
  // In slices: a drawing of many thousands of paths would overflow the
  // call stack as one spread argument list.
  for (let i = 0; i < ops.length; i += 4000) ctx.page.pushOperators(...ops.slice(i, i + 4000));
}
