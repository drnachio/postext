// A document as a book: its recto rule, trimmed page size, paper and
// appearance, and the paintings a new layout can keep (#1276: split out of
// postext.ts).
import { type VDTDocument, type VDTPage, folioForTrim, resolveFolioConfig, type FolioPaperConfig } from 'postext';
import type { FolioAppearance } from '../viewer.js';

/** Whether the document's first page is a recto: page 1, or a chapter
 *  continued after an even number of pages. */
export function firstPageIsRecto(doc: VDTDocument): boolean {
  return (doc.pageIndexOffset ?? 0) % 2 === 0;
}

/** A page's width and height as bound: the trim box, since a book is cut
 *  (a sheet laid out with cut lines also carries the bleed, the slug and
 *  the crop marks, none of which a bound page shows). */
export function trimmedSize(page: VDTPage, doc: VDTDocument): { width: number; height: number } {
  const inset = Math.max(0, doc.trimOffset);
  return { width: page.width - 2 * inset, height: page.height - 2 * inset };
}

/** The page's colour, for blank pages: white when it has none. */
export function paperOf(doc: VDTDocument): string {
  const hex = doc.config.page.backgroundColor.hex;
  return hex && hex !== "transparent" ? hex : "#fff";
}

/** How the document's book is presented: its `folio` settings, its page
 *  width, the book's pages before and after it (a chapter of a longer
 *  book), with the host's own appearance laid over them. The pages round
 *  it are the host's word when it gives them (`extraPages`: a host laying
 *  a book out a chapter at a time knows the chapters after this one, which
 *  the document only knows when it was given the book's page count). A
 *  newspaper trim (`page.sizePreset` broadsheet, berliner, tabloid or
 *  compact) shows folded newsprint unless the settings name a stock or a
 *  binding (#506). */
export function appearanceOf(doc: VDTDocument, own: FolioAppearance | undefined): FolioAppearance {
  const page = doc.pages[0];
  const before = Math.max(0, own?.extraPages?.before ?? doc.pageIndexOffset ?? 0);
  const after = Math.max(0, own?.extraPages?.after ?? (doc.bookPageCount ?? 0) - before - doc.pages.length);
  const folio = folioForTrim(own && "folio" in own ? own.folio : doc.config.folio, doc.config.page.sizePreset);
  // The document's own covers: the book's first page (a recto) and its
  // last, when that is a verso (an even page number). A chapter from the
  // middle of the book has neither: its first and last leaves are paper
  // (#449).
  const ownCovers = resolveFolioConfig(folio).binding.cover === "pages";
  const total = before + doc.pages.length;
  return {
    covers: { front: ownCovers && before === 0, back: ownCovers && after === 0 && total % 2 === 0 },
    // Page sizes are in device pixels at the page's dpi.
    ...(page ? { pageWidthMm: (trimmedSize(page, doc).width * 25.4) / (doc.config.page.dpi || 300) } : {}),
    ...own,
    folio,
    extraPages: { before, after },
  };
}

/** The paper a page is printed on, when a `:::paper` run sets one. */
export const pagePaperOf = (page: VDTPage | undefined) => (page as { paper?: FolioPaperConfig } | undefined)?.paper;

/** What a page is painted from, as text: two pages with the same
 *  signature under the same config paint the same. */
const signatures = new WeakMap<object, string>();
export function signature(of: VDTPage | VDTDocument["config"]): string {
  let sig = signatures.get(of);
  if (sig === undefined) {
    sig = JSON.stringify(of);
    signatures.set(of, sig);
  }
  return sig;
}

/**
 * Which paintings a new layout can keep: new page index → old page index,
 * for every page of `wanted` that is the same page as a painted one (the
 * same object, or one that reads the same). Each old painting goes to one
 * page at most.
 */
export function carriedPaintings(
  before: readonly VDTPage[],
  painted: Iterable<number>,
  next: readonly VDTPage[],
  wanted: Iterable<number>,
): Map<number, number> {
  const carried = new Map<number, number>();
  const byPage = new Map<VDTPage, number>();
  for (const k of painted) if (before[k]) byPage.set(before[k], k);
  if (byPage.size === 0) return carried;
  let bySignature: Map<string, number> | null = null;
  for (const i of wanted) {
    const page = next[i];
    if (!page) continue;
    let k = byPage.get(page);
    if (k === undefined) {
      bySignature ??= new Map([...byPage].map(([p, j]) => [signature(p), j]));
      k = bySignature.get(signature(page));
    }
    if (k === undefined) continue;
    carried.set(i, k);
    byPage.delete(before[k]!);
    bySignature = null;
  }
  return carried;
}
