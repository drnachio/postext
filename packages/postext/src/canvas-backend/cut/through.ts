// Die-cuts on the canvas (#1565, #1567): a page's holes and the paper past
// its leaf's outline are cut out of the painted page (made transparent),
// and what a reader sees through them is drawn back in: the pages beneath,
// each clipped by the holes of every page above it (`seeThrough`), with a
// soft shadow along each cut edge and a thin darker line for the paper's
// wall, and the board or the background past the book's end.

import type { VDTDocument, VDTPage, VDTPathCommand } from '../../vdt.js';
import { seeThrough } from '../../dieCut/seeThrough.js';
import { traceDiePaths } from '../../dieCut/path2d.js';
import { restoreContext, saveContext } from '../contextState.js';

/** A page's painted image, by document page index; `undefined` when the
 *  host has none (the layer is then filled with the paper's colour). */
export type PageImageSource = (pageIndex: number) => CanvasImageSource | undefined;

/** Options of the see-through composite. */
export interface ComposeThroughOptions {
  /** Px of the sheet left out on every side of each image (the trim offset
   *  of a trimmed render, `RenderPageOptions.trim`); 0 when the images
   *  cover the whole sheet. */
  inset?: number;
  /** What shows past the book's last leaf (or before its first): the
   *  board, or the viewer's background. Default a dark board grey. */
  background?: string;
  /** How many layers deep to draw (default: every one `seeThrough`
   *  finds). */
  maxDepth?: number;
}

/** The board past the end of the book. */
const DEFAULT_BOARD = '#3b3833';
/** The shadow each cut edge throws on the page beneath. */
const EDGE_SHADOW = 'rgba(0, 0, 0, 0.45)';
/** The paper's wall seen at the edge of the cut. */
const WALL_COLOR = 'rgba(0, 0, 0, 0.32)';

type Ctx = CanvasRenderingContext2D;

function clipTo(ctx: Ctx, paths: readonly (readonly VDTPathCommand[])[]): void {
  ctx.beginPath();
  traceDiePaths(ctx, paths);
  ctx.clip('nonzero');
}

/**
 * Makes `page`'s holes and the paper outside its leaf's outline (within
 * the trim; the bleed and slug of an untrimmed render stay) transparent on
 * `ctx`, whose transform maps page px. Nothing for a page without a cut.
 */
export function cutDieShapes(ctx: Ctx, page: VDTPage, doc: Pick<VDTDocument, 'trimOffset'>): void {
  const cut = page.dieCut;
  if (!cut || (cut.holes.length === 0 && !cut.outline)) return;
  saveContext(ctx);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';
  if (cut.holes.length > 0) {
    ctx.beginPath();
    traceDiePaths(ctx, cut.holes);
    ctx.fill('nonzero');
  }
  if (cut.outline) {
    const t = doc.trimOffset;
    ctx.beginPath();
    ctx.rect(t, t, page.width - 2 * t, page.height - 2 * t);
    traceDiePaths(ctx, cut.outline);
    ctx.fill('evenodd');
  }
  restoreContext(ctx);
}

/**
 * Draws what shows through page `pageIndex`'s holes on `ctx`, whose
 * transform maps page px (`pxPerPagePx` bitmap pixels each): the layers of
 * `seeThrough`, deepest first, each clipped by the holes above it, then the
 * edge shadows and walls. Draws nothing outside the holes.
 */
export function paintThrough(ctx: Ctx, doc: Pick<VDTDocument, 'pages' | 'pageIndexOffset'>, pageIndex: number, source: PageImageSource, pxPerPagePx = 1, options: ComposeThroughOptions = {}): void {
  const page = doc.pages[pageIndex];
  const holes = page?.dieCut?.holes;
  if (!page || !holes || holes.length === 0) return;
  const layers = seeThrough(doc, pageIndex, options.maxDepth);
  const inset = options.inset ?? 0;
  for (let k = layers.length - 1; k >= 0; k--) {
    const layer = layers[k]!;
    saveContext(ctx);
    for (const clip of layer.clips) clipTo(ctx, clip);
    const image = layer.pageIndex >= 0 ? source(layer.pageIndex) : undefined;
    if (image) ctx.drawImage(image, inset, inset, page.width - 2 * inset, page.height - 2 * inset);
    else {
      const beneath = layer.pageIndex >= 0 ? doc.pages[layer.pageIndex] : undefined;
      ctx.fillStyle = layer.pageIndex < 0 ? options.background ?? DEFAULT_BOARD : beneath?.background ?? '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
    }
    restoreContext(ctx);
  }
  // The cut edges: a shadow thrown inwards, then the wall's line.
  for (const hole of holes) {
    saveContext(ctx);
    clipTo(ctx, [hole]);
    ctx.shadowColor = EDGE_SHADOW;
    ctx.shadowBlur = 6 * pxPerPagePx;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.rect(-page.width, -page.height, page.width * 3, page.height * 3);
    traceDiePaths(ctx, [hole]);
    ctx.fill('evenodd');
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = 3 / pxPerPagePx;
    ctx.beginPath();
    traceDiePaths(ctx, [hole]);
    ctx.stroke();
    restoreContext(ctx);
  }
}

/**
 * The see-through composite of page `pageIndex` on `target` (a canvas, or
 * its context) at `scale` bitmap pixels per page px: only the hole regions
 * are drawn, so alpha outside them stays as it was (transparent on a fresh
 * canvas: the alpha marks the holes). What Folio's through texture and the
 * canvas viewer share.
 */
export function composeThrough(
  doc: Pick<VDTDocument, 'pages' | 'pageIndexOffset'>,
  pageIndex: number,
  source: PageImageSource,
  target: HTMLCanvasElement | CanvasRenderingContext2D,
  scale = 1,
  options: ComposeThroughOptions = {},
): void {
  const ctx = 'getContext' in target ? target.getContext('2d') : target;
  if (!ctx) return;
  saveContext(ctx);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const inset = options.inset ?? 0;
  if (inset > 0) ctx.translate(-inset, -inset);
  paintThrough(ctx, doc, pageIndex, source, scale, options);
  restoreContext(ctx);
}
