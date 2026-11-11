// Where a page item stands.
//
// An item's path is written in a frame of its own. `ItemTransform` takes
// it to the frame of what holds the item: a group, or the spread. The
// spread's frame has its origin on the spine; a page's `ItemTransform`
// takes the page's own frame to it, and `GeometricBounds` is the page's
// box in that own frame (whose origin is not always the page's corner).
// "Page coordinates" here are always measured from the page's top left
// corner, y down, in points: what an importer lays out in.

import type { IdmlDocument, IdmlPage, IdmlPageItem, IdmlSpread } from '../model/document.js';
import { apply, boxHeight, boxOf, boxWidth, decompose, IDENTITY, invert, multiply, overlap, pathExtent, unionBox, type Box, type Matrix, type Path, type Point } from '../model/geometry.js';

/** An item of a spread with what holds it. */
export interface Located {
  item: IdmlPageItem;
  spread: IdmlSpread;
  /** Groups (or states) the item stands in, outermost first. */
  parents: IdmlPageItem[];
}

const indexes = new WeakMap<IdmlDocument, Map<string, Located>>();

/** Every item of every spread and master spread by `Self`, groups'
 *  children and the states of interactive objects included. Items
 *  anchored in text are not here: they have no place of their own. */
export function itemIndex(doc: IdmlDocument): Map<string, Located> {
  const hit = indexes.get(doc);
  if (hit) return hit;
  const out = new Map<string, Located>();
  for (const spread of [...doc.spreads, ...doc.masterSpreads]) {
    const stack: Located[] = [];
    for (let i = spread.items.length - 1; i >= 0; i--) stack.push({ item: spread.items[i]!, spread, parents: [] });
    while (stack.length) {
      const at = stack.pop()!;
      if (at.item.self && !out.has(at.item.self)) out.set(at.item.self, at);
      const inside = [...at.item.children, ...(at.item.states ?? []).flatMap((s) => s.items)];
      const parents = [...at.parents, at.item];
      for (let i = inside.length - 1; i >= 0; i--) stack.push({ item: inside[i]!, spread, parents });
    }
  }
  indexes.set(doc, out);
  return out;
}

/** Item frame → spread frame. */
export function spreadMatrix(at: Located): Matrix {
  let m: Matrix = IDENTITY;
  for (const p of at.parents) m = multiply(m, p.transform);
  return multiply(m, at.item.transform);
}

const corners = (b: Box): Point[] => [{ x: b.left, y: b.top }, { x: b.right, y: b.top }, { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom }];

/** The box of a box seen through a transform. */
export function transformBox(b: Box, m: Matrix): Box {
  return boxOf(corners(b).map((p) => apply(m, p)))!;
}

export function transformPaths(paths: readonly Path[], m: Matrix): Path[] {
  return paths.map((path) => ({ open: path.open, points: path.points.map((p) => ({ anchor: apply(m, p.anchor), left: apply(m, p.left), right: apply(m, p.right) })) }));
}

/** A page's box in its spread's frame. */
export const pageBoxInSpread = (page: IdmlPage): Box => transformBox(page.bounds, page.transform);

/** Spread frame → page coordinates (from the page's top left corner). */
export function pageMatrix(page: IdmlPage): Matrix {
  return multiply([1, 0, 0, 1, -page.bounds.left, -page.bounds.top], invert(page.transform));
}

export const pageSize = (page: IdmlPage): { width: number; height: number } => ({ width: page.bounds.right - page.bounds.left, height: page.bounds.bottom - page.bounds.top });

/** The box of an item in the frame `m` leads to: its path, or for a
 *  group the boxes of what it holds. */
export function itemExtent(item: IdmlPageItem, m: Matrix): Box | undefined {
  if (item.paths.length) return pathExtent(item.paths, m);
  let box: Box | undefined;
  // Groups in groups: the reader stops nesting at 64 levels.
  const stack: { item: IdmlPageItem; m: Matrix }[] = item.children.map((c) => ({ item: c, m: multiply(m, c.transform) }));
  while (stack.length) {
    const at = stack.pop()!;
    if (at.item.paths.length) box = unionBox(box, pathExtent(at.item.paths, at.m));
    else for (const c of at.item.children) stack.push({ item: c, m: multiply(at.m, c.transform) });
  }
  return box;
}

/** The page of a spread a box (in the spread's frame) stands on: the one
 *  it shares most area with. A box that touches none is on the
 *  pasteboard. */
export function pageUnder(spread: IdmlSpread, box: Box | undefined): IdmlPage | undefined {
  if (!box) return undefined;
  let best: IdmlPage | undefined;
  let most = 0;
  // A rule or an empty frame has no area to share: give it a hair.
  const b = boxWidth(box) > 0 && boxHeight(box) > 0 ? box : { left: box.left - 0.01, top: box.top - 0.01, right: box.right + 0.01, bottom: box.bottom + 0.01 };
  for (const page of spread.pages) {
    const shared = overlap(b, pageBoxInSpread(page));
    if (shared > most) {
      most = shared;
      best = page;
    }
  }
  return best;
}

export interface ItemGeometry {
  spread: IdmlSpread;
  /** The page it stands on; undefined on the pasteboard. */
  page?: IdmlPage;
  /** That page's index in the document: -1 on the pasteboard and on a
   *  master spread. */
  pageIndex: number;
  pasteboard: boolean;
  /** Item frame → spread frame. */
  toSpread: Matrix;
  /** Item frame → page coordinates of `page`; of the spread's first page
   *  when the item is on the pasteboard (so its box is still told
   *  relative to something), the spread's frame when it has no page. */
  toPage: Matrix;
  /** The outline in those coordinates. */
  outline: Path[];
  /** Its bounding box in those coordinates. */
  box: Box;
  /** The same box in the spread's frame. */
  spreadBox: Box;
  /** Degrees clockwise on the page. */
  rotation: number;
  scaleX: number;
  scaleY: number;
  flipped: boolean;
  shear: number;
}

/** Where an item of a spread stands; undefined for an item that is not
 *  on a spread (anchored in text) or has no extent at all. */
export function itemGeometry(doc: IdmlDocument, item: IdmlPageItem | string): ItemGeometry | undefined {
  const self = typeof item === 'string' ? item : item.self;
  const at = itemIndex(doc).get(self);
  if (!at || (typeof item !== 'string' && at.item !== item)) return undefined;
  return locatedGeometry(at);
}

export function locatedGeometry(at: Located): ItemGeometry | undefined {
  const toSpread = spreadMatrix(at);
  const spreadBox = itemExtent(at.item, toSpread);
  if (!spreadBox || ![spreadBox.left, spreadBox.top, spreadBox.right, spreadBox.bottom].every(Number.isFinite)) return undefined;
  const page = pageUnder(at.spread, spreadBox);
  const reference = page ?? at.spread.pages[0];
  const fromSpread = reference ? pageMatrix(reference) : IDENTITY;
  const toPage = multiply(fromSpread, toSpread);
  const d = decompose(toSpread);
  return {
    spread: at.spread,
    ...(page ? { page } : {}),
    pageIndex: page ? page.index : -1,
    pasteboard: !page,
    toSpread,
    toPage,
    outline: transformPaths(at.item.paths, toPage),
    box: transformBox(spreadBox, fromSpread),
    spreadBox,
    rotation: d.rotation,
    scaleX: d.scaleX,
    scaleY: d.scaleY,
    flipped: d.flipped,
    shear: d.shear,
  };
}

/** The box a text frame sets its text in: its path's box less the frame's
 *  insets, in the frame's own frame and (through `geometry.toPage`) in
 *  page coordinates. A frame that is not a plain rectangle has one inset
 *  all round; its box is still the path's box, inset. */
export function textContentBox(item: IdmlPageItem, geometry?: ItemGeometry): { inner: Box; box: Box } | undefined {
  const own = pathExtent(item.paths);
  if (!own) return undefined;
  const [top, left, bottom, right] = item.textFrame?.inset ?? [0, 0, 0, 0];
  const inner: Box = { left: own.left + left, top: own.top + top, right: Math.max(own.left + left, own.right - right), bottom: Math.max(own.top + top, own.bottom - bottom) };
  return { inner, box: geometry ? transformBox(inner, geometry.toPage) : inner };
}

/** The widths of a text frame's columns and where each starts, from the
 *  left of its content box. */
export function textColumns(item: IdmlPageItem): { left: number; width: number }[] {
  const content = textContentBox(item);
  const frame = item.textFrame;
  if (!content || !frame) return [];
  const total = boxWidth(content.inner);
  const n = Math.max(1, frame.columns);
  const width = Math.max(0, (total - frame.gutter * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => ({ left: i * (width + frame.gutter), width }));
}

export interface GraphicCrop {
  /** The part of the picture the frame shows, in the picture's unit
   *  square (0 0 is its top left, 1 1 its bottom right). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Picture's scale inside the frame (1 = its own size). */
  scaleX: number;
  scaleY: number;
  /** Its turn inside the frame, degrees clockwise. */
  rotation: number;
  flipped: boolean;
  /** The whole picture's box and the frame's, both in the frame's frame. */
  picture: Box;
  frame: Box;
}

/** What a graphic frame shows of its picture. A frame is a window on the
 *  picture: the picture has a box of its own (`GraphicBounds`) placed in
 *  the frame by its transform, and only what falls inside the frame's
 *  path is seen. Undefined when the item holds no picture or either box
 *  is empty. */
export function graphicCrop(item: IdmlPageItem): GraphicCrop | undefined {
  const g = item.graphic;
  const frame = pathExtent(item.paths);
  if (!g || !frame) return undefined;
  const b = g.bounds;
  const w = boxWidth(b);
  const h = boxHeight(b);
  if (!(w > 0) || !(h > 0)) return undefined;
  // The frame seen from the picture's own frame.
  const seen = transformBox(frame, invert(g.transform));
  const left = Math.max(seen.left, b.left);
  const top = Math.max(seen.top, b.top);
  const right = Math.min(seen.right, b.right);
  const bottom = Math.min(seen.bottom, b.bottom);
  const d = decompose(g.transform);
  const shown = right > left && bottom > top;
  return {
    x: shown ? (left - b.left) / w : 0,
    y: shown ? (top - b.top) / h : 0,
    width: shown ? (right - left) / w : 0,
    height: shown ? (bottom - top) / h : 0,
    scaleX: d.scaleX,
    scaleY: d.scaleY,
    rotation: d.rotation,
    flipped: d.flipped,
    picture: transformBox(b, g.transform),
    frame,
  };
}
