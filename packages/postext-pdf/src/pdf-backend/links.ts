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
  PDFHexString,
  PDFName,
  PDFArray,
  PDFNumber,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import type { StructElem, StructTree } from './tagging';

/** Structure bookkeeping of a link in an accessible render: the `Link`
 *  element wrapping the ref text, and the annotation's `/Contents`. */
export interface LinkStruct {
  elem: StructElem;
  contents: string;
}

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
  struct?: LinkStruct;
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
  addLink(page: PDFPage, rect: [number, number, number, number], resourceId: string, struct?: LinkStruct): void {
    this.pending.push({ page, rect, resourceId, struct });
  }

  /** Attach all pending link annotations. Links whose destination resource was
   *  never embedded are skipped (they still rendered as styled text; in a
   *  tagged render their `Link` element dissolves into the paragraph). With
   *  `tree`, each annotation joins its `Link` element (`OBJR` kid,
   *  `/StructParent`) and carries `/Contents` (PDF/UA-1 §7.18.5). */
  finalize(pdfDoc: PDFDocument, tree?: StructTree): void {
    const context = pdfDoc.context;
    // Group annotation refs per page so each page's /Annots array is written once.
    const perPage = new Map<PDFPage, PDFRef[]>();

    for (const link of this.pending) {
      const dest = this.dests.get(link.resourceId);
      if (!dest) {
        if (link.struct && tree) tree.dissolve(link.struct.elem);
        continue;
      }
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
        F: PDFNumber.of(4),
        Dest: destArray,
      });
      const ref = context.nextRef();
      if (link.struct && tree) {
        annot.set(PDFName.of('Contents'), PDFHexString.fromText(link.struct.contents));
        annot.set(PDFName.of('StructParent'), PDFNumber.of(tree.annotation(link.struct.elem, link.page, ref)));
      }
      context.assign(ref, annot);
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
