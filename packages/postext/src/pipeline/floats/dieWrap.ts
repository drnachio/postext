// Text wrap round die-cut holes (#1565). A hole is known before its page
// is filled: `dieCuts.pages` names its page, a `:::diecut` run starts the
// page it cuts, and the leaf rule gives the other side and the leaves
// after. Each hole, grown by its gap, becomes a fixed exclusion of every
// column it crosses (`OpenWrap` kind `'fixed'`): the lines beside it are
// set short by its shape (a contour), on the side of the column it is
// nearer; the text runs on the other.
//
// A column's exclusion takes one side, as every wrap of the flow does: a
// hole in the middle of a wide column leaves the text the wider side, and
// the narrower one empty.

import type { ContentBlock } from '../../parse/types.js';
import type { VDTColumn, VDTContourSpan, VDTDocument, VDTExclusion, VDTPathCommand } from '../../vdt.js';
import { extentInBand, flattenPath, growBox, intersectBoxes, pathBounds } from '../../dieCut/geometry.js';
import { type DiePlacement, configPlacements, holesOnPage, shapePlacement } from '../../dieCut/place.js';
import { type DieCutMetrics, dieMetricsOf } from '../../dieCut/shapes.js';
import { dieByBlock } from '../pages/dieCuts.js';
import type { ColumnObstacleSource } from './textWrap.js';

/** How many bands a hole's contour is cut into, top to bottom. */
const CONTOUR_BANDS = 48;

/** The exclusions the holes of a page make in `col` (see the module
 *  comment); none for a hole that does not wrap (gap 0) or misses it. */
export function holeExclusions(col: Pick<VDTColumn, 'bbox'>, holes: readonly { path: VDTPathCommand[]; id: string; wrapGapPx: number }[]): VDTExclusion[] {
  const out: VDTExclusion[] = [];
  const c = col.bbox;
  for (const h of holes) {
    const gap = h.wrapGapPx;
    const b = pathBounds(h.path);
    if (!b || !(gap > 0)) continue;
    const grown = growBox(b, gap);
    if (!intersectBoxes(grown, c)) continue;
    const leftInset = grown.x + grown.width - c.x;
    const rightInset = c.x + c.width - grown.x;
    const side: 'left' | 'right' = leftInset <= rightInset ? 'left' : 'right';
    const width = Math.max(0, Math.min(c.width, side === 'left' ? leftInset : rightInset));
    const polys = flattenPath(h.path);
    const spans: VDTContourSpan[] = [];
    const step = Math.max(1, b.height / CONTOUR_BANDS);
    for (let y = b.y; y < b.y + b.height - 1e-6; y += step) {
      const ext = extentInBand(polys, y, Math.min(b.y + b.height, y + step));
      if (ext) spans.push({ y, height: Math.min(step, b.y + b.height - y), left: ext.left, right: ext.right });
    }
    out.push({
      x: side === 'left' ? c.x : c.x + c.width - width,
      y: grown.y,
      width,
      height: grown.height,
      side,
      gap,
      ownerId: `diecut:${h.id}`,
      ...(spans.length > 0 ? { contour: { spans, margin: gap } } : {}),
    });
  }
  return out;
}

/** Where the pass stands: the block being set and the page of the cursor. */
export interface PassAt {
  blockIdx: number;
  pageIndex: number;
}

/**
 * The obstacle source of a pass (`setColumnObstacleSource`): the holes the
 * die-cuts make in each column, from `dieCuts.pages` and the `:::diecut`
 * runs met so far. `undefined` when the document cuts nothing it could
 * know of before its pages are filled (a template's cut element is laid
 * with the decoration, after the frames).
 */
export function dieWrapSource(doc: VDTDocument, contentBlocks: readonly ContentBlock[], at: () => PassAt): ColumnObstacleSource | undefined {
  const dice = doc.config.dieCuts;
  if (!dice) return undefined;
  const byBlock = dieByBlock(contentBlocks);
  const runs = byBlock.some((d) => d !== undefined);
  if (dice.pages.length === 0 && !runs) return undefined;
  const offset = doc.pageIndexOffset ?? 0;
  let metrics: DieCutMetrics | undefined;
  let base: DiePlacement[] | undefined;
  const runPlacements = new Map<number, DiePlacement>();
  const pageOf = (col: VDTColumn, hint: number): number => {
    if (doc.pages[hint]?.columns.includes(col)) return hint;
    for (let i = doc.pages.length - 1; i >= 0; i--) if (doc.pages[i]!.columns.includes(col)) return i;
    return -1;
  };
  return (col) => {
    const now = at();
    const pageIndex = pageOf(col, now.pageIndex);
    if (pageIndex < 0) return undefined;
    metrics ??= dieMetricsOf(doc);
    base ??= configPlacements(dice, metrics, Number.POSITIVE_INFINITY, offset).placements;
    // The run the block being set belongs to cuts the page it lands on
    // (not the page a run's opening marker closes).
    const block = contentBlocks[now.blockIdx];
    const marker = block && (block.type === 'containerStart' || block.type === 'containerEnd') && block.containerName === 'diecut';
    const die = marker ? undefined : byBlock[now.blockIdx];
    const shape = die ? dice.shapes.find((s) => s.id === die) : undefined;
    if (shape && pageIndex === now.pageIndex && !runPlacements.has(pageIndex)) runPlacements.set(pageIndex, shapePlacement(shape, pageIndex, metrics));
    const holes = holesOnPage([...base, ...runPlacements.values()], pageIndex, metrics, offset);
    return holes.length > 0 ? holeExclusions(col, holes) : undefined;
  };
}
