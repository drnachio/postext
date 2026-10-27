// The ink of a composed page's elements and frames, in page mm, and the
// geometry the overlap check measures it with.
import type { VDTDesignBlock, VDTBlock } from '../../vdt.js';
import { contourOnPage } from '../../contour/index.js';
import type { Rect } from '../geometry.js';

export const MM_PER_IN = 25.4;
/** Overlaps thinner than this (mm) are a touch, not a cover: a line box
 *  holds its leading, two frames set edge to edge meet without hiding
 *  anything. */
export const MIN_DEPTH_MM = 0.3;
/** The least area covered that is reported (mm²). */
export const MIN_AREA_MM2 = 1;
/** The least overrun that is reported (mm). */
export const MIN_EXCESS_MM = 0.3;

/** A piece of a frame's ink on the sheet. */
export interface Ink {
  box: Rect;
  kind: 'text' | 'picture' | 'fill';
  /** A line of the frame's body, which text pushed by another frame runs
   *  round (`'line'`), or text that keeps its place: a caption or note, a
   *  tab, a title (`'fixed'`). */
  flow?: 'line' | 'fixed';
  /** The words of a line, the resource of a picture. */
  text?: string;
  resourceId?: string;
  /** A covering picture with a known shape (#1123): the rows of its
   *  shape (its polygon or traced alpha channel), each a box on the sheet;
   *  what it hides is what lies under them, not under its whole box. */
  shape?: Rect[];
}

type Affine = [number, number, number, number, number, number];

/** The box holding `r` once put on the sheet by `m`. */
export function mapRect(r: Rect, m: Affine | undefined): Rect {
  if (!m) return { x: r.x, y: r.y, width: r.width, height: r.height };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]] as const) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const btm = Math.min(a.y + a.height, b.y + b.height);
  return r > x && btm > y ? { x, y, width: r - x, height: btm - y } : undefined;
}

/** Area of the union of `rects` (few: a sweep over their edges). */
export function unionArea(rects: readonly Rect[]): number {
  if (rects.length === 0) return 0;
  if (rects.length === 1) return rects[0]!.width * rects[0]!.height;
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    const spans = rects
      .filter((r) => r.x <= x0 && r.x + r.width >= x1)
      .map((r) => [r.y, r.y + r.height] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let lo = -Infinity;
    let hi = -Infinity;
    for (const [a, b] of spans) {
      if (a > hi) {
        covered += hi - lo > 0 ? hi - lo : 0;
        lo = a;
        hi = b;
      } else if (b > hi) hi = b;
    }
    covered += hi - lo > 0 ? hi - lo : 0;
    area += covered * (x1 - x0);
  }
  return area;
}

/** A colour that hides what is under it: not transparent, and at least
 *  half opaque when it carries an alpha (`#rrggbbaa`). */
function opaque(color: string | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === '' || c === 'transparent' || c === 'none') return false;
  if (/^#[0-9a-f]{8}$/.test(c)) return parseInt(c.slice(7, 9), 16) >= 0x80;
  if (/^#[0-9a-f]{4}$/.test(c)) return parseInt(c.slice(4, 5), 16) >= 8;
  return true;
}

/** The size in px a design text's font string names (`bold 12px "X"`). */
function fontPx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 12;
}

/** The ink of a design slot's blocks (a box's overlay: its fill, tab,
 *  stripe, icon, title). */
function designInk(blocks: readonly VDTDesignBlock[], out: Ink[]): void {
  for (const b of blocks) {
    if (b.kind === 'box') {
      if (opaque(b.box.backgroundColor)) out.push({ box: { ...b.bbox }, kind: 'fill' });
      else if (b.box.borderColor && b.box.borderWidthPx > 0) out.push({ box: { ...b.bbox }, kind: 'fill' });
    } else if (b.kind === 'path' && b.boxPart && b.fill) {
      // A card joined to its tab (#1059), as a box.
      out.push({ box: { ...b.bbox }, kind: 'fill' });
    } else if (b.kind === 'image') {
      out.push({ box: { ...b.bbox }, kind: 'picture' });
    } else if (b.kind === 'rule') {
      out.push({ box: { ...b.bbox }, kind: 'fill' });
    } else if (b.kind === 'text') {
      if (b.vertical) {
        const words = b.lines.map((l) => l.text).join(' ').trim();
        if (words) out.push({ box: { ...b.bbox }, kind: 'text', flow: 'fixed', text: words });
        continue;
      }
      const size = fontPx(b.fontString);
      for (const l of b.lines) {
        if (l.text.trim() === '' || l.width <= 0) continue;
        out.push({ box: { x: b.bbox.x + l.xOffset, y: l.baselineY - 0.8 * size, width: l.width, height: size }, kind: 'text', flow: 'fixed', text: l.text });
      }
    }
  }
}

/** A box's border alone does not hide what is under its middle: the fill
 *  pieces that only stroke an outline cover along it. */
function isOutlineOnly(b: VDTDesignBlock): boolean {
  return (b.kind === 'box' && !opaque(b.box.backgroundColor) && !!b.box.borderColor && b.box.borderWidthPx > 0)
    || (b.kind === 'path' && b.boxPart === 'border');
}

/** How pictures cover (#1123): by the rows of their shape, set as the page
 *  lays them (`mirrored`), or by their boxes (`false`). */
export type PictureShapes = { mirrored: boolean } | false;

/** The ink of one frame, in its blocks' own (laid-out) coordinates: what
 *  it paints. `covering` leaves out outlines (they hide only a hairline)
 *  and keeps what hides what is under it; a covering picture with a known
 *  shape carries its rows (`shapes`). */
export function frameInk(blocks: readonly VDTBlock[], covering: boolean, shapes: PictureShapes = false): Ink[] {
  const out: Ink[] = [];
  for (const b of blocks) {
    if (b.hidden) continue;
    if (b.designOverlay) {
      const overlay = covering ? b.designOverlay.blocks.filter((d) => !isOutlineOnly(d)) : b.designOverlay.blocks;
      designInk(overlay, out);
      // A heading design paints its overlay instead of its lines.
      if (b.type !== 'callout') continue;
    }
    const rb = b.resourceBlock;
    if (rb) {
      const body = rb.rotation ? { ...b.bbox } : { x: b.bbox.x + rb.bodyRect.x, y: b.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height };
      if (rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video') {
        const shape = covering && shapes && rb.kind !== 'video' && !rb.rotation ? pictureShape(b, shapes.mirrored) : undefined;
        out.push({ box: body, kind: 'picture', resourceId: rb.resource.id, ...(shape ? { shape } : {}) });
      }
      else if (!covering) out.push({ box: body, kind: 'text', flow: 'fixed', text: rb.resource.id });
      if (!rb.rotation) {
        for (const l of [...rb.captionLines, ...rb.noteLines]) {
          if (l.text.trim() !== '') out.push({ box: { ...l.bbox }, kind: 'text', flow: 'fixed', text: l.text });
        }
      }
      continue;
    }
    for (const l of b.lines) {
      if (l.text.trim() === '' || l.bbox.width <= 0 || l.bbox.height <= 0) continue;
      out.push({ box: { ...l.bbox }, kind: 'text', flow: 'line', text: l.text });
    }
  }
  return out;
}

/** The rows of a picture's shape where its block lays it (a cut-out's
 *  polygon or traced alpha channel, through its crop and scale), in the
 *  block's coordinates; `undefined` when the shape is not known (the box
 *  covers), none when the shape reaches no row. */
function pictureShape(b: VDTBlock, mirrored: boolean): Rect[] | undefined {
  const rb = b.resourceBlock!;
  const c = contourOnPage(rb.resource, rb, undefined, { margin: 0, mirrored, originX: b.bbox.x, originY: b.bbox.y });
  if (!c) return undefined;
  return c.spans.filter((sp) => sp.height > 0 && sp.right > sp.left).map((sp) => ({ x: sp.left, y: sp.y, width: sp.right - sp.left, height: sp.height }));
}

export const ELEMENT_EDGES: ReadonlySet<string> = new Set(['right-of', 'left-of', 'below', 'above', 'align-top', 'align-bottom', 'align-left', 'align-right', 'align-start', 'align-end']);

/** Rounded to 0.1. */
export const r1 = (v: number): number => Math.round(v * 10) / 10;
