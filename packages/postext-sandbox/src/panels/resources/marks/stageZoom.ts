// Zoom of the picture in the marks dialog (#956): the steps, the wheel and
// the zoom from which a dense map names all its points.

/** The most the picture is enlarged: a map of a hundred towns is worked on
 *  at eight times its fitted size. */
export const MAX_STAGE_ZOOM = 8;

/** From this zoom a dense map (more anchors than `DENSE_ANCHORS`) shows
 *  every name, as the picture then has room for them. */
export const STAGE_NAMES_ZOOM = 3;

const STEPS = [1, 1.5, 2, 3, 4, 6, MAX_STAGE_ZOOM];

/** The zoom a step of the buttons or keys goes to: the next level above
 *  (`direction` 1) or below (-1) `zoom`. */
export function zoomStep(zoom: number, direction: 1 | -1): number {
  if (direction === 1) return STEPS.find((s) => s > zoom + 1e-9) ?? MAX_STAGE_ZOOM;
  for (let i = STEPS.length - 1; i >= 0; i--) if (STEPS[i]! < zoom - 1e-9) return STEPS[i]!;
  return 1;
}

/** The factor a wheel event with a Ctrl or Meta key (a pinch on a
 *  trackpad) zooms by: smooth for small deltas, capped for the notches of
 *  a mouse wheel. */
export function wheelZoom(deltaY: number): number {
  return Math.exp(-Math.max(-30, Math.min(30, deltaY)) * 0.01);
}

/** Two touch points: where they meet (their middle) and how far apart
 *  they are. */
export function touchPair(a: { x: number; y: number }, b: { x: number; y: number }): { cx: number; cy: number; distance: number } {
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) };
}

/** The zoom two fingers give (#970): the zoom when they went down times
 *  how much farther apart they are now, kept between the fitted picture
 *  and the most. A pair that went down on one spot changes nothing. */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return startZoom;
  return Math.max(1, Math.min(MAX_STAGE_ZOOM, startZoom * (distance / startDistance)));
}

/** The scroll that keeps the point of the picture at fractions (`fx`, `fy`)
 *  of its extent under the place (`ox`, `oy`) of the viewport: how a pinch
 *  and a two-finger drag move the picture together. */
export function scrollForFocus(fx: number, fy: number, ox: number, oy: number, extent: { width: number; height: number }): { left: number; top: number } {
  return { left: fx * extent.width - ox, top: fy * extent.height - oy };
}
