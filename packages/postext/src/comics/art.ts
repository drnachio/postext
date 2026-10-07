/**
 * The picture of a comic panel (#556): which part of it shows in the cell.
 *
 * `cover` fills the cell: the visible window has the cell's aspect ratio
 * and is as large as the picture allows; it is placed so the picture's
 * safe area stays whole — centred on `focus` when one is given, else with
 * the margins round the safe area cropped in proportion to their sizes
 * (the rule of `safeAreaSource`), else centred. A cell whose shape cannot
 * hold the safe area under a cover crop shows the smallest window that
 * holds it, and the picture is letterboxed (the bands show the panel
 * background). `contain` always shows the whole picture.
 *
 * The result is the window in picture fractions (`source`) and the box the
 * whole picture covers on the page (`box`): renderers clip to the cell and
 * draw the picture at `box`, as they draw a cropped figure
 * (`uncroppedPictureBox`). A mirrored picture is flipped inside `box`.
 */

import type { ResourceAnchor, ResourceSafeArea } from '../types';
import type { BoundingBox, VDTComicArt, VDTPoint } from '../vdt';
import { normalizeSafeArea } from '../pipeline/safeArea';

export interface ComicCropInput {
  /** The picture's intrinsic size (any unit; only the ratio counts). */
  width: number;
  height: number;
  /** The cell (page px). */
  cell: BoundingBox;
  fit: 'cover' | 'contain';
  safeArea?: ResourceSafeArea;
  /** The point of the picture (fractions) to centre when the safe area
   *  leaves room. */
  focus?: { x: number; y: number };
  /** The picture is drawn flipped: the safe area and focus are read
   *  flipped. */
  mirrored?: boolean;
}

export interface ComicCrop {
  /** The visible part of the picture, in fractions of the picture as stored
   *  (unflipped), clamped to it. */
  source: BoundingBox;
  /** The box the whole picture covers (page px). */
  box: BoundingBox;
  /** The picture leaves bands of the cell uncovered. */
  letterbox: boolean;
  /** The cover crop could not keep the safe area whole (a `cover` panel
   *  fell back to a letterbox). */
  fallback: boolean;
}

/** The cell aspect ratios (width / height) a picture can fill under a
 *  cover crop with its safe area whole: from the safe area's width over the
 *  whole height (`min`, a tall cell) to the whole width over the safe
 *  area's height (`max`, a wide one). Without a safe area any ratio. */
export function comicCropFeasibleRange(width: number, height: number, safeArea?: ResourceSafeArea): { min: number; max: number } {
  const area = normalizeSafeArea(safeArea);
  if (!area || width <= 0 || height <= 0) return { min: 0, max: Infinity };
  return { min: (area.width * width) / height, max: width / (area.height * height) };
}

/** Start of a window `size` long on an axis of length 1 that keeps
 *  `[a, a + s]`, the margins cropped in proportion to their sizes. */
function proportional(a: number, s: number, size: number): number {
  const margins = 1 - s;
  if (margins <= 1e-9) return (1 - size) / 2;
  return Math.max(0, Math.min(1 - size, (a * (1 - size)) / margins));
}

/** Start of a window `size` long on one axis, centred on `c` but kept over
 *  the safe span `[a, a + s]` (when there is one and it fits) and inside
 *  `[0, 1]`. */
function centred(c: number, size: number, a: number | undefined, s: number | undefined): number {
  let start = c - size / 2;
  if (a !== undefined && s !== undefined && s <= size) {
    start = Math.min(start, a);
    start = Math.max(start, a + s - size);
  }
  return Math.max(0, Math.min(1 - size, start));
}

function flipArea(area: ResourceSafeArea | undefined): ResourceSafeArea | undefined {
  return area ? { ...area, x: 1 - area.x - area.width } : undefined;
}

/** Which part of a picture shows in a cell, and where the whole picture
 *  goes. */
export function comicArtCrop(input: ComicCropInput): ComicCrop {
  const { width: iw, height: ih, cell } = input;
  const cw = Math.max(1e-6, cell.width);
  const ch = Math.max(1e-6, cell.height);
  const C = cw / ch;
  const A = iw > 0 && ih > 0 ? iw / ih : C;
  // Work in the drawn (possibly flipped) picture.
  const area = input.mirrored ? flipArea(normalizeSafeArea(input.safeArea)) : normalizeSafeArea(input.safeArea);
  const focus = input.focus ? { x: input.mirrored ? 1 - input.focus.x : input.focus.x, y: input.focus.y } : undefined;
  // The window, in fractions of the drawn picture (may pass its edges).
  let ww: number;
  let wh: number;
  let fallback = false;
  if (input.fit === 'contain') {
    // The smallest window of the cell's ratio holding the whole picture.
    if (C >= A) { wh = 1; ww = C / A; } else { ww = 1; wh = A / C; }
  } else {
    if (C >= A) { ww = 1; wh = A / C; } else { wh = 1; ww = C / A; }
    if (area && (area.width > ww + 1e-9 || area.height > wh + 1e-9)) {
      // The safe area does not fit a cover window: the smallest window of
      // the cell's ratio that holds it.
      fallback = true;
      const sw = area.width;
      const sh = area.height;
      // In picture fractions, a window of ratio C: ww·A / wh = C.
      if (sw * A / sh >= C) { ww = sw; wh = (sw * A) / C; } else { wh = sh; ww = (sh * C) / A; }
    }
  }
  const place = (size: number, a: number | undefined, s: number | undefined, f: number | undefined): number => {
    if (size >= 1 - 1e-9) return (1 - size) / 2; // the picture centred in a letterbox
    if (f !== undefined) return centred(f, size, a, s);
    if (a !== undefined && s !== undefined) return proportional(a, s, size);
    return (1 - size) / 2;
  };
  const wx = place(ww, area?.x, area?.width, focus?.x);
  const wy = place(wh, area?.y, area?.height, focus?.y);
  const box: BoundingBox = {
    x: cell.x - (wx / ww) * cw,
    y: cell.y - (wy / wh) * ch,
    width: cw / ww,
    height: ch / wh,
  };
  // The visible part, clamped to the picture, back in stored fractions.
  const sx0 = Math.max(0, wx);
  const sy0 = Math.max(0, wy);
  const sx1 = Math.min(1, wx + ww);
  const sy1 = Math.min(1, wy + wh);
  let source: BoundingBox = { x: sx0, y: sy0, width: sx1 - sx0, height: sy1 - sy0 };
  if (input.mirrored) source = { ...source, x: 1 - source.x - source.width };
  const letterbox = ww > 1 + 1e-6 || wh > 1 + 1e-6;
  return { source, box, letterbox, fallback };
}

/** Where a point of a panel's picture (`u`, `v`: fractions of the picture
 *  as stored) lands on the page; a mirrored picture flips `u`. Whether it
 *  shows is whether it lies inside the panel's polygon (`pointInPolygon`). */
export function comicArtPointToPage(art: Pick<VDTComicArt, 'box' | 'mirrored'>, u: number, v: number): VDTPoint {
  const x = art.mirrored ? 1 - u : u;
  return { x: art.box.x + x * art.box.width, y: art.box.y + v * art.box.height };
}

/** A rectangle of a panel's picture (fractions) on the page. */
export function comicArtRectToPage(art: Pick<VDTComicArt, 'box' | 'mirrored'>, r: ResourceSafeArea): BoundingBox {
  const a = comicArtPointToPage(art, r.x, r.y);
  const b = comicArtPointToPage(art, r.x + r.width, r.y + r.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** The anchors of a picture that lie outside its safe area: a crop keeps
 *  the safe area and may cut them off. A picture without a safe area
 *  reports none (any crop may cut any point; the hint is about pictures
 *  whose safe area was drawn). */
export function anchorsOutsideSafeArea(anchors: readonly ResourceAnchor[] | undefined, safeArea: ResourceSafeArea | undefined): ResourceAnchor[] {
  const area = normalizeSafeArea(safeArea);
  if (!anchors || !area) return [];
  return anchors.filter((a) => a.x < area.x - 1e-9 || a.x > area.x + area.width + 1e-9 || a.y < area.y - 1e-9 || a.y > area.y + area.height + 1e-9);
}
