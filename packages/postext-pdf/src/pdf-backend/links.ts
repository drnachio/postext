/**
 * PDF link helpers for resource references (issue #49 §7) and the contents.
 *
 * Each `::resource{id=…}` embed creates a named destination keyed by the
 * resource id (an `[page /XYZ left top zoom]` array pointing at the embed's
 * top-left). Each inline `:ref{id=…}` becomes a `/Link` annotation whose
 * rectangle covers the rendered ref text and whose `/Dest` is the matching
 * destination. A row of the contents (`:::toc`) becomes a `/Link` to the
 * top of the page it lists, when that page is in the document. The words of
 * a Markdown link (`VDTLineSegment.href`) become a `/Link` with a URI
 * action, one per line they run over.
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
  PDFDict,
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
  resourceId?: string;
  /** Target book page (physical index, `VDTDocument.pageIndexOffset`
   *  counted in), resolved against the document's pages at finalize. */
  pageIndex?: number;
  /** Target URI of a Markdown link (a URI action instead of a destination). */
  uri?: string;
  struct?: LinkStruct;
}

/** URI schemes a PDF link may open; any other target is left as text. */
const PDF_URI_RE = /^(?:https?|mailto|tel|ftp):/i;

/** A Markdown link target as a PDF URI (7-bit ASCII, ISO 32000-1 §12.6.4.7):
 *  characters outside printable ASCII percent-encoded as UTF-8; undefined
 *  for a relative URL, which a PDF has no base to resolve against. */
export function pdfUri(href: string): string | undefined {
  if (!PDF_URI_RE.test(href)) return undefined;
  let out = '';
  for (const ch of href) {
    const code = ch.codePointAt(0)!;
    out += code > 0x20 && code < 0x7f ? ch : encodeURIComponent(ch);
  }
  return out;
}

/** An ASCII string as a PDF hex string (safe for any bracket or backslash). */
function asciiHex(text: string): PDFHexString {
  let hex = '';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(2, '0');
  return PDFHexString.of(hex);
}

/** The link destination of an anchor (a heading's `{#id}`, an inline
 *  anchor, a container, #264): book-wide, so a reference in one chapter
 *  reaches an anchor of another. A key no resource id takes: it opens with
 *  a NUL. */
export function anchorDestination(id: string): string {
  return `\u0000a:${id}`;
}

/** The destination a `:ref` segment links to: its resource, or the
 *  anchor it names (`refAnchor`, #264). */
export function refTarget(seg: { refResourceId?: string; refAnchor?: true }): string | undefined {
  if (seg.refResourceId === undefined) return undefined;
  return seg.refAnchor ? anchorDestination(seg.refResourceId) : seg.refResourceId;
}

export class LinkRegistry {
  private dests = new Map<string, DestRecord>();
  /** Destinations also reachable by name from outside the file
   *  (`file.pdf#nameddest=sec-intro`, #264): name → destination key. */
  private names = new Map<string, string>();
  private pending: PendingLink[] = [];
  /** The document of a book being drawn (keys its footnote destinations). */
  documentIndex = 0;

  /** Physical pages before the document's first page. */
  constructor(private readonly pageIndexOffset = 0) {}

  /** Record the named destination for a resource embed (idempotent — the first
   *  embed of a given id wins, matching first-reference numbering). */
  addDestination(resourceId: string, page: PDFPage, leftPt: number, topPt: number, name?: string): void {
    if (this.dests.has(resourceId)) return;
    this.dests.set(resourceId, { page, leftPt, topPt });
    if (name !== undefined && !this.names.has(name)) this.names.set(name, resourceId);
  }

  /** Record a pending inline-ref link to be attached at finalize. */
  addLink(page: PDFPage, rect: [number, number, number, number], resourceId: string, struct?: LinkStruct): void {
    this.pending.push({ page, rect, resourceId, struct });
  }

  /** Record a pending link to a URI (a Markdown link's words on one line);
   *  `uri` is already a {@link pdfUri}. */
  addUriLink(page: PDFPage, rect: [number, number, number, number], uri: string, struct?: LinkStruct): void {
    this.pending.push({ page, rect, uri, struct });
  }

  /** Record a pending link to the top of a book page (a contents row). */
  addPageLink(page: PDFPage, rect: [number, number, number, number], pageIndex: number, struct?: LinkStruct): void {
    this.pending.push({ page, rect, pageIndex, struct });
  }

  /** Attach all pending link annotations. Links whose destination resource was
   *  never embedded are skipped (they still rendered as styled text; in a
   *  tagged render their `Link` element dissolves into the paragraph). With
   *  `tree`, each annotation joins its `Link` element (`OBJR` kid,
   *  `/StructParent`) and carries `/Contents` (PDF/UA-1 §7.18.5). */
  finalize(pdfDoc: PDFDocument, tree?: StructTree): void {
    const context = pdfDoc.context;
    const pages = pdfDoc.getPages();
    // Group annotation refs per page so each page's /Annots array is written once.
    const perPage = new Map<PDFPage, PDFRef[]>();

    for (const link of this.pending) {
      let destArray: PDFArray | undefined;
      if (link.uri !== undefined) {
        // An external link: a URI action, no destination.
      } else if (link.pageIndex !== undefined) {
        // A page outside the document (a chapter rendered on its own
        // listing the whole book) gets no link.
        const target = pages[link.pageIndex - this.pageIndexOffset];
        if (!target) {
          if (link.struct && tree) tree.dissolve(link.struct.elem);
          continue;
        }
        destArray = context.obj([target.ref, PDFName.of('XYZ'), null, target.getHeight(), null]);
      } else {
        const dest = link.resourceId !== undefined ? this.dests.get(link.resourceId) : undefined;
        if (!dest) {
          if (link.struct && tree) tree.dissolve(link.struct.elem);
          continue;
        }
        destArray = context.obj([
          dest.page.ref,
          PDFName.of('XYZ'),
          dest.leftPt,
          dest.topPt,
          null,
        ]);
      }
      const annot = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: context.obj(link.rect),
        Border: context.obj([0, 0, 0]),
        F: PDFNumber.of(4),
        ...(destArray
          ? { Dest: destArray }
          : { A: context.obj({ Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: asciiHex(link.uri!) }) }),
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
    this.writeNamedDestinations(pdfDoc);
  }

  /** The catalog's `/Names /Dests` name tree (ISO 32000-1 §7.9.6,
   *  §12.3.2.3): one leaf with every named destination, keys sorted by
   *  their bytes as the tree requires. */
  private writeNamedDestinations(pdfDoc: PDFDocument): void {
    if (this.names.size === 0) return;
    const context = pdfDoc.context;
    const entries = [...this.names].map(([name, key]) => ({ name: PDFHexString.fromText(name), bytes: utf16Bytes(name), dest: this.dests.get(key)! }));
    entries.sort((a, b) => compareBytes(a.bytes, b.bytes));
    const names: (PDFHexString | PDFArray)[] = [];
    for (const e of entries) {
      names.push(e.name, context.obj([e.dest.page.ref, PDFName.of('XYZ'), e.dest.leftPt, e.dest.topPt, null]));
    }
    const dests = context.obj({ Names: context.obj(names) });
    const catalogNames = pdfDoc.catalog.get(PDFName.of('Names'));
    const namesDict = catalogNames instanceof PDFDict ? catalogNames : context.obj({});
    namesDict.set(PDFName.of('Dests'), context.register(dests));
    if (!(catalogNames instanceof PDFDict)) pdfDoc.catalog.set(PDFName.of('Names'), context.register(namesDict));
  }
}

/** A text string's bytes as `PDFHexString.fromText` writes them (UTF-16BE
 *  with a byte-order mark): what a name tree sorts its keys by. */
function utf16Bytes(text: string): number[] {
  const out = [0xfe, 0xff];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out.push(c >> 8, c & 0xff);
  }
  return out;
}

function compareBytes(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** The fields of a line segment that say which reference it paints. */
interface RefSegment {
  text: string;
  refResourceId?: string;
  refContinues?: boolean;
}

/** A reference being painted: where it starts (px), its text so far and
 *  its `Link` element (tagged render only). */
export interface RefRunState {
  resourceId: string;
  startX: number;
  text: string;
  link?: StructElem;
}

/**
 * Follows one inline `:ref` across the segments that paint it. A reference
 * set in small capitals is painted as several runs, one per case, the later
 * ones flagged `refContinues`: they share one `Link` element, and the link
 * annotation, recorded once the last run is painted, covers them all.
 */
export class RefRun {
  private current: RefRunState | undefined;

  /** Call before painting `seg` at `x` (px). Returns the `Link` element its
   *  text joins: a new child of `elem` at a reference's first run, the same
   *  one for the runs that continue it; none for plain text or an untagged
   *  render. */
  enter(seg: RefSegment, x: number, elem: StructElem | undefined, resourceId = seg.refResourceId): StructElem | undefined {
    if (resourceId === undefined) {
      this.current = undefined;
      return undefined;
    }
    if (!seg.refContinues || this.current?.resourceId !== resourceId) {
      this.current = { resourceId, startX: x, text: '', link: elem ? elem.child('Link') : undefined };
    }
    this.current.text += seg.text;
    return this.current.link;
  }

  /** Call after painting `seg`. Returns the whole reference once its last
   *  run is painted (`next` does not continue it), else nothing. */
  leave(seg: RefSegment, next: RefSegment | undefined, resourceId = seg.refResourceId): RefRunState | undefined {
    const current = this.current;
    if (!current || resourceId === undefined) return undefined;
    if (next?.refContinues && next.refResourceId === current.resourceId) return undefined;
    this.current = undefined;
    return current;
  }
}

/** What a {@link UriRuns} needs of the page being drawn. */
interface UriRunsCtx {
  page: PDFPage;
  pageHeightPt: number;
  scale: number;
  mapRectPt?: (rect: [number, number, number, number]) => [number, number, number, number];
}

/**
 * The Markdown links of one line as it is painted left to right: each run
 * of words sharing a target — spaces between them included — becomes one
 * URI link annotation over the line box and, in a tagged render, one `Link`
 * element (child of `parent`) holding their text. Feed every segment in
 * order, then call {@link end}.
 */
export class UriRuns {
  private run: { uri: string; x1: number; x2: number; text: string; elem?: StructElem } | null = null;

  constructor(
    private readonly ctx: UriRunsCtx,
    private readonly line: { bbox: { y: number; height: number } },
    private readonly registry: LinkRegistry | undefined,
    private readonly parent: StructElem | undefined,
  ) {}

  /** A word at `x` (px) of `width`: the `Link` element its text joins when
   *  it is part of a link (`href` a PDF-openable URL), else undefined. A
   *  word without a link, or with another one, ends the open run. */
  word(href: string | undefined, x: number, width: number, text: string): StructElem | undefined {
    const uri = href !== undefined ? pdfUri(href) : undefined;
    if (this.run && this.run.uri !== uri) this.flush();
    if (uri === undefined) return undefined;
    if (this.run) {
      this.run.x2 = x + width;
      this.run.text += text;
    } else {
      this.run = { uri, x1: x, x2: x + width, text, elem: this.parent?.child('Link') };
    }
    return this.run.elem;
  }

  /** A word space: joins the open run's element (a space inside a link;
   *  one after its last word ends up there too, which extraction reads the
   *  same). The run's box only grows with the next word. */
  space(text: string): StructElem | undefined {
    if (!this.run) return undefined;
    this.run.text += text;
    return this.run.elem;
  }

  /** Anything that is not a word (a formula, a swatch, a chip) ends the
   *  open run. */
  other(): void {
    this.flush();
  }

  end(): void {
    this.flush();
  }

  private flush(): void {
    const run = this.run;
    this.run = null;
    if (!run || !this.registry) return;
    const { scale, pageHeightPt } = this.ctx;
    const rect: [number, number, number, number] = [
      run.x1 * scale,
      pageHeightPt - (this.line.bbox.y + this.line.bbox.height) * scale,
      run.x2 * scale,
      pageHeightPt - this.line.bbox.y * scale,
    ];
    this.registry.addUriLink(
      this.ctx.page,
      this.ctx.mapRectPt ? this.ctx.mapRectPt(rect) : rect,
      run.uri,
      run.elem ? { elem: run.elem, contents: run.text.trim() } : undefined,
    );
  }
}
