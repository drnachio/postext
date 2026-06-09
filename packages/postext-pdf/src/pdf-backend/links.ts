/**
 * PDF link helpers for resource references (issue #49 §7).
 *
 * Each `::resource{id=…}` embed creates a named destination keyed by the
 * resource id (an `[page /XYZ left top zoom]` array pointing at the embed's
 * top-left). Each inline `:ref{id=…}` becomes a `/Link` annotation whose
 * rectangle covers the rendered ref text and whose `/Dest` is the matching
 * destination.
 *
 * Destinations and links can be emitted in any page order, so collection is
 * two-phase: callers record destinations + pending links during page rendering,
 * then call {@link finalizeLinks} after every page has been drawn to attach the
 * annotations (resolving each link to its destination).
 */

import {
  PDFName,
  PDFArray,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';

interface DestRecord {
  page: PDFPage;
  /** Destination top in PDF points (page-bottom origin). */
  topPt: number;
  leftPt: number;
}

interface PendingLink {
  /** The page the link annotation lives on. */
  page: PDFPage;
  /** Annotation rectangle in PDF points: [x1, y1, x2, y2]. */
  rect: [number, number, number, number];
  /** Target resource id (resolved against the destination map at finalize). */
  resourceId: string;
}

export class LinkRegistry {
  private dests = new Map<string, DestRecord>();
  private pending: PendingLink[] = [];

  /** Record the named destination for a resource embed (idempotent — the first
   *  embed of a given id wins, matching first-reference numbering). */
  addDestination(resourceId: string, page: PDFPage, leftPt: number, topPt: number): void {
    if (this.dests.has(resourceId)) return;
    this.dests.set(resourceId, { page, leftPt, topPt });
  }

  /** Record a pending inline-ref link to be attached at finalize. */
  addLink(page: PDFPage, rect: [number, number, number, number], resourceId: string): void {
    this.pending.push({ page, rect, resourceId });
  }

  /** Attach all pending link annotations. Links whose destination resource was
   *  never embedded are skipped (they still rendered as styled text). */
  finalize(pdfDoc: PDFDocument): void {
    const context = pdfDoc.context;
    // Group annotation refs per page so each page's /Annots array is written once.
    const perPage = new Map<PDFPage, PDFRef[]>();

    for (const link of this.pending) {
      const dest = this.dests.get(link.resourceId);
      if (!dest) continue;
      const destArray = context.obj([
        dest.page.ref,
        PDFName.of('XYZ'),
        dest.leftPt,
        dest.topPt,
        null,
      ]);
      const annot = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: context.obj(link.rect),
        Border: context.obj([0, 0, 0]),
        Dest: destArray,
      });
      const ref = context.register(annot);
      const list = perPage.get(link.page);
      if (list) list.push(ref);
      else perPage.set(link.page, [ref]);
    }

    for (const [page, refs] of perPage) {
      const existing = page.node.get(PDFName.of('Annots'));
      if (existing instanceof PDFArray) {
        for (const ref of refs) existing.push(ref);
      } else {
        page.node.set(PDFName.of('Annots'), context.obj(refs));
      }
    }
  }
}
