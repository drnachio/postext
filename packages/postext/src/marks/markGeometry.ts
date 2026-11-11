/**
 * The shapes every renderer draws alike for the highlight marks
 * (`markStyles`, #888, #1488): a band whose edges wobble like a
 * highlighter drawn by hand (`VDTLineHighlight.rough`), and the dashes of
 * a dashed line (`VDTLineMark` of kind `dashed`). The canvas, the PDF, the
 * HTML and the display list all trace these outlines, so the outputs
 * match.
 */

import type { VDTLineHighlight, VDTLineMark } from '../vdt.js';

/** One command of an outline: move, line or quadratic curve to a point
 *  (the curve through a control point). Coordinates are absolute. */
export type OutlineCommand =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number }
  | { op: 'Z' };

/** A small seeded generator (mulberry32): the same wobble on every render. */
function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A rectangle whose left and right ends are rounded by their own radii
 *  (each clamped to half the height and half the width). */
function roundedRect(x: number, y: number, w: number, h: number, rl: number, rr: number): OutlineCommand[] {
  const l = Math.max(0, Math.min(rl, w / 2, h / 2));
  const r = Math.max(0, Math.min(rr, w / 2, h / 2));
  const out: OutlineCommand[] = [{ op: 'M', x: x + l, y }, { op: 'L', x: x + w - r, y }];
  if (r > 0) out.push({ op: 'Q', cx: x + w, cy: y, x: x + w, y: y + r }, { op: 'L', x: x + w, y: y + h - r }, { op: 'Q', cx: x + w, cy: y + h, x: x + w - r, y: y + h });
  else out.push({ op: 'L', x: x + w, y: y + h });
  out.push({ op: 'L', x: x + l, y: y + h });
  if (l > 0) out.push({ op: 'Q', cx: x, cy: y + h, x, y: y + h - l }, { op: 'L', x, y: y + l }, { op: 'Q', cx: x, cy: y, x: x + l, y });
  else out.push({ op: 'L', x, y });
  out.push({ op: 'Z' });
  return out;
}

/** What {@link bandOutline} reads of a band. */
export type BandShape = Pick<VDTLineHighlight, 'x' | 'y' | 'width' | 'height' | 'radiusLeft' | 'radiusRight' | 'rough' | 'seed'>;

/**
 * The outline of a highlight band painted from the line's start `x0` and
 * baseline `y0`. A clean band is a rectangle with its ends rounded; a
 * rough one (`band.rough` > 0) wobbles along its top and bottom edges,
 * drifts a little across the line and has its ends cut on a slant, as a
 * highlighter's chisel tip leaves them. The wobble follows `band.seed`.
 */
export function bandOutline(band: BandShape, x0 = 0, y0 = 0): OutlineCommand[] {
  const x = x0 + band.x;
  const y = y0 + band.y;
  const w = band.width;
  const h = band.height;
  const rough = Math.max(0, Math.min(1, band.rough ?? 0));
  if (!(w > 0) || !(h > 0)) return [];
  if (rough === 0) return roundedRect(x, y, w, h, band.radiusLeft, band.radiusRight);
  const rand = seeded(band.seed ?? 1);
  const wobble = h * 0.1 * rough;
  const drift = (rand() - 0.5) * h * 0.16 * rough;
  const slant = h * 0.3 * rough;
  const step = Math.max(h * 0.6, 2);
  const n = Math.max(2, Math.ceil(w / step));
  const top: { x: number; y: number }[] = [];
  const bottom: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const along = drift * (t - 0.5);
    top.push({ x: x + w * t, y: y + along + (rand() - 0.5) * 2 * wobble });
    bottom.push({ x: x + w * t, y: y + h + along + (rand() - 0.5) * 2 * wobble });
  }
  // The chisel ends: the band starts a little later at the top than at
  // the bottom, and ends a little later at the bottom.
  top[0]!.x += slant;
  bottom[n]!.x -= slant * 0.5;
  top[n]!.x += slant * 0.25;
  const out: OutlineCommand[] = [{ op: 'M', x: top[0]!.x, y: top[0]!.y }];
  // Smooth edges: a curve through each sample to the midpoint of the next.
  const along = (pts: { x: number; y: number }[]): void => {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      const next = pts[i + 1];
      if (next) out.push({ op: 'Q', cx: p.x, cy: p.y, x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 });
      else out.push({ op: 'L', x: p.x, y: p.y });
    }
  };
  along(top);
  const back = bottom.slice().reverse();
  out.push({ op: 'L', x: back[0]!.x, y: back[0]!.y });
  along(back);
  out.push({ op: 'Z' });
  return out;
}

/** The dashes of a `dashed` line mark from the line's start `x0`: each
 *  one's start and length along the line. The row starts and ends on a
 *  dash, its gaps evened out. */
export function dashedPieces(mark: Pick<VDTLineMark, 'x' | 'length' | 'size' | 'gap'>, x0 = 0): { x: number; length: number }[] {
  const length = mark.length ?? 0;
  const dash = Math.max(0.1, mark.size ?? 3);
  const gap = Math.max(0, mark.gap ?? 2);
  if (length <= dash) return [{ x: x0 + mark.x, length }];
  const count = Math.max(1, Math.round((length - dash) / (dash + gap)));
  const pitch = (length - dash) / count;
  const out: { x: number; length: number }[] = [];
  for (let i = 0; i <= count; i++) out.push({ x: x0 + mark.x + i * pitch, length: dash });
  return out;
}

/** An outline as an SVG path `d` attribute. */
export function outlineToSvgPath(commands: readonly OutlineCommand[], digits = 2): string {
  const f = (v: number): string => v.toFixed(digits);
  return commands.map((c) => (c.op === 'Z' ? 'Z' : c.op === 'Q' ? `Q${f(c.cx)} ${f(c.cy)} ${f(c.x)} ${f(c.y)}` : `${c.op}${f(c.x)} ${f(c.y)}`)).join('');
}
