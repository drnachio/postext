// What lies under a point of a laid-out page, and what a click there does:
// the Canvas viewer's own hit tests (the same functions, in the order its
// click handler tries them), for a page of any chapter whatever tab is on
// screen. No DOM: the point is given on the sheet, in the page's px.

import { formatNumeral, pageComics, pageToFlow } from 'postext';
import type { Resource, VDTBlock, VDTComicBalloon, VDTDocument } from 'postext';
import type { BookPlan, Chapter } from '../book/types.js';
import { getSvgTextIndex } from '../controls/media/svgTextIndex.js';
import {
  designImageFileIdAtPixel,
  findLinkLocation,
  linkTargetAtPixel,
  pageTargetAtPixel,
  pixelToSourceOffset,
  type LinkTarget,
} from '../viewport/canvas/CanvasPreview/geometry.js';
import { resourceTextAtPixel, type ResourceTextHit } from '../viewport/canvas/CanvasPreview/resourceHit.js';
import { registryArtOpacity } from '../viewport/comics/artAlpha.js';
import { comicPressAt, type ComicPress } from '../viewport/comics/comicHit.js';

/** A link under a point: one of the text's (see `LinkTarget`), or a row
 *  of the contents, which goes to the book page it lists. */
export type PointLink = LinkTarget | { kind: 'contents'; pageIndex: number };

/** What a click at a point does, as the Canvas's click handler decides it. */
export type PointClick =
  | { action: 'follow_link'; link: PointLink }
  | { action: 'open_resource'; resourceId: string }
  | { action: 'edit_resource_text'; hit: ResourceTextHit }
  | { action: 'place_caret'; offset: number }
  | { action: 'none' };

export interface PagePointHit {
  /** The block whose box holds the point (the innermost one). */
  block: VDTBlock | null;
  /** The link of the text under the point, or the contents row there. */
  link: PointLink | null;
  /** The part of a comic under the point. */
  comic: ComicPress | null;
  /** The resource whose picture a design slot draws there (a cover, a logo). */
  designImageResourceId: string | null;
  /** Editable text of a resource there: a caption, a note, a table cell,
   *  a text of an SVG figure. */
  resourceText: ResourceTextHit | null;
  /** Where the point falls in the document's source (body text). */
  offset: number | null;
  click: PointClick;
}

const inside = (r: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** The innermost visible block of page `pageIndex` whose box holds the
 *  point (flow frame): a paragraph inside a callout rather than the
 *  callout's frame. */
export function blockAtPoint(doc: VDTDocument, pageIndex: number, x: number, y: number): VDTBlock | null {
  const page = doc.pages[pageIndex];
  if (!page) return null;
  let best: VDTBlock | null = null;
  for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
    if (block.hidden || !inside(block.bbox, x, y)) continue;
    if (!best || block.bbox.width * block.bbox.height < best.bbox.width * best.bbox.height) best = block;
  }
  return best;
}

/** What is at `(sheetX, sheetY)` of page `pageIndex` (sheet px, before
 *  any turn of the flow). `resources` is the set the document was laid out
 *  from. */
export function hitTestPage(doc: VDTDocument, pageIndex: number, sheetX: number, sheetY: number, resources: readonly Resource[]): PagePointHit {
  const page = doc.pages[pageIndex]!;
  // The text, the floats and the opener live in the page's flow frame.
  const flow = pageToFlow(page, sheetX, sheetY);
  const textLink = linkTargetAtPixel(doc, pageIndex, flow.x, flow.y);
  const row = textLink ? null : pageTargetAtPixel(doc, pageIndex, flow.x, flow.y);
  const link: PointLink | null = textLink ?? (row !== null ? { kind: 'contents', pageIndex: row } : null);

  const comics = pageComics(page);
  // No screen scale here: a split line is hit on its gutter, a tail tip
  // with its balloon.
  const comic = comics.length > 0 ? comicPressAt(comics, sheetX, sheetY, { band: 0, tipRadius: 0, opaque: registryArtOpacity }) : null;

  const fileId = designImageFileIdAtPixel(doc, pageIndex, sheetX, sheetY);
  const designImageResourceId = fileId === null
    ? null
    : resources.find((r) => r.bitmap?.fileId === fileId || r.svg?.fileId === fileId || r.video?.poster?.fileId === fileId)?.id ?? null;
  const resourceText = resourceTextAtPixel(doc, pageIndex, flow.x, flow.y, getSvgTextIndex);
  const offset = pixelToSourceOffset(doc, pageIndex, flow.x, flow.y);

  // The click handler's order: a link of the document (a URL is followed
  // only with Cmd or Ctrl held, so a plain click falls through), a row of
  // the contents, a comic balloon, a panel's picture, a design image,
  // resource text, then the body text.
  let click: PointClick = { action: 'none' };
  const balloonOffset = comic?.kind === 'text' ? comic.offset : comic?.kind === 'balloon' || comic?.kind === 'tail' ? comic.balloon.sourceStart : null;
  if (link && link.kind !== 'url') click = { action: 'follow_link', link };
  else if (balloonOffset !== null) click = { action: 'place_caret', offset: balloonOffset };
  else if (comic?.kind === 'art') click = { action: 'open_resource', resourceId: comic.art.resourceId };
  else if (designImageResourceId !== null) click = { action: 'open_resource', resourceId: designImageResourceId };
  else if (resourceText) click = { action: 'edit_resource_text', hit: resourceText };
  else if (offset !== null) click = { action: 'place_caret', offset };

  return { block: blockAtPoint(doc, pageIndex, flow.x, flow.y), link, comic, designImageResourceId, resourceText, offset, click };
}

/** A page of the book as a tool names it. */
export interface PageRef {
  /** The chapter's position in the book (from 1). */
  chapter: number;
  /** The page's position among the chapter's pages (from 1), when the
   *  chapter is the one laid out. */
  position?: number;
  /** The number the page carries, as printed. */
  page: string;
}

/** The book page at `bookPageIndex` (its index among the book's pages):
 *  a page of `doc`, the document of chapter `chapterIndex`, else one found
 *  through the page ranges of the paginated chapters; null when it lies
 *  in a chapter not paginated yet. */
export function bookPageRef(doc: VDTDocument, chapterIndex: number, bookPageIndex: number, chapters: readonly Chapter[], plan: BookPlan): PageRef | null {
  const local = bookPageIndex - (doc.pageIndexOffset ?? 0);
  const own = doc.pages[local];
  if (local >= 0 && own) return { chapter: chapterIndex + 1, position: local + 1, page: own.pageLabel };
  for (let i = 0; i < chapters.length; i++) {
    const pages = plan.bookPages[chapters[i]!.id];
    if (!pages || bookPageIndex < pages.pageIndex || bookPageIndex >= pages.pageIndex + pages.pageCount) continue;
    const number = pages.pageNumberValue + (bookPageIndex - pages.pageIndex);
    // Numbered as the chapter's first page is (a restart further in is not known here).
    return { chapter: i + 1, page: formatNumeral(number, pages.pageNumberFormat) || String(number) };
  }
  return null;
}

/** Where a link leads: a page of the book, or nowhere this layout knows
 *  (a figure another chapter sets, a chapter not paginated yet). */
export function linkDestination(doc: VDTDocument, chapterIndex: number, link: PointLink, chapters: readonly Chapter[], plan: BookPlan): PageRef | null {
  if (link.kind === 'url') return null;
  if (link.kind === 'page' || link.kind === 'contents') return bookPageRef(doc, chapterIndex, link.pageIndex, chapters, plan);
  const here = findLinkLocation(doc, link);
  if (here) {
    const page = doc.pages[here.pageIndex];
    return page ? { chapter: chapterIndex + 1, position: here.pageIndex + 1, page: page.pageLabel } : null;
  }
  return link.kind === 'anchor' && link.pageIndex !== undefined ? bookPageRef(doc, chapterIndex, link.pageIndex, chapters, plan) : null;
}

/** The kinds of target an id may name in a laid-out document, in the
 *  order they are tried: a resource placed there, an anchor (a heading's
 *  `{#id}`, an anchor set in the text) or a footnote's note. */
export const ANCHOR_KINDS = ['resource', 'anchor', 'footnote'] as const;

/** Where the target named `id` is set in `doc`, and which kind it is. */
export function findAnchor(doc: VDTDocument, id: string): { kind: (typeof ANCHOR_KINDS)[number]; pageIndex: number; x: number; y: number } | null {
  for (const kind of ANCHOR_KINDS) {
    const at = findLinkLocation(doc, { kind, id });
    if (at) return { kind, ...at };
  }
  return null;
}

/** A comic balloon in words. */
export function balloonSummary(balloon: VDTComicBalloon): Record<string, unknown> {
  return {
    kind: balloon.kind,
    style: balloon.style,
    ...(balloon.speaker ? { speaker: balloon.speaker } : {}),
    panel: balloon.panelIndex + 1,
  };
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}'’-]/u;

/** Where `offset` falls in `text`: its line and column (from 1), the line
 *  itself and the word the offset touches. */
export function sourcePlace(text: string, offset: number): { line: number; column: number; offset: number; word: string; lineText: string } {
  const at = Math.max(0, Math.min(text.length, offset));
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const nextBreak = text.indexOf('\n', at);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < lineStart; i = text.indexOf('\n', i + 1)) line++;
  let from = at;
  let to = at;
  while (from > lineStart && WORD_CHAR.test(text[from - 1]!)) from--;
  while (to < lineEnd && WORD_CHAR.test(text[to]!)) to++;
  return { line, column: at - lineStart + 1, offset: at, word: text.slice(from, to), lineText: text.slice(lineStart, lineEnd) };
}
