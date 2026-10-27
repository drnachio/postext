// A resource set upright on a vertical page, its frame narrowed to the
// picture's width, and moving a laid-out resource block along x
// (#1278: split out of resourceBlock.ts).
import { type ResolvedResourceBlock, createBoundingBox } from '../../../../vdt.js';
import type { ResourceLayoutInput } from '../input.js';
import { type ResourceBlockLayout, layoutResourceBlock } from '../resourceBlock.js';

/** The share of its first width an upright picture keeps when its frame
 *  narrows (see `layoutUprightResourceBlock`): it may give up a quarter,
 *  about two caption lines in a full tier. */
const UPRIGHT_MIN_PICTURE_SHARE = 0.75;

/**
 * A resource set upright on a vertical page (see `ResourceLayoutInput.
 * upright`): a counter-clockwise rotated block whose upright frame is as
 * wide as its picture. The frame is first tried `maxLength` wide, which
 * gives the picture its largest size (the caption on the fewest lines). A
 * picture the tier's height shrinks (or a bitmap narrower than that) gives
 * its width back, and the block is laid out again at the picture's width
 * so the caption wraps under it, a few rounds until the width holds. A
 * narrower frame is taken only while it fits the tier and the picture
 * keeps `UPRIGHT_MIN_PICTURE_SHARE` of its first width: a caption that
 * wraps onto more lines at each narrowing would otherwise squeeze the
 * picture to nothing and run the frame past the tier. When the rounds stop
 * short of a frame as wide as the picture, the frame narrows by bisection
 * to the least width at which the picture still keeps that share, and the
 * caption runs wider than the picture. The origin is block-relative
 * (`originX` 0, `originY` the block's height in the flow), as
 * `offsetResourceBlockToAbsolute` expects.
 */
export function layoutUprightResourceBlock(input: ResourceLayoutInput, maxLength: number): ResourceBlockLayout {
  const base: ResourceLayoutInput = { ...input, upright: undefined, rotate: 'ccw' };
  const at = (length: number) => layoutResourceBlock({ ...base, rotatedLength: length });
  let length = Math.max(1, maxLength);
  let out = at(length);
  if (input.resource.kind === 'bitmap' || input.resource.kind === 'svg' || input.resource.kind === 'video') {
    const floor = out.block.bodyRect.width * UPRIGHT_MIN_PICTURE_SHARE;
    const holds = (o: ResourceBlockLayout) =>
      o.block.rotation!.height <= input.columnWidth + 0.5 && o.block.bodyRect.width >= floor;
    let settled = false;
    for (let round = 0; round < 4; round++) {
      const used = out.block.bodyRect.width;
      if (!(used > 0) || used >= length - 0.5) {
        settled = true;
        break;
      }
      const next = at(Math.max(1, used));
      if (!holds(next)) break;
      length = Math.max(1, used);
      out = next;
    }
    if (!settled) {
      let lo = Math.max(1, floor);
      let hi = length;
      for (let step = 0; step < 12 && hi - lo > 0.5; step++) {
        const mid = (lo + hi) / 2;
        const o = at(mid);
        if (holds(o)) {
          hi = mid;
          out = o;
        } else {
          lo = mid;
        }
      }
    }
  }
  const rotation = out.block.rotation!;
  rotation.originX = 0;
  rotation.originY = out.totalHeight;
  return out;
}

/** Shift a resolved resource block's geometry right by `dx` (an inline
 *  resource narrower than its column, set per `placement.align`). */
export function shiftResourceBlockX(rb: ResolvedResourceBlock, dx: number): void {
  if (!dx) return;
  rb.bodyRect = createBoundingBox(rb.bodyRect.x + dx, rb.bodyRect.y, rb.bodyRect.width, rb.bodyRect.height);
  for (const ln of [...rb.captionLines, ...rb.noteLines, ...rb.continuesLines]) ln.bbox.x += dx;
  if (rb.captionBar) rb.captionBar.rect.x += dx;
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += dx;
      if (cell.image) cell.image.rect.x += dx;
      for (const cl of cell.lines) cl.bbox.x += dx;
    }
  }
}
