// Page items the composed pages (`pages.ts`) set as they stand, where the
// importer used to report or drop more than it lost (#1555): an object in
// the bleed taken for one across the spine, a cropped picture the template
// draws exactly as InDesign does, and a box that holds no text.

import type { IdmlPage } from '../../model/document.js';
import type { Box } from '../../model/geometry.js';
import type { GraphicCrop } from '../../resolve/geometry.js';

/** An object that runs across the spine of a spread of two pages: past
 *  the right edge of a left page, or the left edge of a right one. Past
 *  the other edge it stands in the bleed (a thumb tab, a band printed to
 *  the trim), on its own page. A page that is neither side checks its
 *  right edge, as before. */
export function crossesSpine(page: IdmlPage, box: Box, width: number, pagesInSpread: number): boolean {
  if (pagesInSpread < 2) return false;
  if (page.side === 'right') return box.left < -1 && box.right > 1;
  return box.right > width + 1 && box.left < width - 1;
}

/** A crop the page template's cover fit draws as the frame showed it:
 *  the picture scaled the same both ways, unturned, and filling the frame
 *  along one side (InDesign's frame then shows what a cover fit about the
 *  crop's centre shows). A crop that also cuts the picture along the
 *  other side was zoomed in: the template draws it larger than cover
 *  would, and it is reported. */
export function exactCover(crop: GraphicCrop): boolean {
  const even = Math.abs(crop.scaleX - crop.scaleY) <= 0.005 * Math.max(crop.scaleX, crop.scaleY);
  return even && !crop.flipped && Math.abs(crop.rotation) < 0.01 && (crop.width >= 0.995 || crop.height >= 0.995);
}

/** The Markdown of a box slot (a filled or stroked rectangle that lies
 *  over a frame of the page): an empty fence, which asks the engine to
 *  draw the frame's style (#1084). Without it the frame holds nothing and
 *  is not drawn, and the box (a cover's plaque, a box's tint) is lost
 *  without a word. */
export function emptyBoxFence(kind: string, name: string, style: string | undefined): string | undefined {
  return kind === 'box' && style ? `:::frame{slot="${name}"}\n:::` : undefined;
}

/** A page's decoration in the order InDesign paints it. A picture its
 *  frame crops goes in as it is read, a shape only once the page's frames
 *  are known, so a band drawn under a picture (an opener's colour behind
 *  its tiles) came after it and covered it. Page items (`s<z>`) are put
 *  back in their stacking order; the master's items stay first, under
 *  them. */
export function paintOrder<T extends { id: string }>(elements: T[]): T[] {
  const z = (e: T): number => {
    const m = /^s(\d+(?:\.\d+)?)/.exec(e.id);
    return m ? Number(m[1]) : -1;
  };
  return elements.map((e, i) => ({ e, i, z: z(e) })).sort((a, b) => a.z - b.z || a.i - b.i).map((x) => x.e);
}
