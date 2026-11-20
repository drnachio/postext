/**
 * A cover's shapes and the basic effects of its boxes and shapes.
 *
 * A shape is a path of nodes, each with the handles of the curves that
 * meet at it (none: a corner), in fractions of the element's box, so it
 * stretches with the box. The basic shapes (a rectangle, an ellipse, a
 * polygon, a star, a line) are such paths, every node of which can then be
 * moved, curved or straightened.
 *
 * The effects: rounded corners (a box's), a border, a gradient from the
 * element's colour to another, and a soft shadow. The outputs draw flat
 * paths only, so a gradient and a shadow become a picture of their own:
 * an SVG in which the gradient is a small raster cut to the shape and the
 * shadow a raster of the shape blurred, as every output already draws.
 */

import type { ColorValue } from '../types/page.js';
import type { SheetRect } from './geometry.js';
import { encodeRgbaPng } from './png.js';

export interface CoverPoint {
  x: number;
  y: number;
}

/** A node of a path: where it is, and the handles of the curve that comes
 *  into it and of the one that leaves it (absent: a straight side). */
export interface CoverPathNode extends CoverPoint {
  in?: CoverPoint;
  out?: CoverPoint;
}

/** Paths of nodes in fractions of the box; a closed one joins its last
 *  node to its first. */
export type CoverPath = { nodes: CoverPathNode[]; closed: boolean }[];

export type BasicShape = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'line';
export const BASIC_SHAPES: readonly BasicShape[] = ['rectangle', 'ellipse', 'polygon', 'star', 'line'];

/** How far a circle's handles stand from its nodes, in radii. */
const KAPPA = 0.5523;

/** A basic shape filling its box: a polygon of `sides` sides (default 6),
 *  a star of `sides` points (default 5). */
export function basicShape(kind: BasicShape, sides?: number): CoverPath {
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  if (kind === 'rectangle') return [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }];
  if (kind === 'line') return [{ closed: false, nodes: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] }];
  if (kind === 'ellipse') {
    const k = KAPPA / 2;
    return [{
      closed: true,
      nodes: [
        { x: 0.5, y: 0, in: { x: 0.5 - k, y: 0 }, out: { x: 0.5 + k, y: 0 } },
        { x: 1, y: 0.5, in: { x: 1, y: 0.5 - k }, out: { x: 1, y: 0.5 + k } },
        { x: 0.5, y: 1, in: { x: 0.5 + k, y: 1 }, out: { x: 0.5 - k, y: 1 } },
        { x: 0, y: 0.5, in: { x: 0, y: 0.5 + k }, out: { x: 0, y: 0.5 - k } },
      ],
    }];
  }
  const n = Math.max(3, Math.min(24, Math.round(sides ?? (kind === 'star' ? 5 : 6))));
  const count = kind === 'star' ? 2 * n : n;
  const nodes: CoverPathNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = kind === 'star' && i % 2 === 1 ? 0.2 : 0.5;
    nodes.push({ x: r4(0.5 + r * Math.cos(a)), y: r4(0.5 + r * Math.sin(a)) });
  }
  return [{ closed: true, nodes }];
}

/** A rectangle `w` × `h` (mm) with corners rounded to `radius` mm, as a
 *  path in fractions of it. */
export function roundedRectPath(w: number, h: number, radius: number): CoverPath {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r <= 0 || w <= 0 || h <= 0) return basicShape('rectangle');
  const rx = r / w;
  const ry = r / h;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [{
    closed: true,
    nodes: [
      { x: rx, y: 0, in: { x: rx - kx, y: 0 } },
      { x: 1 - rx, y: 0, out: { x: 1 - rx + kx, y: 0 } },
      { x: 1, y: ry, in: { x: 1, y: ry - ky } },
      { x: 1, y: 1 - ry, out: { x: 1, y: 1 - ry + ky } },
      { x: 1 - rx, y: 1, in: { x: 1 - rx + kx, y: 1 } },
      { x: rx, y: 1, out: { x: rx - kx, y: 1 } },
      { x: 0, y: 1 - ry, in: { x: 0, y: 1 - ry + ky } },
      { x: 0, y: ry, out: { x: 0, y: ry - ky } },
    ],
  }];
}

const n4 = (v: number) => String(Math.round(v * 10000) / 10000);

/** A path as SVG path data, its points through `map` (by default as they
 *  are, in fractions). */
export function pathData(path: CoverPath, map: (p: CoverPoint) => CoverPoint = (p) => p): string {
  const out: string[] = [];
  for (const sub of path) {
    const nodes = sub.nodes;
    if (nodes.length < 2) continue;
    const at = (p: CoverPoint) => { const q = map(p); return `${n4(q.x)} ${n4(q.y)}`; };
    const seg = (a: CoverPathNode, b: CoverPathNode) =>
      a.out || b.in ? `C ${at(a.out ?? a)} ${at(b.in ?? b)} ${at(b)}` : `L ${at(b)}`;
    let d = `M ${at(nodes[0]!)}`;
    for (let i = 1; i < nodes.length; i++) d += ` ${seg(nodes[i - 1]!, nodes[i]!)}`;
    if (sub.closed) {
      // A straight closing side is the Z itself.
      const last = nodes[nodes.length - 1]!;
      d += last.out || nodes[0]!.in ? ` ${seg(last, nodes[0]!)} Z` : ' Z';
    }
    out.push(d);
  }
  return out.join(' ');
}

/** A path's curves as straight steps (`steps` per curve): polygons in the
 *  same units, for an outline a finish follows or a shadow is cast by. */
export function flattenCoverPath(path: CoverPath, steps = 12): CoverPoint[][] {
  const out: CoverPoint[][] = [];
  for (const sub of path) {
    const nodes = sub.nodes;
    if (nodes.length < 2) continue;
    const pts: CoverPoint[] = [{ x: nodes[0]!.x, y: nodes[0]!.y }];
    const seg = (a: CoverPathNode, b: CoverPathNode) => {
      if (!a.out && !b.in) { pts.push({ x: b.x, y: b.y }); return; }
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push({
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        });
      }
    };
    for (let i = 1; i < nodes.length; i++) seg(nodes[i - 1]!, nodes[i]!);
    if (sub.closed) {
      seg(nodes[nodes.length - 1]!, nodes[0]!);
      pts.pop();
    }
    if (pts.length >= 2) out.push(pts);
  }
  return out;
}

/** The box a path's nodes and handles span, in its own units. */
export function coverPathBounds(path: CoverPath): { x: number; y: number; width: number; height: number } | undefined {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of flattenCoverPath(path, 16).flat()) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}

/** The basic effects of a box or a shape. */
export interface CoverEffects {
  /** A box's corners, rounded to this radius, mm. */
  radius?: number;
  /** A border round it: its colour and width, mm. */
  stroke?: { color: ColorValue; width: number };
  /** A gradient from the element's colour to `to`, at `angle` degrees
   *  (0: left to right; 90: top to bottom). */
  gradient?: { to: ColorValue; angle: number };
  /** A soft shadow under it: its colour and opacity (0 … 1), how far it
   *  falls (mm, right and down) and how soft it is (mm). */
  shadow?: { color: ColorValue; opacity: number; x: number; y: number; blur: number };
}

const rgb = (c: ColorValue): [number, number, number, number] => {
  const h = c.hex;
  const a = h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
};

const dataUri = (png: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < png.length; i += 0x8000) s += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
};

/** The pixels a gradient is drawn at, a side. */
const GRADIENT_PX = 96;

/** A gradient as a square PNG: `from` to `to` along `angle`, over a box
 *  of proportions `aspect` (width over height), at `opacity`. */
function gradientPng(from: ColorValue, to: ColorValue, angle: number, aspect: number, opacity: number): Uint8Array {
  const n = GRADIENT_PX;
  const a = rgb(from);
  const b = rgb(to);
  const rad = (angle * Math.PI) / 180;
  // The direction on the box as drawn, its ends at the box's farthest corners.
  const dx = Math.cos(rad) * aspect;
  const dy = Math.sin(rad);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2 || 1;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = ((x + 0.5) / n - 0.5) * aspect;
      const py = (y + 0.5) / n - 0.5;
      const t = Math.max(0, Math.min(1, ((px * Math.cos(rad) + py * Math.sin(rad)) / half + 1) / 2));
      const i = 4 * (y * n + x);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(a[c]! + (b[c]! - a[c]!) * t);
      data[i + 3] = Math.round(255 * opacity * (a[3]! + (b[3]! - a[3]!) * t));
    }
  }
  return encodeRgbaPng(n, n, data);
}

/** The pixels a shadow is drawn at, per mm (and the most a side). */
const SHADOW_PX_PER_MM = 2;
const SHADOW_MAX_PX = 240;

/** A shape's shadow as a PNG over `box` (mm): its polygons (mm) filled,
 *  blurred by `blur` mm, in `color` at `opacity`. */
function shadowPng(polys: CoverPoint[][], box: SheetRect, color: ColorValue, opacity: number, blur: number): Uint8Array {
  const k = Math.min(SHADOW_PX_PER_MM, SHADOW_MAX_PX / Math.max(box.width, box.height));
  const w = Math.max(1, Math.round(box.width * k));
  const h = Math.max(1, Math.round(box.height * k));
  const mask = new Float32Array(w * h);
  // Even-odd scanline fill, each pixel by its centre.
  for (let y = 0; y < h; y++) {
    const sy = box.y + (y + 0.5) / k;
    const xs: number[] = [];
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        if ((p.y <= sy && q.y > sy) || (q.y <= sy && p.y > sy)) xs.push(p.x + ((sy - p.y) / (q.y - p.y)) * (q.x - p.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil((xs[i]! - box.x) * k - 0.5));
      const to = Math.min(w - 1, Math.floor((xs[i + 1]! - box.x) * k - 0.5));
      for (let x = from; x <= to; x++) mask[y * w + x] = 1;
    }
  }
  // Three box blurs come close to a Gaussian.
  const r = Math.max(0, Math.round((blur * k) / 2));
  const tmp = new Float32Array(w * h);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horizontal ? l * w + i : i * w + l);
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += src[at(Math.max(0, Math.min(len - 1, i)))]!;
      for (let i = 0; i < len; i++) {
        dst[at(i)] = sum / (2 * r + 1);
        sum += src[at(Math.min(len - 1, i + r + 1))]! - src[at(Math.max(0, i - r))]!;
      }
    }
  };
  if (r > 0) for (let i = 0; i < 3; i++) { pass(mask, tmp, true); pass(tmp, mask, false); }
  const [cr, cg, cb, ca] = rgb(color);
  const data = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    data[4 * p] = cr; data[4 * p + 1] = cg; data[4 * p + 2] = cb;
    data[4 * p + 3] = Math.round(255 * Math.min(1, mask[p]!) * opacity * ca);
  }
  return encodeRgbaPng(w, h, data);
}

/** Whether an element's effects need a picture of their own (a gradient,
 *  a shadow), which flat paths cannot draw. */
export const needsArt = (fx: CoverEffects): boolean => !!fx.gradient || (!!fx.shadow && fx.shadow.opacity > 0);

/**
 * A box or a shape with its effects as one SVG, in sheet mm: its shadow,
 * its fill (flat, or a gradient cut to the shape) and its border. `rect` is
 * its box; `path` its shape (a box's: a rectangle, rounded or not).
 * Returns the content (for a sheet-sized SVG, as the mirror's) and the
 * box it covers, shadow and border included.
 */
export function shapeArt(rect: SheetRect, path: CoverPath, fill: ColorValue | undefined, fx: CoverEffects, opacity = 1, idPrefix = 'art'): { content: string; defs: string; bounds: SheetRect } {
  const map = (p: CoverPoint) => ({ x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height });
  const d = pathData(path, map);
  const closed = path.some((s) => s.closed);
  const mm = (v: number) => n4(v);
  let bounds = { ...rect };
  const grow = (r: SheetRect) => {
    const x0 = Math.min(bounds.x, r.x); const y0 = Math.min(bounds.y, r.y);
    const x1 = Math.max(bounds.x + bounds.width, r.x + r.width); const y1 = Math.max(bounds.y + bounds.height, r.y + r.height);
    bounds = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  const defs: string[] = [];
  const parts: string[] = [];
  const sh = fx.shadow;
  if (sh && sh.opacity > 0 && closed) {
    const polys = flattenCoverPath(path, 12).map((poly) => poly.map(map).map((p) => ({ x: p.x + sh.x, y: p.y + sh.y })));
    const reach = sh.blur * 1.5 + 0.5;
    const box = { x: rect.x + sh.x - reach, y: rect.y + sh.y - reach, width: rect.width + 2 * reach, height: rect.height + 2 * reach };
    const png = shadowPng(polys, box, sh.color, sh.opacity, sh.blur);
    parts.push(`<image href="${dataUri(png)}" x="${mm(box.x)}" y="${mm(box.y)}" width="${mm(box.width)}" height="${mm(box.height)}"/>`);
    grow(box);
  }
  if (fill && closed) {
    if (fx.gradient) {
      const id = `${idPrefix}-clip`;
      defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath>`);
      const png = gradientPng(fill, fx.gradient.to, fx.gradient.angle, rect.width / (rect.height || 1), opacity);
      parts.push(`<g clip-path="url(#${id})"><image href="${dataUri(png)}" x="${mm(rect.x)}" y="${mm(rect.y)}" width="${mm(rect.width)}" height="${mm(rect.height)}"/></g>`);
    } else {
      const [r, g, b, a] = rgb(fill);
      const alpha = a * opacity;
      parts.push(`<path d="${d}" fill="#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}"${alpha < 1 ? ` fill-opacity="${mm(alpha)}"` : ''}/>`);
    }
  }
  if (fx.stroke && fx.stroke.width > 0) {
    const [r, g, b, a] = rgb(fx.stroke.color);
    parts.push(`<path d="${d}" fill="none" stroke="#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}" stroke-width="${mm(fx.stroke.width)}"${a * opacity < 1 ? ` stroke-opacity="${mm(a * opacity)}"` : ''} stroke-linejoin="round"/>`);
    const half = fx.stroke.width / 2;
    grow({ x: rect.x - half, y: rect.y - half, width: rect.width + 2 * half, height: rect.height + 2 * half });
  }
  return { content: parts.join(''), defs: defs.join(''), bounds };
}

/** {@link shapeArt} as a standalone SVG the size of its bounds. */
export function shapeArtSvg(art: { content: string; defs: string; bounds: SheetRect }): string {
  const b = art.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n4(b.width)}mm" height="${n4(b.height)}mm" viewBox="${n4(b.x)} ${n4(b.y)} ${n4(b.width)} ${n4(b.height)}">`
    + (art.defs ? `<defs>${art.defs}</defs>` : '') + art.content + '</svg>';
}
