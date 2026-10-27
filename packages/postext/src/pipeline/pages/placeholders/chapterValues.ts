// Per-page chapter and part values for running heads: titles, numbers and
// attributes of the chapter a page belongs to, at its top or anywhere on it
// (#1278: split out of placeholders.ts).
import { replaceTitleBreaks } from '../../../parse/inlineFormatting.js';
import type { DigitSystem } from '../../../types.js';
import { withDigits } from '../../../numerals/arabicNumerals.js';
import type { VDTBlock } from '../../../vdt.js';
import { plainTextOfBlock } from './lineText.js';

/** A minimal view of a page used by `computeChapterTitles` to detect
 *  blank parity-padding pages. We accept just the flags rather than the
 *  whole `VDTPage` so this helper stays easy to test in isolation.
 *
 *  `blankForParity` pages belong to the upcoming chapter (they exist
 *  solely to push it onto the right parity). `blankForForce` pages
 *  belong to the *previous* chapter (they are the mandatory separator
 *  of the `always-*` modes) — the walker stops when it hits one. */
export interface ChapterTitlePageInfo {
  blankForParity?: boolean;
  blankForForce?: boolean;
  /** Set on a part-divider page. */
  partInfo?: unknown;
}

/**
 * Precompute chapter titles (most recent H1 text) for each page index by
 * walking blocks once. Returns an array where `result[pageIndex]` is the plain
 * text of the most recent H1 encountered at or before that page. When no H1
 * has appeared yet, the entry is an empty string.
 *
 * When `pages` is supplied, blank parity-padding pages immediately
 * preceding a new H1 are retroactively attributed to the *upcoming*
 * chapter — the blank left-hand page that exists only to push the next
 * chapter onto a right-hand page should display the new chapter's title
 * in its header, not the previous chapter's.
 */
export function computeChapterTitles(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): string[] {
  return computeChapterValues(blocks, totalPages, pages, plainTextOfBlock, '');
}

/**
 * Precompute chapter numbers (most recent H1 `numberPrefix`) per page. Mirrors
 * `computeChapterTitles` but tracks the numeric prefix (e.g. `"1"`, `"2"`) so
 * `{chapterNumber}` in heading-context slots resolves to the current chapter.
 */
export function computeChapterNumbers(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
  ordinalOffset = 0,
  /** Chapters that print no number at all (a heading style whose
   *  `numberingTemplate` is `''`): they count, but show no ordinal. */
  numberless?: (block: VDTBlock) => boolean,
  /** The document's digit system, for the chapter ordinal. */
  digits?: DigitSystem,
): string[] {
  return computeChapterValues(blocks, totalPages, pages, chapterNumberCounter(ordinalOffset, numberless, digits), '');
}

/**
 * `{chapterNumber}` at each placed block: the value of the last level-1
 * heading at or before it in document order ('' before the first), by the
 * same counter as `computeChapterNumbers`. A heading design reads its own
 * block's value — where two chapters meet on a page, the page value is the
 * later one's, which is right for the running heads but not for the first
 * chapter's heading, nor for a lower heading that comes before the later
 * chapter. The document's build measures an opener with this same value
 * (over the content blocks), so measure and paint agree.
 */
export function computeChapterNumbersByBlock(
  blocks: readonly VDTBlock[],
  ordinalOffset = 0,
  numberless?: (block: VDTBlock) => boolean,
  digits?: DigitSystem,
): Map<VDTBlock, string> {
  const next = chapterNumberCounter(ordinalOffset, numberless, digits);
  const out = new Map<VDTBlock, string>();
  let current = '';
  for (const b of blocks) {
    // Same walk as `computeChapterValues`: unplaced blocks do not count.
    if (b.pageIndex < 0) continue;
    if (b.headingLevel === 1) {
      const value = next(b);
      // A plate (`runningChapter: false`) reads its own value; the blocks
      // after it stay in the chapter it interrupts.
      if (b.notRunningChapter) {
        out.set(b, value);
        continue;
      }
      current = value;
    }
    out.set(b, current);
  }
  return out;
}

/** The fields of a level-1 heading `{chapterNumber}` reads. */
export interface ChapterNumberSource {
  /** A heading style with `numbered: false`. */
  unnumbered?: boolean;
  /** The heading's content block index: blocks of one heading split
   *  across columns share it and count once. */
  contentIndex?: number;
  /** The heading's own counter value (a `startAt` attribute restarts it). */
  headingNumber?: number;
  /** The formatted number the level's (or style's) template prints. */
  numberPrefix?: string;
}

/** What `{chapterNumber}` prints for each level-1 heading, fed in document
 *  order: the heading's number prefix, else — without a numbering
 *  template — the chapter ordinal, continuing past the `ordinalOffset`
 *  chapters laid out before this document. An unnumbered chapter advances
 *  nothing and shows nothing; a `numberless` one counts but shows nothing.
 *  One rule for the running heads (`computeChapterNumbers`, over the placed
 *  blocks) and for measuring an opener design before it is painted (over
 *  the content blocks), so both read the same value. The ordinal is
 *  written in the document's `digits`; a prefix already is. */
export function chapterNumberCounter<B extends ChapterNumberSource>(
  ordinalOffset = 0,
  numberless?: (block: B) => boolean,
  digits?: DigitSystem,
): (block: B) => string {
  let ordinal = ordinalOffset;
  let lastContentIndex: number | undefined;
  return (b) => {
    // An unnumbered chapter (a heading style with `numbered: false`)
    // advances nothing and shows no number.
    if (b.unnumbered) {
      lastContentIndex = b.contentIndex;
      return '';
    }
    // A heading split across columns yields several blocks with the same
    // content index; count the chapter once. The heading's own counter
    // wins (a `startAt` attribute restarts it).
    if (b.contentIndex === undefined || b.contentIndex !== lastContentIndex) ordinal = b.headingNumber ?? ordinal + 1;
    lastContentIndex = b.contentIndex;
    const prefix = b.numberPrefix?.trim() ?? '';
    return prefix.length > 0 ? prefix : numberless?.(b) ? '' : withDigits(String(ordinal), digits);
  };
}

/**
 * Precompute the heading attributes (`# Title {key="value"}`) of the most
 * recent H1 per page. Backs `{attr.<key>}` in header/footer slots; pages
 * before the first H1 get an empty record.
 */
export function computeChapterAttrs(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): Record<string, string>[] {
  return computeChapterValues(blocks, totalPages, pages, (b) => b.attrs ?? {}, {});
}

/**
 * `{chapterTitleAtTop}`: per page, the title of the chapter in force at the
 * top of the page, the chapter whose text opens it. That is the chapter a
 * level-1 heading opens when the heading is the first block placed on the
 * page, and otherwise the chapter the page runs on from, even when a new
 * one starts lower down the page. `computeChapterTitles` gives the later
 * one on such a page. A blank parity page goes with the page after it, as
 * there, so it names the chapter in force at that page's top; a
 * `blankForForce` page goes with the page before it.
 */
export function computeChapterTitlesAtTop(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): string[] {
  return computeChapterValues(blocks, totalPages, pages, plainTextOfBlock, '', true);
}

/** `{chapterNumberAtTop}`: the number of the chapter in force at the top
 *  of each page (see {@link computeChapterTitlesAtTop}), by the counter of
 *  `computeChapterNumbers`. */
export function computeChapterNumbersAtTop(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
  ordinalOffset = 0,
  numberless?: (block: VDTBlock) => boolean,
  digits?: DigitSystem,
): string[] {
  return computeChapterValues(blocks, totalPages, pages, chapterNumberCounter(ordinalOffset, numberless, digits), '', true);
}

/** Shared walker behind `computeChapterTitles` / `computeChapterNumbers` /
 *  `computeChapterAttrs`: tracks the most recent H1's extracted value per
 *  page, starting from `empty` before the first H1. With `atTop`, a page
 *  takes the value in force at its top instead: a level-1 heading changes
 *  its page's value, and claims the blank parity pages before it, only
 *  when it is the first block placed there. A
 *  level-1 heading marked `notRunningChapter` (a plate) changes nothing;
 *  `extract` still sees it, so a counter counts it. */
function computeChapterValues<T>(
  blocks: VDTBlock[],
  totalPages: number,
  pages: ChapterTitlePageInfo[] | undefined,
  extract: (block: VDTBlock) => T,
  empty: T,
  atTop = false,
): T[] {
  const out = new Array<T>(totalPages).fill(empty);
  const byPage = new Map<number, T>();
  let current: T = empty;
  // Walk blocks in page/column order. The VDT `doc.blocks` array is already
  // insertion-ordered by placement, so pages are in increasing index.
  let lastPageIndex = -1;
  // Track H1 page-indices so we can reassign any parity-padding pages
  // that precede them.
  const h1PageIndices: Array<{ pageIndex: number; value: T }> = [];
  for (const b of blocks) {
    if (b.pageIndex < 0) continue;
    const opensPage = b.pageIndex > lastPageIndex;
    while (lastPageIndex < b.pageIndex) {
      lastPageIndex++;
      byPage.set(lastPageIndex, current);
    }
    if (b.headingLevel === 1) {
      const value = extract(b);
      if (b.notRunningChapter) continue;
      current = value;
      // At the top, a chapter that starts lower down a page claims neither
      // that page nor the blank pages before it: they go with the chapter
      // the page opens in.
      if (atTop && !opensPage) continue;
      byPage.set(b.pageIndex, current);
      h1PageIndices.push({ pageIndex: b.pageIndex, value: current });
    }
  }
  // Fill any trailing pages (past the last block) with current value.
  for (let p = 0; p < totalPages; p++) {
    if (byPage.has(p)) {
      out[p] = byPage.get(p)!;
    } else if (p > 0) {
      out[p] = out[p - 1]!;
    }
  }
  // Reassign parity-padding pages preceding each H1 to the upcoming
  // chapter's value. The blank page was inserted solely to push the
  // chapter onto the correct parity — conceptually it belongs to the
  // chapter it precedes. `blankForForce` pages (the mandatory leading
  // separator of `always-*` modes) stop the walk: they belong to the
  // previous chapter.
  if (pages) {
    for (const { pageIndex, value } of h1PageIndices) {
      for (let p = pageIndex - 1; p >= 0; p--) {
        const info = pages[p];
        if (!info) break;
        if (info.blankForForce) break;
        if (!info.blankForParity) break;
        out[p] = value;
      }
    }
  }
  return out;
}

/** The page fields `computePartValues` reads. */
export interface PartPageInfo extends ChapterTitlePageInfo {
  partInfo?: { number: string; title: string; palette?: Record<string, string> };
}
/** Per page, the part in effect: the most recent part page on or before it
 *  (blank parity pages right before a part page already belong to it), or
 *  `start` — the part the preceding chapters left open — before any. Each
 *  part brings its own palette overrides (`{}` when the fence sets none),
 *  which also tint every blank leaf right before its divider. */
export function computePartValues(
  pages: readonly PartPageInfo[],
  start?: { number: string; title: string; palette?: Record<string, string> },
): { partTitleByPageIndex: string[]; partNumberByPageIndex: string[]; partPaletteByPageIndex: Record<string, string>[] } {
  const partTitleByPageIndex = new Array<string>(pages.length).fill('');
  const partNumberByPageIndex = new Array<string>(pages.length).fill('');
  const partPaletteByPageIndex = new Array<Record<string, string>>(pages.length).fill({});
  let title = start ? replaceTitleBreaks(start.title, ' ') : '';
  let number = start?.number ?? '';
  let palette: Record<string, string> = start?.palette ?? {};
  for (let p = 0; p < pages.length; p++) {
    const info = pages[p]!.partInfo;
    if (info) {
      title = replaceTitleBreaks(info.title, ' ');
      number = info.number;
      palette = info.palette ?? {};
      for (let q = p - 1; q >= 0; q--) {
        const prev = pages[q]!;
        if (prev.blankForForce || !prev.blankForParity) break;
        partTitleByPageIndex[q] = title;
        partNumberByPageIndex[q] = number;
      }
      // Colour reaches further back than titles: every blank leaf right
      // before the divider — an `always-odd` leaf too, which belongs to the
      // previous chapter's running heads — faces the part and wears its
      // palette (a verso tinted in the part's colour opens it as a spread).
      for (let q = p - 1; q >= 0; q--) {
        const prev = pages[q]!;
        if (!prev.blankForForce && !prev.blankForParity) break;
        partPaletteByPageIndex[q] = palette;
      }
    }
    partTitleByPageIndex[p] = title;
    partNumberByPageIndex[p] = number;
    partPaletteByPageIndex[p] = palette;
  }
  return { partTitleByPageIndex, partNumberByPageIndex, partPaletteByPageIndex };
}
