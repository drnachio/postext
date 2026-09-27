/**
 * Heading designs cut off by the page (EF-91). A heading whose reserved
 * height reaches past the foot of its column claims the rest of the column
 * (of the page, for an opener), so nothing runs under it — but a design
 * taller than the page itself still loses what lies past the page's foot
 * (an opener, painted across the page) or past its column's foot (an
 * in-column design, which canvas and PDF cut at its column's foot). The layout
 * does not report it: a cover whose design claims the page is the usual
 * case and loses nothing, so `VDTDocument.warnings` stays as it is. A host
 * that wants to know runs this check on the finished layout; the Sandbox
 * lists its results in the Checks panel.
 */

import type { VDTBlock, VDTDesignSlot, VDTDocument } from '../vdt';

/** A heading design laid out past the foot of what can print it. */
export interface HeadingDesignCut {
  kind: 'headingDesignCut';
  /** Page of the heading, in its document. */
  pageIndex: number;
  /** The heading's level. */
  level: number;
  /** `'page'`: an opener's text runs past the foot of the page (its trim);
   *  `'column'`: an in-column design's text runs past the foot of its
   *  column. */
  where: 'page' | 'column';
  /** How far the lowest baseline of the design's text lies past that
   *  foot, in px. */
  overflowPx: number;
  /** Source range of the heading, for an editor to point at. */
  sourceStart?: number;
  sourceEnd?: number;
}

/** How far the lowest text baseline of `slot` lies past `foot` (px; 0 when
 *  every line is above it). Rules, boxes and pictures running on past the
 *  foot are left alone: a band bled off the page is a design, lost text
 *  is not. */
function textPast(slot: VDTDesignSlot, foot: number): number {
  let over = 0;
  for (const b of slot.blocks) {
    if (b.kind !== 'text') continue;
    for (const line of b.lines) over = Math.max(over, line.baselineY - foot);
  }
  return over;
}

function cutOf(block: VDTBlock, pageIndex: number, where: 'page' | 'column', overflowPx: number): HeadingDesignCut {
  return {
    kind: 'headingDesignCut',
    pageIndex,
    level: block.headingLevel ?? 1,
    where,
    overflowPx,
    ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : {}),
    ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
  };
}

/**
 * The heading designs of `doc` whose text is laid out past the foot of the
 * page (an opener) or of the heading's column (an in-column design), by
 * more than half a pixel: a long lead on a small screen page, say. Part
 * pages and blank versos are not headings and are not checked. Pure: reads
 * the finished layout only.
 */
export function collectHeadingDesignCuts(doc: VDTDocument): HeadingDesignCut[] {
  const out: HeadingDesignCut[] = [];
  // The trim's foot: with cut lines on, the page carries a margin of
  // `trimOffset` round the trim box.
  const trimOffset = doc.trimOffset ?? 0;
  for (const page of doc.pages) {
    const headings = page.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'heading');
    // An opener hides the heading block whose design it paints.
    const opener = page.openerBand && !page.partInfo ? headings.find((h) => h.hidden) : undefined;
    if (opener) {
      const over = textPast(page.openerBand!, page.height - trimOffset);
      if (over > 0.5) out.push(cutOf(opener, page.index, 'page', over));
    }
    for (const h of headings) {
      if (!h.designOverlay || h.hidden) continue;
      const col = page.columns[h.columnIndex];
      if (!col) continue;
      const over = textPast(h.designOverlay, col.bbox.y + col.bbox.height);
      if (over > 0.5) out.push(cutOf(h, page.index, 'column', over));
    }
  }
  return out;
}
