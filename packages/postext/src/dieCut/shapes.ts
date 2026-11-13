// Die shapes as outlines in page px (#1565): a die shape of the config at
// its place on the trim, a shape stretched to a box (a composed page's
// `kind: 'cut'` element), and the outline of a whole leaf (rounded corners,
// a shaped book). Pure.

import type { Dimension, ResolvedDieCutsConfig, ResolvedDieShape } from '../types.js';
import type { BoundingBox, VDTDocument, VDTPathCommand } from '../vdt.js';
import { dimensionToPx } from '../units.js';
import { mapPath, parseSvgPathCached } from '../design/svgPath.js';
import { ellipsePath, mirrorPath, rectPath, roundRectPath } from './geometry.js';

/** What a die shape needs of the page to be laid on it: the resolution,
 *  where the trim starts (the bleed and slug before it) and the sheet's
 *  size, in px. */
export interface DieCutMetrics {
  dpi: number;
  /** Px from the sheet's edge to the trim's (0 without cut lines). */
  trimOffset: number;
  /** The sheet (page px, bleed included). */
  width: number;
  height: number;
  /** What `em` lengths are measured against (px). Default 16. */
  fontSizePx?: number;
}

/** The metrics of `doc`'s pages: every page of a document shares one
 *  sheet. */
export function dieMetricsOf(doc: Pick<VDTDocument, 'config' | 'trimOffset' | 'pages'>): DieCutMetrics {
  const first = doc.pages[0];
  const dpi = doc.config.page.dpi;
  return {
    dpi,
    trimOffset: doc.trimOffset,
    width: first?.width ?? dimensionToPx(doc.config.page.width, dpi) + 2 * doc.trimOffset,
    height: first?.height ?? dimensionToPx(doc.config.page.height, dpi) + 2 * doc.trimOffset,
  };
}

const px = (d: Dimension, m: DieCutMetrics) => dimensionToPx(d, m.dpi, m.fontSizePx ?? 16);

/** A shape's outline inside `box` (page px): a rectangle, a rounded one
 *  (`radius`), a circle (the largest one the box holds, centred), an
 *  ellipse, or path data stretched from its `viewBox` to the box. Path
 *  data that cannot be read gives the box itself, so a hole never goes
 *  missing without a trace. */
export function dieShapeInBox(shape: Pick<ResolvedDieShape, 'shape' | 'radius' | 'd' | 'viewBox'>, box: BoundingBox, metrics: DieCutMetrics): VDTPathCommand[] {
  const { x, y, width: w, height: h } = box;
  switch (shape.shape) {
    case 'rect':
      return rectPath(x, y, w, h);
    case 'roundRect': {
      const r = px(shape.radius, metrics);
      return roundRectPath(x, y, w, h, [r, r, r, r]);
    }
    case 'circle': {
      const d = Math.min(w, h);
      return ellipsePath(x + (w - d) / 2, y + (h - d) / 2, d, d);
    }
    case 'ellipse':
      return ellipsePath(x, y, w, h);
    case 'path': {
      const parsed = typeof shape.d === 'string' ? parseSvgPathCached(shape.d) : undefined;
      if (!parsed?.ok || parsed.subpaths.length === 0) return rectPath(x, y, w, h);
      const [vw, vh] = shape.viewBox;
      return mapPath(parsed.subpaths, x, y, w / vw, h / vh).flat();
    }
  }
}

/** A die shape's box on the page it is placed on (page px): measured from
 *  the trim's top-left corner. */
export function dieShapeBox(shape: ResolvedDieShape, metrics: DieCutMetrics): BoundingBox {
  return {
    x: metrics.trimOffset + px(shape.x, metrics),
    y: metrics.trimOffset + px(shape.y, metrics),
    width: Math.max(0, px(shape.width, metrics)),
    height: Math.max(0, px(shape.height, metrics)),
  };
}

/** A die shape's outline on the page it is placed on, in page px, or on
 *  the other side of its leaf when `mirrored` (`x' = sheet width − x`). */
export function dieShapePath(shape: ResolvedDieShape, metrics: DieCutMetrics, mirrored = false): VDTPathCommand[] {
  const path = dieShapeInBox(shape, dieShapeBox(shape, metrics), metrics);
  return mirrored ? mirrorPath(path, metrics.width) : path;
}

/** The gap text keeps from a shape's hole (px); 0 when it does not wrap. */
export function dieWrapGapPx(shape: Pick<ResolvedDieShape, 'wrap'>, metrics: DieCutMetrics): number {
  return shape.wrap === false ? 0 : Math.max(0, px(shape.wrap.gap, metrics));
}

/**
 * The outline every leaf is cut to, on a page of side `side`: the config's
 * `outline` stretched to the trim (a recto's; a verso's mirrored), else
 * the trim with its `corners` rounded (the fore-edge ones: right on a
 * recto and left on a verso of a left-bound book, the other way round in a
 * right-bound one; or all four). `undefined` when the leaf is the plain
 * trim rectangle. An outline wins over corners.
 */
export function leafOutline(
  config: Pick<ResolvedDieCutsConfig, 'outline' | 'corners'>,
  metrics: DieCutMetrics,
  side: 'recto' | 'verso',
  binding: 'left' | 'right' = 'left',
): VDTPathCommand[][] | undefined {
  const t = metrics.trimOffset;
  const w = metrics.width - 2 * t;
  const h = metrics.height - 2 * t;
  if (config.outline) {
    const parsed = parseSvgPathCached(config.outline.d);
    if (!parsed.ok || parsed.subpaths.length === 0) return undefined;
    const [vw, vh] = config.outline.viewBox;
    const recto = mapPath(parsed.subpaths, t, t, w / vw, h / vh);
    return side === 'recto' ? recto : recto.map((p) => mirrorPath(p, metrics.width));
  }
  if (config.corners) {
    const r = px(config.corners.radius, metrics);
    if (!(r > 0)) return undefined;
    if (config.corners.edges === 'all') return [roundRectPath(t, t, w, h, [r, r, r, r])];
    // The fore edge: the side away from the spine.
    const foreRight = (side === 'recto') === (binding === 'left');
    return [roundRectPath(t, t, w, h, foreRight ? [0, r, r, 0] : [r, 0, 0, r])];
  }
  return undefined;
}
