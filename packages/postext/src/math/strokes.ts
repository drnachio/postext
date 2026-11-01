// Stroked shapes of MathJax's SVG as filled outlines (#1362).
//
// Canvas, PDF and the other painters fill `MathRender.paths`; they stroke
// nothing. MathJax draws some rules as strokes: the `<line>`s of an array's
// `\hline`, `\hdashline` and column bars, the `<rect>` of its frame and of
// `\boxed`, the `<line>` of `\cancel`, the `<ellipse>` of
// `\enclose{circle}`. Each is turned here into the area its stroke covers,
// in the shape's own user space (the caller bakes the transform in, so a
// scaled group scales the stroke as SVG does).

/** The rules MathJax's stylesheet gives its table lines and frames
 *  (`SVGmtable.styles`): without that stylesheet a `<line data-line>`
 *  inherits the root's `stroke-width="0"` and a `<rect data-frame>` the
 *  root's fill. The markup is rewritten with them as attributes, so the
 *  HTML and EPUB that embed it draw the rules too, and the flattener reads
 *  them like any other stroke. */
const TABLE_RULE_RE = /<(line|rect)\b([^>]*\bdata-(?:line|frame)="[^"]*"[^>]*?)(\/?)>/g;
/** MathJax's default rule: 0.07 em, in its units of 1/1000 em. */
const RULE_WIDTH = 70;

export function normalizeTableRules(svg: string): string {
  return svg.replace(TABLE_RULE_RE, (_all, name: string, attrText: string, selfClose: string) => {
    if (/\sstroke-width="/.test(attrText)) return _all;
    // A thickness other than the default comes as `stroke-thickness` (em),
    // its dash pattern in em too: in units they are a thousand times that.
    const thick = /\sstroke-thickness="([^"]*)"/.exec(attrText);
    const width = thick ? Number(thick[1]) * 1000 : RULE_WIDTH;
    if (!(width > 0)) return _all;
    let text = attrText.replace(/\sstroke-thickness="[^"]*"/, '');
    const dash = /\sstroke-dasharray="([^"]*)"/.exec(text);
    const cls = /\sclass="([^"]*)"/.exec(text)?.[1] ?? '';
    let extra = ` stroke-width="${width}"`;
    if (dash) {
      const scaled = dash[1]!.split(/[\s,]+/).filter(Boolean).map((v) => Number(v) * 1000).join(',');
      text = text.replace(dash[0], ` stroke-dasharray="${scaled}"`);
    } else if (/\bmjx-dashed\b/.test(cls)) {
      extra += ` stroke-dasharray="${2 * width}"`;
    } else if (/\bmjx-dotted\b/.test(cls)) {
      extra += ` stroke-dasharray="0,${2 * width}"`;
    }
    if (/\bmjx-dotted\b/.test(cls)) extra += ' stroke-linecap="round"';
    if (name === 'rect' && !/\sfill="/.test(text)) extra += ' fill="none"';
    return `<${name}${text}${extra}${selfClose}>`;
  });
}

const num = (v: string | undefined, fallback = 0): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/** A stroke's dash pattern (SVG doubles an odd list); null for solid. */
function dashPattern(attr: string | undefined): number[] | null {
  if (!attr || attr === 'none') return null;
  const list = attr.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!list.length || list.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const full = list.length % 2 ? [...list, ...list] : list;
  // No dash drawn, or no gap between dashes: a solid line.
  const gaps = full.filter((_, i) => i % 2 === 1);
  return full.some((v) => v > 0) && gaps.some((v) => v > 0) ? full : null;
}

const f = (v: number): string => String(+v.toFixed(3));

/** A quad of `width` around the segment, its ends extended by `ext`. */
function quad(x1: number, y1: number, x2: number, y2: number, width: number, ext: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = len > 0 ? (x2 - x1) / len : 1;
  const uy = len > 0 ? (y2 - y1) / len : 0;
  const nx = (-uy * width) / 2;
  const ny = (ux * width) / 2;
  const ax = x1 - ux * ext, ay = y1 - uy * ext;
  const bx = x2 + ux * ext, by = y2 + uy * ext;
  return `M${f(ax + nx)} ${f(ay + ny)}L${f(bx + nx)} ${f(by + ny)}L${f(bx - nx)} ${f(by - ny)}L${f(ax - nx)} ${f(ay - ny)}Z`;
}

/** Kappa of a quarter ellipse drawn as one cubic. */
const K = 0.5522847498;

/** An ellipse as four cubics, clockwise in y-down space, or the other way
 *  round when `reverse` (the hole of a ring under the nonzero rule). */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, reverse = false): string {
  const kx = rx * K, ky = ry * K;
  if (!reverse) {
    return `M${f(cx + rx)} ${f(cy)}`
      + `C${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}`
      + `C${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)}`
      + `C${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}`
      + `C${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)}Z`;
  }
  return `M${f(cx + rx)} ${f(cy)}`
    + `C${f(cx + rx)} ${f(cy - ky)} ${f(cx + kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}`
    + `C${f(cx - kx)} ${f(cy - ry)} ${f(cx - rx)} ${f(cy - ky)} ${f(cx - rx)} ${f(cy)}`
    + `C${f(cx - rx)} ${f(cy + ky)} ${f(cx - kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}`
    + `C${f(cx + kx)} ${f(cy + ry)} ${f(cx + rx)} ${f(cy + ky)} ${f(cx + rx)} ${f(cy)}Z`;
}

/** The area a stroked segment covers: one quad when solid, a quad per dash
 *  (a dot for a zero-length dash with round caps) when dashed. */
export function strokeSegment(
  x1: number, y1: number, x2: number, y2: number,
  width: number,
  dashArray?: string,
  linecap?: string,
): string {
  if (!(width > 0)) return '';
  const len = Math.hypot(x2 - x1, y2 - y1);
  const capExt = linecap === 'square' || linecap === 'round' ? width / 2 : 0;
  const dash = dashPattern(dashArray);
  if (!dash) return len > 0 || capExt > 0 ? quad(x1, y1, x2, y2, width, capExt) : '';
  const ux = len > 0 ? (x2 - x1) / len : 1;
  const uy = len > 0 ? (y2 - y1) / len : 0;
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; at <= len; i = (i + 1) % dash.length) {
    const seg = dash[i]!;
    if (i % 2 === 0) {
      const end = Math.min(len, at + seg);
      const sx = x1 + ux * at, sy = y1 + uy * at;
      if (seg === 0) {
        if (linecap === 'round') parts.push(ellipsePath(sx, sy, width / 2, width / 2));
        else if (linecap === 'square') parts.push(quad(sx, sy, sx, sy, width, width / 2));
      } else {
        parts.push(quad(sx, sy, x1 + ux * end, y1 + uy * end, width, capExt));
      }
    }
    at += seg;
  }
  return parts.join('');
}

/** The outline a stroked rectangle draws: its four sides, the stroke
 *  centred on the edge. */
export function strokeRect(
  x: number, y: number, w: number, h: number,
  width: number,
  dashArray?: string,
  linecap?: string,
): string {
  if (!(width > 0) || w < 0 || h < 0) return '';
  if (!dashPattern(dashArray)) {
    // Outer edge one way, inner edge the other: a frame under nonzero.
    const o = width / 2;
    const outer = `M${f(x - o)} ${f(y - o)}L${f(x + w + o)} ${f(y - o)}L${f(x + w + o)} ${f(y + h + o)}L${f(x - o)} ${f(y + h + o)}Z`;
    if (w <= width || h <= width) return outer;
    return outer + `M${f(x + o)} ${f(y + o)}L${f(x + o)} ${f(y + h - o)}L${f(x + w - o)} ${f(y + h - o)}L${f(x + w - o)} ${f(y + o)}Z`;
  }
  return [
    strokeSegment(x, y, x + w, y, width, dashArray, linecap),
    strokeSegment(x + w, y, x + w, y + h, width, dashArray, linecap),
    strokeSegment(x + w, y + h, x, y + h, width, dashArray, linecap),
    strokeSegment(x, y + h, x, y, width, dashArray, linecap),
  ].join('');
}

/** The ring a stroked ellipse draws. */
export function strokeEllipse(cx: number, cy: number, rx: number, ry: number, width: number): string {
  if (!(width > 0) || rx < 0 || ry < 0) return '';
  const o = width / 2;
  const outer = ellipsePath(cx, cy, rx + o, ry + o);
  if (rx <= o || ry <= o) return outer;
  return outer + ellipsePath(cx, cy, rx - o, ry - o, true);
}

/** The filled outlines of one stroked or filled shape element (`line`,
 *  `rect`, `ellipse`, `circle`), in its own user space: the fill first,
 *  then the stroke over it, as SVG paints them. */
export function shapeOutlines(
  name: string,
  attrs: Record<string, string>,
  fill: string,
  stroke: string,
  strokeWidth: number,
): { d: string; fill: string }[] {
  const out: { d: string; fill: string }[] = [];
  const dashArray = attrs['stroke-dasharray'];
  const linecap = attrs['stroke-linecap'];
  const stroked = stroke !== 'none' && strokeWidth > 0;
  if (name === 'line') {
    if (!stroked) return out;
    const d = strokeSegment(num(attrs['x1']), num(attrs['y1']), num(attrs['x2']), num(attrs['y2']), strokeWidth, dashArray, linecap);
    if (d) out.push({ d, fill: stroke });
  } else if (name === 'rect') {
    const x = num(attrs['x']), y = num(attrs['y']);
    const w = num(attrs['width']), h = num(attrs['height']);
    if (fill !== 'none' && w > 0 && h > 0) {
      out.push({ d: `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`, fill });
    }
    if (stroked) {
      const d = strokeRect(x, y, w, h, strokeWidth, dashArray, linecap);
      if (d) out.push({ d, fill: stroke });
    }
  } else if (name === 'ellipse' || name === 'circle') {
    const cx = num(attrs['cx']), cy = num(attrs['cy']);
    const rx = name === 'circle' ? num(attrs['r']) : num(attrs['rx']);
    const ry = name === 'circle' ? rx : num(attrs['ry']);
    if (fill !== 'none' && rx > 0 && ry > 0) out.push({ d: ellipsePath(cx, cy, rx, ry), fill });
    if (stroked) {
      const d = strokeEllipse(cx, cy, rx, ry, strokeWidth);
      if (d) out.push({ d, fill: stroke });
    }
  }
  return out;
}
