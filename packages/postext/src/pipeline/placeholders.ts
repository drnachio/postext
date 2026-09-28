import { charBefore, charFrom, flattenTitleBreaks, joinsWide, TITLE_BREAK_RE } from '../parse/inlineFormatting';
import { collapseBreakingSpaces, collapseTitleSpaces } from '../measure/spaces';
import type { InlineSpan } from '../parse';
import type { DocumentMetadata } from '../types';
import { metadataText } from '../frontmatter';
import type { VDTBlock, VDTPage } from '../vdt';

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

export interface PlaceholderContext {
  page: VDTPage;
  allPages: VDTPage[];
  metadata: DocumentMetadata;
  /** Chapter title per page index (most recent H1 at or before each page). */
  chapterTitleByPageIndex: string[];
  /** The chapter in force at the top of each page (see
   *  `computeChapterTitlesAtTop`, `computeChapterNumbersAtTop`). Back
   *  `{chapterTitleAtTop}` / `{chapterNumberAtTop}`; a missing entry
   *  resolves to `''`. */
  chapterTitleAtTopByPageIndex?: string[];
  chapterNumberAtTopByPageIndex?: string[];
  /** Heading attributes of the current chapter's H1 per page index (see
   *  `computeChapterAttrs`). Backs `{attr.<key>}` in header/footer slots. A
   *  missing entry or key resolves to `''`. */
  chapterAttrsByPageIndex?: Record<string, string>[];
  /** Current part title / number per page index (see `computePartValues`).
   *  Back `{partTitle}` / `{partNumber}`; a missing entry resolves to `''`. */
  partTitleByPageIndex?: string[];
  partNumberByPageIndex?: string[];
  partPaletteByPageIndex?: Record<string, string>[];
  /** Current chapter number per page index (see `computeChapterNumbers`).
   *  Backs `{chapterNumber}` in header/footer slots. */
  chapterNumberByPageIndex?: string[];
  /** Physical pages of the whole book (`{bookTotalPages}`); defaults to
   *  `allPages.length`, the document being the whole book. */
  bookTotalPages?: number;
  /** The first and last marks of every page for a mark key (see
   *  `computePageMarks`); backs `{firstMark.<key>}` / `{lastMark.<key>}`.
   *  Called lazily, once per key a template names. Absent → `''`. */
  marksFor?: (key: string) => PageMarks | undefined;
}

export interface PlaceholderResult {
  text: string;
  unknownPlaceholders: string[];
  missingMetadata: string[];
}

/** Optional behaviour of the placeholder resolvers. */
export interface PlaceholderResolveOptions {
  /** Applied to every `{attr.<key>}` value before it is inserted (design
   *  text turns the `\n` escape of an attribute value into a newline). */
  attrValue?: (value: string) => string;
}

const PLACEHOLDER_NAMES = new Set([
  'pageNumber',
  'totalPages',
  'bookTotalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
  'chapterNumber',
  'chapterTitleAtTop',
  'chapterNumberAtTop',
  'partTitle',
  'partNumber',
]);

const METADATA_PLACEHOLDERS = new Set(['title', 'subtitle', 'author', 'publishDate']);

/** Placeholder grammar: `name` or `name.key` — the dotted form is reserved
 *  for namespaced lookups such as `{attr.author}` (heading attributes). */
export const PLACEHOLDER_NAME_RE = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)?$/;

/** Namespace of the heading-attribute placeholders (`{attr.<key>}`). */
export const ATTR_PLACEHOLDER_PREFIX = 'attr.';

/** When `name` is an `attr.<key>` placeholder, returns `<key>`. */
export function attrPlaceholderKey(name: string): string | undefined {
  if (!name.startsWith(ATTR_PLACEHOLDER_PREFIX)) return undefined;
  const key = name.slice(ATTR_PLACEHOLDER_PREFIX.length);
  return key.length > 0 ? key : undefined;
}

/** When `name` is a running-mark placeholder — `firstMark.<key>` or
 *  `lastMark.<key>`, the first or last mark on the page — returns which one
 *  and the key: `h1`…`h6` for a heading level, else a paragraph style id. */
export function markPlaceholder(name: string): { which: 'first' | 'last'; key: string } | undefined {
  const dot = name.indexOf('.');
  if (dot < 0) return undefined;
  const head = name.slice(0, dot);
  const key = name.slice(dot + 1);
  if (key.length === 0) return undefined;
  if (head === 'firstMark') return { which: 'first', key };
  if (head === 'lastMark') return { which: 'last', key };
  return undefined;
}

/** The marks of one key laid out on each page: `first[p]` is the first mark
 *  that starts on page `p` and `last[p]` the last; a page on which none
 *  starts takes the mark in effect (the last one before it) for both, and
 *  pages before the first mark get `''`. */
export interface PageMarks {
  first: string[];
  last: string[];
}

/** What sets a mark: a heading of `level`, or a paragraph of a
 *  `:::paragraphs{style=…}` container whose style is `styleId`. */
export type MarkSource = { level: number } | { styleId: string };

/** The source a mark key names: `h1`…`h6` a heading level, anything else a
 *  paragraph style id. */
export function markSourceOf(key: string): MarkSource {
  const m = /^h([1-6])$/i.exec(key);
  return m ? { level: Number(m[1]) } : { styleId: key };
}

/** The bold run a paragraph opens with — a dictionary headword, a glossary
 *  term — as a running mark: the leading bold spans joined, trimmed, minus
 *  closing punctuation (`**Aback.**` → `Aback`). `''` when the paragraph
 *  does not open with bold text. */
export function leadingBoldText(spans: readonly InlineSpan[]): string {
  let text = '';
  for (const span of spans) {
    if (span.math || span.swatch || span.chip) break;
    if (!span.bold) {
      if (text.length === 0 && span.text.trim().length === 0) continue;
      break;
    }
    text += span.text;
  }
  return collapseBreakingSpaces(text).trim().replace(/[\s.,:;]+$/, '');
}

/**
 * Per page, the first and last mark of one source (see {@link PageMarks}),
 * walking the blocks in placement order. A heading's mark is its text
 * without the number; a paragraph's is its leading bold run (a headword),
 * given by `paragraphMark` from the content block — a paragraph that does
 * not open with bold text sets none. A block split across columns or pages
 * sets its mark once, where it starts.
 */
export function computePageMarks(
  blocks: readonly VDTBlock[],
  totalPages: number,
  source: MarkSource,
  paragraphMark?: (contentIndex: number) => { styleId: string; text: string } | undefined,
): PageMarks {
  const onPage: string[][] = Array.from({ length: totalPages }, () => []);
  const seen = new Set<number>();
  for (const b of blocks) {
    if (b.pageIndex < 0 || b.pageIndex >= totalPages) continue;
    let text: string | undefined;
    if ('level' in source) {
      // A plate (`runningChapter: false`) sets no guide word.
      if (b.type === 'heading' && b.headingLevel === source.level && !b.notRunningChapter) text = plainTextOfBlock(b);
    } else if (b.type === 'paragraph' && b.contentIndex !== undefined && paragraphMark) {
      const mark = paragraphMark(b.contentIndex);
      if (mark && mark.styleId === source.styleId) text = mark.text;
    }
    if (text === undefined || text.length === 0) continue;
    if (b.contentIndex !== undefined) {
      if (seen.has(b.contentIndex)) continue;
      seen.add(b.contentIndex);
    }
    onPage[b.pageIndex]!.push(text);
  }
  const first = new Array<string>(totalPages).fill('');
  const last = new Array<string>(totalPages).fill('');
  let current = '';
  for (let p = 0; p < totalPages; p++) {
    const marks = onPage[p]!;
    first[p] = marks[0] ?? current;
    if (marks.length > 0) current = marks[marks.length - 1]!;
    last[p] = current;
  }
  return { first, last };
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
): string[] {
  return computeChapterValues(blocks, totalPages, pages, chapterNumberCounter(ordinalOffset, numberless), '');
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
): Map<VDTBlock, string> {
  const next = chapterNumberCounter(ordinalOffset, numberless);
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
 *  the content blocks), so both read the same value. */
export function chapterNumberCounter<B extends ChapterNumberSource>(
  ordinalOffset = 0,
  numberless?: (block: B) => boolean,
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
    return prefix.length > 0 ? prefix : numberless?.(b) ? '' : String(ordinal);
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
): string[] {
  return computeChapterValues(blocks, totalPages, pages, chapterNumberCounter(ordinalOffset, numberless), '', true);
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
  let title = start?.title.replace(TITLE_BREAK_RE, ' ') ?? '';
  let number = start?.number ?? '';
  let palette: Record<string, string> = start?.palette ?? {};
  for (let p = 0; p < pages.length; p++) {
    const info = pages[p]!.partInfo;
    if (info) {
      title = info.title.replace(TITLE_BREAK_RE, ' ');
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

/** The fields of a laid-out line that say how it joins the next one. */
export interface JoinedLine {
  hyphenated?: boolean;
  hardHyphen?: boolean;
  plainStart?: number;
  plainEnd?: number;
  /** The line opens with the hyphen repeated from the line before
   *  (`bodyText.repeatHyphen`), which is not part of the text. */
  repeatedHyphen?: boolean;
}

/** How a wrapped line joins the line after it when a block's lines are
 *  read back as one text (a running head's `{chapterTitle}`, a design's
 *  `{titleText}`). Returns how many characters to drop from the end of
 *  the line (the hyphen a break added) and what goes between the two
 *  lines.
 *
 *  A hyphenated line continues its word: the break's own hyphen (a
 *  dictionary syllable, an author's soft hyphen, a word cut for being
 *  wider than the line) is dropped, and the hyphen of a line broken after
 *  the text's own (`hardHyphen`, "well-" | "known") stays. A line that
 *  ends where the next one starts in the block's plain text (`plainEnd` =
 *  `plainStart`) broke inside a run without adding anything (after a hard
 *  hyphen or a dash, or in a word cut for width, when the first-fit
 *  breaker of a heading without formatting set it) and joins with nothing.
 *  A hyphenated line that ends without a hyphen, where the next line
 *  starts one character further on in the plain text, parted a group
 *  glued by a no-break space that was wider than the line ("Cap\u00edtulo" |
 *  "XVIII"): the break took the no-break space, which comes back as
 *  U+00A0, so the group stays glued. Every other break took a space,
 *  which comes back once, and so does a space the line itself ends with
 *  (`spaceAtEnd`: the caller trimmed it from `text`); the last line is
 *  followed by nothing. */
export function lineJoin(
  text: string,
  line: JoinedLine,
  next: JoinedLine | undefined,
  spaceAtEnd = false,
): { drop: number; separator: '' | ' ' | '\u00A0' } {
  if (line.hardHyphen) return { drop: 0, separator: '' };
  if (line.hyphenated) {
    if (/[-\u2010\u2011]$/.test(text)) return { drop: 1, separator: '' };
    const tookOne = next?.plainStart !== undefined && line.plainEnd !== undefined && next.plainStart > line.plainEnd;
    return { drop: 0, separator: tookOne ? '\u00A0' : '' };
  }
  if (next === undefined) return { drop: 0, separator: '' };
  if (!spaceAtEnd && line.plainEnd !== undefined && next.plainStart === line.plainEnd) return { drop: 0, separator: '' };
  return { drop: 0, separator: ' ' };
}

/** Breaking whitespace at either end of a line: a no-break space a line
 *  opens or ends on belongs to the text (the glue of a group the line
 *  parted), so it stays. */
const BREAKING_EDGES_RE = /^[^\S\u00A0\u2007\u202F\uFEFF]+|[^\S\u00A0\u2007\u202F\uFEFF]+$/g;

/** A block's lines read back as the text they were broken from, the way
 *  the paragraph read before wrapping (see {@link lineJoin}): wrapped lines
 *  keep their trailing space token and hyphenated lines end with the break
 *  mark. A line of Chinese broken between two characters joins the next
 *  with nothing, and one broken at an ideographic space (U+3000, the space
 *  of a couplet title or of `numberSeparator: '　'`) gets it back, whichever
 *  of the two lines holds it. Whitespace inside the lines is kept as it is;
 *  the ends are trimmed. `\u2028` is the title-break placeholder. The
 *  running heads read a heading this way, and so do the PDF bookmarks and
 *  document title. */
export function blockLinesText(block: VDTBlock): string {
  const lines = block.lines.map((line) => {
    // The hyphen repeated from the line before (`repeatHyphen`) is not text.
    const own = line.repeatedHyphen && line.text.startsWith('-') ? line.text.slice(1) : line.text;
    const raw = flattenTitleBreaks(own);
    return { raw, t: raw.replace(BREAKING_EDGES_RE, '') };
  });
  let text = '';
  block.lines.forEach((line, i) => {
    const { raw, t } = lines[i]!;
    if (t.length === 0) return;
    const next = block.lines[i + 1];
    const { drop, separator } = lineJoin(t, line, next, /[ \t]$/.test(raw));
    let sep: string = separator;
    if (next !== undefined && !line.hyphenated && !line.hardHyphen) {
      const after = lines[i + 1]!;
      const broken = BREAKING_TAIL_RE.exec(raw)![0] + BREAKING_HEAD_RE.exec(after.raw)![0];
      if (broken.includes('\u3000')) sep = '\u3000';
      // Two Chinese characters with no space between them on either line
      // were never apart, whatever the offsets say.
      else if (broken.length === 0 && joinsWide(charBefore(t, t.length), charFrom(after.t, 0))) sep = '';
    }
    text += t.slice(0, t.length - drop) + (next === undefined ? '' : sep);
  });
  return text.trim();
}

/** The breaking whitespace a line ends / starts with. */
const BREAKING_TAIL_RE = /[^\S\u00A0\u2007\u202F\uFEFF]*$/;
const BREAKING_HEAD_RE = /^[^\S\u00A0\u2007\u202F\uFEFF]*/;

function plainTextOfBlock(block: VDTBlock): string {
  // No-break spaces stay, so the running head never breaks at one, and so
  // does the ideographic space of a Chinese title.
  const text = collapseTitleSpaces(blockLinesText(block)).trim();
  // Strip any numbering prefix that was prepended during build.
  if (block.numberPrefix && text.startsWith(block.numberPrefix)) {
    return text.slice(block.numberPrefix.length).trimStart();
  }
  return text;
}

/**
 * Resolve placeholder templates. Grammar:
 *   - `{name}` with name matching `[a-zA-Z][a-zA-Z0-9]*` is a placeholder;
 *   - `{name.key}` is a namespaced placeholder — `{attr.<key>}` reads the
 *     current chapter's heading attributes (missing → `''`, no warning),
 *     `{firstMark.<key>}` / `{lastMark.<key>}` the page's running marks;
 *   - `{{` and `}}` are literal braces.
 */
export function resolvePlaceholders(
  template: string,
  ctx: PlaceholderContext,
  options?: PlaceholderResolveOptions,
): PlaceholderResult {
  const unknown: string[] = [];
  const missing: string[] = [];
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') {
      out += '{';
      i += 2;
      continue;
    }
    if (ch === '}' && template[i + 1] === '}') {
      out += '}';
      i += 2;
      continue;
    }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) {
        // Unterminated — treat as literal
        out += ch;
        i++;
        continue;
      }
      const name = template.slice(i + 1, end);
      if (!PLACEHOLDER_NAME_RE.test(name)) {
        out += template.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      const attrKey = attrPlaceholderKey(name);
      if (attrKey !== undefined) {
        const value = ctx.chapterAttrsByPageIndex?.[ctx.page.index]?.[attrKey] ?? '';
        out += options?.attrValue ? options.attrValue(value) : value;
        i = end + 1;
        continue;
      }
      const mark = markPlaceholder(name);
      if (mark) {
        const marks = ctx.marksFor?.(mark.key);
        out += (mark.which === 'first' ? marks?.first : marks?.last)?.[ctx.page.index] ?? '';
        i = end + 1;
        continue;
      }
      if (!PLACEHOLDER_NAMES.has(name)) {
        unknown.push(name);
        i = end + 1;
        continue;
      }
      const value = resolveName(name, ctx);
      if (METADATA_PLACEHOLDERS.has(name) && value === '') {
        missing.push(name);
      }
      out += value;
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, unknownPlaceholders: unknown, missingMetadata: missing };
}

function resolveName(name: string, ctx: PlaceholderContext): string {
  switch (name) {
    case 'pageNumber':
      return ctx.page.pageLabel;
    case 'totalPages':
      return String(ctx.allPages.length);
    case 'bookTotalPages':
      return String(ctx.bookTotalPages ?? ctx.allPages.length);
    case 'title':
      return metadataText(ctx.metadata.title) ?? '';
    case 'subtitle':
      return metadataText(ctx.metadata.subtitle) ?? '';
    case 'author':
      return metadataText(ctx.metadata.author) ?? '';
    case 'publishDate':
      return metadataText(ctx.metadata.publishDate) ?? '';
    case 'chapterTitle':
      return ctx.chapterTitleByPageIndex[ctx.page.index] ?? '';
    case 'partTitle':
      return ctx.partTitleByPageIndex?.[ctx.page.index] ?? '';
    case 'partNumber':
      return ctx.partNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterNumber':
      return ctx.chapterNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterTitleAtTop':
      return ctx.chapterTitleAtTopByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterNumberAtTop':
      return ctx.chapterNumberAtTopByPageIndex?.[ctx.page.index] ?? '';
    default:
      return '';
  }
}

/**
 * Scan a template for the set of placeholder names it references (unique,
 * including unknown ones). Useful for warnings.
 */
export function collectPlaceholderNames(template: string): string[] {
  const names = new Set<string>();
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') { i += 2; continue; }
    if (ch === '}' && template[i + 1] === '}') { i += 2; continue; }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) break;
      const name = template.slice(i + 1, end);
      if (PLACEHOLDER_NAME_RE.test(name)) names.add(name);
      i = end + 1;
      continue;
    }
    i++;
  }
  return [...names];
}

export function isKnownPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name) || attrPlaceholderKey(name) !== undefined || markPlaceholder(name) !== undefined;
}

export function isMetadataPlaceholder(name: string): boolean {
  return METADATA_PLACEHOLDERS.has(name);
}
