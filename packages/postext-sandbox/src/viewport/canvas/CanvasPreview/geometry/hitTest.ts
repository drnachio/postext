// What lies under a pixel of a page: a design image, a reference, a link,
// a segment or a page target (#1276: split out of geometry.ts).
import { type VDTDocument, pageToFlow, resourceBlockToLocal } from 'postext';
import { blockFrameMatrix, intoBlockSpace, blockPointShown } from '../../../composed/frameHit.js';
import { type ResourceLocation, findResourceLocation, resourceBlocksOnPage, segmentInResourceLines, segmentInBlockLine } from './placement.js';
import type { VDTSegment, VDTBlock } from './segmentText.js';

/**
 * Hit-test a `:ref` segment at page-space pixel coordinates. Checks body-text
 * blocks plus resource captions / table cells (including float bands).
 * Returns the referenced resource id, or null when the click isn't on a ref.
 */
type VDTPageOf = VDTDocument['pages'][number];
type DesignSlotOf = NonNullable<VDTPageOf['openerBand']>;

/**
 * The image a design slot draws under a page pixel — an opener band's cover
 * picture, a header logo, an advanced heading design's plate — as the blob
 * id the block was resolved to, or null when none is there. Slots paint in
 * order (in-column overlays, then the opener band, header and footer) and
 * later blocks over earlier ones, so the last hit wins. The point is on the
 * sheet: on a vertical page it is turned into the flow frame for every slot
 * but the header and the footer.
 */
export function designImageFileIdAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): string | null {
  const page = doc.pages[pageIndex];
  if (!page) return null;
  const slots: DesignSlotOf[] = [];
  const flow = pageToFlow(page, xPage, yPage);
  // An overlay is painted in its block's composed frame, if any (#910).
  const inFrame = new Map<DesignSlotOf, { x: number; y: number }>();
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex || !b.designOverlay) continue;
    slots.push(b.designOverlay);
    const m = blockFrameMatrix(page, b.id);
    if (m) inFrame.set(b.designOverlay, intoBlockSpace(m, flow.x, flow.y));
  }
  if (page.openerBand) slots.push(page.openerBand);
  const sheetSlots = new Set<DesignSlotOf>();
  if (page.header) { slots.push(page.header); sheetSlots.add(page.header); }
  if (page.footer) { slots.push(page.footer); sheetSlots.add(page.footer); }
  let hit: string | null = null;
  for (const slot of slots) {
    const { x, y } = sheetSlots.has(slot) ? { x: xPage, y: yPage } : inFrame.get(slot) ?? flow;
    for (const block of slot.blocks) {
      if (block.kind !== 'image') continue;
      const r = block.bbox;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) hit = block.fileId;
    }
  }
  return hit;
}

export function refResourceIdAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): string | null {
  const seg = segmentAtPixel(doc, pageIndex, xPage, yPage);
  return seg && !seg.refAnchor ? seg.refResourceId ?? null : null;
}

/** What a click on a linked segment goes to (#265): a resource or an
 *  anchor a `:ref` names (with the book page the anchor landed on, when
 *  known), a footnote's note, a book page (an index page number) or a URL
 *  (a Markdown link). */
export type LinkTarget =
  | { kind: 'resource'; id: string }
  | { kind: 'anchor'; id: string; pageIndex?: number }
  | { kind: 'footnote'; id: string }
  | { kind: 'page'; pageIndex: number }
  | { kind: 'url'; href: string };

/** The link of the segment at page-space pixel coordinates, or null. */
export function linkTargetAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): LinkTarget | null {
  const seg = segmentAtPixel(doc, pageIndex, xPage, yPage);
  if (!seg) return null;
  if (seg.refResourceId !== undefined) {
    return seg.refAnchor
      ? { kind: 'anchor', id: seg.refResourceId, ...(seg.refPageIndex !== undefined ? { pageIndex: seg.refPageIndex } : {}) }
      : { kind: 'resource', id: seg.refResourceId };
  }
  if (seg.footnoteId !== undefined) return { kind: 'footnote', id: seg.footnoteId };
  if (seg.pageLink !== undefined) return { kind: 'page', pageIndex: seg.pageLink };
  // A link inside the document (`[see](#sec-intro)`, a citation's
  // `#ref-key`) goes to its anchor.
  if (seg.href !== undefined && seg.href.startsWith('#') && seg.href.length > 1) return { kind: 'anchor', id: decodeURIComponent(seg.href.slice(1)) };
  if (seg.href !== undefined) return { kind: 'url', href: seg.href };
  return null;
}

/** Where an anchor or a footnote's note landed in `doc` (#265), or null
 *  when it is not in this document. */
export function findLinkLocation(doc: VDTDocument, target: LinkTarget): ResourceLocation | null {
  if (target.kind === 'resource') return findResourceLocation(doc, target.id);
  if (target.kind === 'anchor') {
    const a = doc.anchors?.find((x) => x.id === target.id);
    return a ? { pageIndex: a.pageIndex, x: a.x, y: a.y } : null;
  }
  if (target.kind === 'footnote') {
    const note = doc.blocks.find((b) => b.footnoteNote === target.id && b.pageIndex >= 0 && !b.hidden);
    return note ? { pageIndex: note.pageIndex, x: note.bbox.x, y: note.bbox.y } : null;
  }
  return null;
}

/** The segment under page-space pixel coordinates: body text, captions and
 *  table cells (float bands included). */
function segmentAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): VDTSegment | null {
  const candidates: VDTBlock[] = doc.blocks.filter((b) => b.pageIndex === pageIndex && !b.resourceBlock);
  for (const rb of resourceBlocksOnPage(doc, pageIndex)) candidates.push(rb);
  const page = doc.pages[pageIndex];

  for (const b of candidates) {
    if (b.hidden) continue;
    // In the block's composed frame, if any (#910).
    const { x, y } = intoBlockSpace(blockFrameMatrix(page, b.id), xPage, yPage);
    if (!blockPointShown(page, b.id, { x, y })) continue;
    if (x < b.bbox.x || x > b.bbox.x + b.bbox.width) continue;
    if (y < b.bbox.y || y > b.bbox.y + b.bbox.height) continue;
    const rb = b.resourceBlock;
    if (rb) {
      // A rotated block keeps its lines in its upright frame.
      const p = resourceBlockToLocal(rb, x, y);
      const inCaption = segmentInResourceLines(rb.captionLines, p.x, p.y);
      if (inCaption?.refResourceId !== undefined) return inCaption;
      if (rb.table) {
        for (const cell of rb.table.cells) {
          const inCell = segmentInResourceLines(cell.lines, p.x, p.y);
          if (inCell?.refResourceId !== undefined) return inCell;
        }
      }
      continue;
    }
    for (const line of b.lines) {
      if (y < line.bbox.y || y > line.bbox.y + line.bbox.height) continue;
      const hit = segmentInBlockLine(b, line, x);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/**
 * Hit-test a row of the contents (`:::toc`) at page-space pixel
 * coordinates: the book page index the row points at, or null when the
 * click isn't on a row that knows its page.
 */
export function pageTargetAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): number | null {
  const page = doc.pages[pageIndex];
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex || b.hidden) continue;
    const target = b.tocEntry?.pageIndex ?? b.tocPart?.pageIndex;
    if (target === undefined) continue;
    const { x, y } = intoBlockSpace(blockFrameMatrix(page, b.id), xPage, yPage);
    if (x < b.bbox.x || x > b.bbox.x + b.bbox.width) continue;
    if (y < b.bbox.y || y > b.bbox.y + b.bbox.height) continue;
    return target;
  }
  return null;
}
