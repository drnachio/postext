// Page numbers and outline pages carried between chapters, the keys a
// chapter's layout record is stored under and the tests of whether a
// recorded layout still applies (#1276: split out of pagination.ts).
import { type PostextConfig, type NumeralStyle, type OutlineEntry, formatNumeral, type LayoutContinuation, type Resource } from 'postext';
import type { ChapterPageNumber, CarriedOutlinePage, OutlinePage, ChapterPages, BookStart, ChapterLayout, Chapter, ChapterPlan } from '../types.js';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from '../layoutKeys.js';

/** The page number `n` resolves to when the chapter's first page is
 *  numbered `start`. */
export function resolvePageNumber(n: ChapterPageNumber, start: number): number {
  return 'delta' in n ? start + n.delta : n.value;
}

function samePageNumber(a: ChapterPageNumber, b: ChapterPageNumber): boolean {
  return 'delta' in a ? 'delta' in b && a.delta === b.delta : 'value' in b && a.value === b.value;
}

function sameLineNumber(a: ChapterPageNumber | undefined, b: ChapterPageNumber | undefined): boolean {
  return a === undefined || b === undefined ? a === b : samePageNumber(a, b);
}

/** The number a line count starts from when it inherits none
 *  (`lineNumbers.startAt − 1`, #621). */
export function lineCountBase(config: PostextConfig): number {
  const startAt = config.lineNumbers?.startAt;
  return (typeof startAt === 'number' && Number.isFinite(startAt) && startAt >= 0 ? Math.floor(startAt) : 1) - 1;
}

function sameCarriedOutline(a: readonly CarriedOutlinePage[] | undefined, b: readonly CarriedOutlinePage[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  if (x.length !== y.length) return false;
  return x.every((c, i) => {
    const d = y[i]!;
    return c.chapter === d.chapter && c.kind === d.kind && c.sourceStart === d.sourceStart
      && c.page.index === d.page.index && c.page.format === d.page.format && samePageNumber(c.page.number, d.page.number);
  });
}

function sameOutlinePages(a: readonly (OutlinePage | null)[], b: readonly (OutlinePage | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (x.index !== y.index || x.format !== y.format || !samePageNumber(x.number, y.number)) return false;
  }
  return true;
}

/** Where a chapter's pages start in the book. */
export interface PageStart {
  physical: number;
  number: number;
  format: NumeralStyle;
}

/** The chapter's outline with the page each entry landed on, as the chain
 *  currently places the chapter: `text` is the outline of its text (no
 *  pages), `pages` where the record says each entry went. */
export function placeOutline(text: readonly OutlineEntry[], pages: readonly (OutlinePage | null)[], start: PageStart): OutlineEntry[] {
  return text.map((entry, i) => {
    const page = pages[i];
    if (!page) return entry;
    return {
      ...entry,
      pageLabel: formatNumeral(resolvePageNumber(page.number, start.number), page.format),
      pageIndex: start.physical + page.index,
      // An index merges consecutive pages of one format into a range.
      ...(entry.kind === 'indexMark' ? { pageFormat: page.format } : {}),
    };
  });
}

/** The labels printed on a chapter's first and last pages (`XIII`, `15`),
 *  for the page range shown in the UI. */
export function chapterPageLabels(pages: ChapterPages): { from: string; to: string } {
  const from = formatNumeral(pages.pageNumberValue, pages.pageNumberFormat);
  const to = pages.pageCount > 1 ? formatNumeral(pages.lastPageNumberValue, pages.lastPageNumberFormat) : from;
  return { from: from || String(pages.pageNumberValue), to: to || String(pages.lastPageNumberValue) };
}

/** The key of a first chapter's layout record: `'first'` for a book that
 *  starts at its beginning (the records stored so far), and everything the
 *  start says otherwise, since the pages before it, the side it opens on
 *  and the counters it inherits never shift under it. */
export function firstContinuationKey(start: BookStart | undefined): string {
  return start ? `first|${JSON.stringify(start)}` : 'first';
}

export function countersKey(c: LayoutContinuation | undefined): string {
  if (!c) return '';
  const h = c.headings;
  const headings = h ? `${h.h1}.${h.h2}.${h.h3}.${h.h4}.${h.h5}.${h.h6}` : '';
  const counters = c.resourceCounters
    ? Object.keys(c.resourceCounters).sort().map((t) => {
      const e = c.resourceCounters![t]!;
      return `${t}=${e.counter}@${e.heading.h1}.${e.heading.h2}.${e.heading.h3}.${e.heading.h4}.${e.heading.h5}.${e.heading.h6}`;
    }).join(',')
    : '';
  const numbers = c.resourceNumbers
    ? Object.keys(c.resourceNumbers).sort().map((id) => `${id}=${c.resourceNumbers![id]!.number}`).join(',')
    : '';
  const part = c.part
    ? `${c.part.number}/${c.part.title}/${Object.entries(c.part.palette ?? {}).sort().map(([k, v]) => `${k}=${v}`).join(',')}`
    : '';
  // A part page closing the chapter before owes its break to this one,
  // which can move its pages. Appended only when set, so the key of every
  // other chapter (and the records stored under it) is what it was.
  const afterPart = c.afterPartPage ? '|after-part' : '';
  return `${headings}|${counters}|${numbers}|${part}${afterPart}`;
}

/** Whether `layout` was built from the inputs the chapter's pages depend
 *  on: its text, the configuration and resources (by fingerprint), the
 *  engine, and what it inherits. The book outline a chapter printing the
 *  contents was laid out with is not one of them (see
 *  {@link ChapterPlan.outlineStale}). */
export function chapterLayoutIsCurrent(
  layout: ChapterLayout | undefined,
  chapter: Chapter,
  config: PostextConfig,
  resources: Resource[],
  continuationKey: string,
): layout is ChapterLayout {
  return !!layout
    && layout.markdown === chapter.markdown
    && layout.engine === ENGINE_KEY
    && layout.configKey === configKeyOf(config)
    && layout.resourcesKey === resourcesKeyOf(resources)
    && layout.continuationKey === continuationKey;
}

/** Whether two plans of a chapter hand the engine the same inputs — the
 *  parts of a plan a layout depends on. The plan's `layout` record is the
 *  build's own output, so a preview selecting its plan through this
 *  equality does not rebuild when its previous build lands (the plan is
 *  re-derived, as new objects, whenever any chapter's layout is recorded);
 *  the counters are covered by `continuationKey`, the page fields compared
 *  by value. */
export function sameLayoutInputs(a: ChapterPlan, b: ChapterPlan): boolean {
  if (a === b) return true;
  if (
    a.chapterId !== b.chapterId
    || a.index !== b.index
    || a.paginated !== b.paginated
    || a.continuationKey !== b.continuationKey
    || a.outlineKey !== b.outlineKey
  ) return false;
  const ca = a.continuation;
  const cb = b.continuation;
  if (!ca || !cb) return ca === cb;
  return ca.pageIndexOffset === cb.pageIndexOffset
    && ca.pageNumbering?.format === cb.pageNumbering?.format
    && ca.pageNumbering?.startAt === cb.pageNumbering?.startAt
    && ca.bookPageCount === cb.bookPageCount
    && ca.lineNumber === cb.lineNumber;
}

/** Whether two layout records say the same thing about a chapter: built
 *  from the same inputs (as {@link chapterLayoutIsCurrent} checks them)
 *  with the same page outcome. Recording such a record again changes
 *  nothing downstream. */
export function sameChapterLayout(a: ChapterLayout | undefined, b: ChapterLayout): boolean {
  return !!a
    && a.chapterId === b.chapterId
    && a.markdown === b.markdown
    && a.configKey === b.configKey
    && a.resourcesKey === b.resourcesKey
    && a.engine === b.engine
    && a.continuationKey === b.continuationKey
    && a.pageCount === b.pageCount
    && a.leadingBlankPages === b.leadingBlankPages
    && samePageNumber(a.firstContentPageNumber, b.firstContentPageNumber)
    && a.firstContentPageFormat === b.firstContentPageFormat
    && samePageNumber(a.lastPageNumber, b.lastPageNumber)
    && a.lastPageFormat === b.lastPageFormat
    && sameLineNumber(a.lastLineNumber, b.lastLineNumber)
    && a.outlineKey === b.outlineKey
    && (a.jumpsKey ?? '') === (b.jumpsKey ?? '')
    && !!a.withoutFaces === !!b.withoutFaces
    && sameOutlinePages(a.outlinePages, b.outlinePages)
    && sameCarriedOutline(a.carriedOutline, b.carriedOutline);
}
