import type { Resource, ResourceSafeArea } from '../types';

/**
 * Safe area of a picture (`Resource.safeArea`, #442): the rectangle that
 * holds what matters. A picture with one may be shown at any aspect ratio
 * between the whole picture and that rectangle: taller than its own by
 * cropping the sides, shorter by cropping top and bottom, never into the
 * safe area. The outer margins are cropped in proportion to their sizes, so
 * a subject standing left of centre stays left of centre.
 */

/** Smallest safe-area side kept (a fraction of the picture): a zero-sized
 *  rectangle would allow any aspect ratio. */
const MIN_SIDE = 0.02;

/** The resource's safe area, clamped to the picture, or `undefined` when it
 *  has none, it is not a picture, or the area covers the whole picture
 *  (which leaves no freedom). */
export function resourceSafeArea(resource: Resource): ResourceSafeArea | undefined {
  // A video's poster is a picture too (#454).
  const picture = resource.kind === 'bitmap' || resource.kind === 'svg' || (resource.kind === 'video' && !!resource.video?.poster);
  if (!picture) return undefined;
  return normalizeSafeArea(resource.safeArea);
}

/** Clamp a safe area to the unit square; `undefined` for a malformed one or
 *  one that covers the whole picture. */
export function normalizeSafeArea(area: ResourceSafeArea | undefined): ResourceSafeArea | undefined {
  if (!area) return undefined;
  const { x, y, width, height } = area;
  if (![x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const x0 = clamp01(x);
  const y0 = clamp01(y);
  const x1 = clamp01(x + width);
  const y1 = clamp01(y + height);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < MIN_SIDE || h < MIN_SIDE) return undefined;
  if (w >= 1 - 1e-6 && h >= 1 - 1e-6) return undefined;
  return { x: x0, y: y0, width: w, height: h };
}

/** Body height range of a picture `bodyWidth` wide whose intrinsic size is
 *  `iw` × `ih`: from its safe area's height (cropping top and bottom) to
 *  its safe area's width (cropping the sides). */
export function safeAreaHeightRange(
  iw: number,
  ih: number,
  area: ResourceSafeArea,
  bodyWidth: number,
): { min: number; max: number } {
  const natural = bodyWidth * (ih / iw);
  // Shortest: the whole width shown, the height cut down to the safe area's.
  const min = natural * area.height;
  // Tallest: the whole height shown, the width cut down to the safe area's.
  const max = natural / area.width;
  return { min: Math.min(min, natural), max: Math.max(max, natural) };
}

/** The part of the picture shown when a body `bodyWidth` wide is set
 *  `bodyHeight` tall: the whole height with the sides cropped when the body
 *  is taller than the picture's own ratio, the whole width with top and
 *  bottom cropped when it is shorter. `undefined` when nothing is cropped. */
export function safeAreaSource(
  iw: number,
  ih: number,
  area: ResourceSafeArea,
  bodyWidth: number,
  bodyHeight: number,
): ResourceSafeArea | undefined {
  const natural = bodyWidth * (ih / iw);
  if (bodyWidth <= 0 || bodyHeight <= 0 || Math.abs(bodyHeight - natural) < 0.01) return undefined;
  if (bodyHeight > natural) {
    // Sides cropped: the visible share of the width.
    const w = Math.max(area.width, natural / bodyHeight);
    return { x: cropOffset(area.x, area.width, w), y: 0, width: w, height: 1 };
  }
  const h = Math.max(area.height, bodyHeight / natural);
  return { x: 0, y: cropOffset(area.y, area.height, h), width: 1, height: h };
}

/** Start of a visible span `visible` long (a fraction of the picture) that
 *  keeps the safe span [`start`, `start + size`] and crops the margins on
 *  either side in proportion to their sizes. */
function cropOffset(start: number, size: number, visible: number): number {
  const margins = 1 - size;
  if (margins <= 1e-9) return 0;
  const offset = start * (1 - visible) / margins;
  return Math.max(0, Math.min(1 - visible, offset));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** The box the whole picture covers when its `source` part fills
 *  `x, y, w, h`: what a renderer draws, clipped to the body. */
export function uncroppedPictureBox(
  x: number,
  y: number,
  w: number,
  h: number,
  source: ResourceSafeArea,
): { x: number; y: number; width: number; height: number } {
  const width = w / source.width;
  const height = h / source.height;
  return { x: x - source.x * width, y: y - source.y * height, width, height };
}
