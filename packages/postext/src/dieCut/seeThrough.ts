// What a reader sees through the holes of a page (#1565, #1567): the page
// beneath, and the pages under that wherever the holes line up. Each layer
// shows through the holes of every page above it at once, so its clips
// intersect. Bounding boxes decide where the walk stops: no rasterising,
// so a tunnel twenty leaves deep costs twenty box tests. Pure.

import type { BoundingBox, VDTDocument, VDTPathCommand } from '../vdt.js';
import { intersectBoxes, pathBounds, unionBoxes } from './geometry.js';
import { pageBeneath } from './leaves.js';

/** One page seen through the holes above it: `pageIndex` (−1: past the
 *  book's end, the board or the background) and the holes of each page
 *  above it, nearest first. The layer shows where every one of those
 *  lists has a hole (each list is a union, the lists intersect). */
export interface SeeThroughLayer {
  pageIndex: number;
  clips: VDTPathCommand[][][];
}

/** The holes of `holes` whose boxes meet `region`, and the box of all of
 *  them within it. */
function holesIn(holes: readonly VDTPathCommand[][], region: BoundingBox): { kept: VDTPathCommand[][]; box: BoundingBox | undefined } {
  const kept: VDTPathCommand[][] = [];
  let box: BoundingBox | undefined;
  for (const h of holes) {
    const b = pathBounds(h);
    const meet = b ? intersectBoxes(b, region) : undefined;
    if (!meet) continue;
    kept.push(h);
    box = unionBoxes(box, meet);
  }
  return { kept, box };
}

/**
 * The layers seen through page `i`'s holes, nearest first (see
 * {@link SeeThroughLayer}): the page beneath (`pageBeneath`), then the one
 * beneath it while its own holes meet what shows of it, and so on. The walk
 * stops on a page whose holes miss the opening above, after `maxDepth`
 * layers, or at the book's end, whose layer is `{ pageIndex: -1 }`. Empty
 * for a page without holes.
 */
export function seeThrough(doc: Pick<VDTDocument, 'pages' | 'pageIndexOffset'>, i: number, maxDepth = Infinity): SeeThroughLayer[] {
  const own = doc.pages[i]?.dieCut?.holes ?? [];
  let region = pathBounds(own);
  if (!region || own.length === 0) return [];
  const clips: VDTPathCommand[][][] = [own];
  const layers: SeeThroughLayer[] = [];
  let j = pageBeneath(doc, i);
  while (layers.length < maxDepth) {
    layers.push({ pageIndex: j, clips: clips.slice() });
    if (j < 0) break;
    const { kept, box } = holesIn(doc.pages[j]?.dieCut?.holes ?? [], region);
    if (kept.length === 0 || !box) break;
    region = intersectBoxes(region, box);
    if (!region) break;
    clips.push(kept);
    j = pageBeneath(doc, j);
  }
  return layers;
}
