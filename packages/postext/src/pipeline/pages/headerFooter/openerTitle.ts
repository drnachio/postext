// The default opener of a page-span heading: the heading it opens, its
// title read back from the laid-out lines as text and as marked Markdown
// (chips included), and the height it paints (#1276: split out of headerFooter.ts).
import { type JoinedLine, lineJoin } from '../placeholders.js';
import { CHIP_PLACEHOLDER, extractInlineChips, injectChipSpans, parseInlineFormatting, applyTitleBreaks, withoutChips } from '../../../parse/inlineFormatting.js';
import type { InlineSpan } from '../../../parse/types.js';
import type { ResolvedChipStyleConfig, ResolvedHeadingLevelConfig, TextAlign, DocumentMetadata } from '../../../types.js';
import type { VDTBlock, VDTPage, VDTChip } from '../../../vdt.js';
import { type HeadingLevelResolver, headingIsHidden } from '../../sections/headingStyles.js';
import { layoutDesignSlot } from '../../../design/layout.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import { synthesiseDefaultOpenerSlot } from './defaultSlots.js';
import { headingPlaceholders, MEASURE_CONTAINER_HEIGHT } from './designMeasure.js';

/** Container bbox for a page-spanning heading opener band: occupies the
 *  vertical band the heading block reserved in its column, extended
 *  horizontally across the full content area (both columns) — but NOT beyond
 *  the page margins. */
export function openerContainerBbox(
  block: VDTBlock,
  contentArea: { x: number; width: number },
) {
  return { x: contentArea.x, y: block.bbox.y, width: contentArea.width, height: block.bbox.height };
}

/** Find the first heading block on `page` that belongs to a level with
 *  `span === 'page'`. Returns the block and info needed to resolve
 *  placeholders in the design slot. Triggers regardless of whether
 *  `advancedDesign.enabled` is true — when false, the pipeline synthesises
 *  a default slot from the heading level typography. */
export function findOpenerHeading(
  page: VDTPage,
  levels: HeadingLevelResolver,
): { block: VDTBlock; level: number; title: DefaultOpenerTitle; numberPrefix: string } | undefined {
  for (const col of page.columns) {
    // An opener set mid-page (`spanBreak: false`, #539) heads a later band:
    // it paints its own overlay (see `buildHeadersAndFooters`).
    if ((col.band ?? 0) > 0) continue;
    for (const block of col.blocks) {
      if (block.type !== 'heading' || !block.headingLevel) continue;
      const lvl = levels.forLevel(block.headingLevel, block.headingStyleId);
      if (!lvl) continue;
      if (lvl.span !== 'page') continue;
      // A structural heading prints nothing, not even an opener.
      if (headingIsHidden(block, lvl)) continue;
      const pref = block.numberPrefix ?? '';
      const title = defaultOpenerTitle(block.lines, pref, block.titleBreaks, block.titleLength ?? -1, block.numberSeparator);
      return { block, level: block.headingLevel, title, numberPrefix: pref };
    }
  }
  return undefined;
}

/** The title the default opener of a page-span heading prints, read from
 *  the heading's laid-out lines. */
export interface DefaultOpenerTitle {
  /** The plain title, as `{titleText}` resolves it: the lines joined back
   *  into the text they were broken from (see `lineJoin`: a space where the
   *  break took one, a no-break space where it parted a glued group,
   *  nothing after a hard hyphen or inside a divided word, whose added
   *  hyphen goes), the number prefix dropped, a forced break
   *  (`\\`) as a newline. */
  titleText: string;
  /** The same title written as inline Markdown, when the heading sets bold,
   *  italic, superscript or subscript runs (EF-122): the opener then paints
   *  the runs the heading was measured with. Left out when the heading has
   *  none, or when its runs cannot be written back exactly (a small-capitals
   *  run, a link, a marker character next to a run); the opener then prints
   *  the title plain, and its band still holds every line it paints. */
  marked?: string;
  /** Set when {@link marked} holds the heading's chips (`:chip[…]`, #1162),
   *  which a design text sets with the document's chip styles. A heading
   *  with chips has a marked title even without other runs. */
  chips?: true;
}

/** A heading line as the title readers need it: its segments, and how it
 *  was broken from the next one. */
export type TitleLine = JoinedLine & {
  segments?: readonly { text: string; bold?: boolean; italic?: boolean; script?: 'sup' | 'sub'; chip?: VDTChip }[];
};

/** `{titleText}` of a heading, from the lines it was laid out in: the
 *  plain title of {@link defaultOpenerTitle}. */
export function headingTitleText(
  lines: readonly TitleLine[],
  numberPrefix: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  numberSeparator = ' ',
): string {
  return defaultOpenerTitle(lines, numberPrefix, titleBreaks, titleLength, numberSeparator).titleText;
}

type TitleRunFlags = { bold: boolean; italic: boolean; script?: 'sup' | 'sub'; chip?: VDTChip };
const PLAIN_RUN: TitleRunFlags = { bold: false, italic: false };
/** The marker characters a backslash escapes (see `protectEscapes`). */
const TITLE_ESCAPE_RE = /[*_^~`]/g;
const escapeTitleRun = (text: string): string => text.replace(TITLE_ESCAPE_RE, (c) => `\\${c}`);
const sameEmphasis = (a: TitleRunFlags, b: TitleRunFlags): boolean => a.bold === b.bold && a.italic === b.italic;
/** The characters a chip's label escapes: the inline markers and the
 *  brackets (`\]`, see `extractInlineChips`). */
const CHIP_LABEL_ESCAPE_RE = /[*_^~`[\]]/g;
/** A chip style id that can be written back as `{style="…"}`. */
const CHIP_STYLE_ID_RE = /^[^"{}\n]*$/;

/** A laid-out chip written back as `:chip[…]{style="…"}` (#1162): its
 *  runs in logical order, each with its own bold, italic and script, so a
 *  design text that reads inline marks sets the same words. Undefined when
 *  the style id cannot be written in an attribute. */
function chipMarkdown(chip: VDTChip): string | undefined {
  if (!CHIP_STYLE_ID_RE.test(chip.styleId)) return undefined;
  let label = '';
  for (const run of chip.runs) {
    if (run.text.length === 0) continue;
    let t = run.text.replace(CHIP_LABEL_ESCAPE_RE, (c) => `\\${c}`);
    if (run.baselineShift !== undefined && run.baselineShift !== 0) t = run.baselineShift < 0 ? `^${t}^` : `~${t}~`;
    const marker = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
    // Markers go round the words, their edge spaces outside them.
    const core = t.trim();
    label += marker && core ? t.replace(core, `${marker}${core}${marker}`) : t;
  }
  if (label.trim() === '') label = ' ';
  return `:chip[${label}]${chip.styleId ? `{style="${chip.styleId}"}` : ''}`;
}

/** The characters of a heading's lines read back as the title, with the
 *  run flags of each (see {@link defaultOpenerTitle}). With `keepChips`
 *  each chip stays one {@link CHIP_PLACEHOLDER} carrying its box; else it
 *  is left out with the space beside it (#1100), recorded in `removedAt`.
 *  Undefined when a chip is to be kept and its segment carries no box. */
function readTitleChars(lines: readonly TitleLine[], keepChips: boolean): { chars: string[]; flags: TitleRunFlags[]; hasMarks: boolean; removedAt: number[] } | undefined {
  const chars: string[] = [];
  const flags: TitleRunFlags[] = [];
  /** Where a line break was read back as a space or a no-break space. */
  const separators = new Set<number>();
  let hasMarks = false;
  /** Where each chip of the title was left out (#1100), in `chars`, with
   *  the space after it when a space or the start of the line comes
   *  before it: a chip is a box of the page, not words of the title. */
  const removedAt: number[] = [];
  let afterChip = false;
  let missing = false;
  lines.forEach((ln, i) => {
    const start = chars.length;
    // The hyphen repeated from the line before (`repeatHyphen`) is not part
    // of the title: "bem-" | "-aventurados" reads "bem-aventurados".
    let skipRepeated = ln.repeatedHyphen === true;
    for (const s of ln.segments ?? []) {
      let from = 0;
      if (skipRepeated && s.text.length > 0) {
        if (s.text.startsWith('-')) from = 1;
        skipRepeated = false;
      }
      if (s.text === CHIP_PLACEHOLDER) {
        if (keepChips) {
          // The chip, one character with its box (#1162).
          if (!s.chip) missing = true;
          chars.push(CHIP_PLACEHOLDER);
          flags.push({ bold: false, italic: false, ...(s.chip ? { chip: s.chip } : {}) });
          continue;
        }
        removedAt.push(chars.length);
        afterChip = true;
        continue;
      }
      if (afterChip && s.text === ' ' && (chars.length === start || chars[chars.length - 1] === ' ')) {
        removedAt.push(chars.length);
        afterChip = false;
        continue;
      }
      afterChip = false;
      const f: TitleRunFlags = s.bold || s.italic || s.script
        ? { bold: !!s.bold, italic: !!s.italic, ...(s.script ? { script: s.script } : {}) }
        : PLAIN_RUN;
      if (f !== PLAIN_RUN) hasMarks = true;
      for (let k = from; k < s.text.length; k++) {
        chars.push(s.text[k]!);
        flags.push(f);
      }
    }
    // Read the lines back as the text they were broken from (EF-162): the
    // space a break took comes back, a word the break divided is whole
    // again (its added hyphen goes), and a hard hyphen at a line end keeps
    // its word ("Word-" | "Book" is "Word-Book"), and a group glued by a
    // no-break space that the line parted gets its no-break space back.
    // Up to postext 1.4 every line break became a space.
    const next = lines[i + 1];
    let end = chars.length;
    if (next !== undefined) while (end > start && (chars[end - 1] === ' ' || chars[end - 1] === '\t')) end--;
    const { drop, separator } = lineJoin(chars.slice(start, end).join(''), ln, next, end < chars.length);
    chars.length = end - drop;
    flags.length = end - drop;
    if (separator) {
      separators.add(chars.length);
      chars.push(separator);
      flags.push(PLAIN_RUN);
    }
  });
  if (missing) return undefined;
  // The space two lines were broken at takes the emphasis of the words on
  // both sides of it, when they share one.
  for (let i = 1; i < chars.length - 1; i++) {
    if (flags[i] === PLAIN_RUN && (chars[i] === ' ' || separators.has(i)) && sameEmphasis(flags[i - 1]!, flags[i + 1]!)) {
      const f = flags[i - 1]!;
      if (f.bold || f.italic) flags[i] = { bold: f.bold, italic: f.italic };
    }
  }
  return { chars, flags, hasMarks, removedAt };
}

/** The title written as inline Markdown from its characters and their run
 *  flags (the number prefix dropped), when it reads back as `expected`
 *  with the same runs; a chip is written as `:chip[…]` (#1162). */
function markedTitle(
  chars: readonly string[],
  flags: readonly TitleRunFlags[],
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  title: string,
  expected: string,
): string | undefined {
  let tChars = chars.slice();
  let tFlags = flags.slice();
  // The forced breaks, as `applyTitleBreaks` sets them: a newline at each
  // recorded index, the spaces and tabs around it dropped.
  if (titleBreaks && titleBreaks.length > 0 && title.length === titleLength) {
    for (const i of titleBreaks) if (i < tChars.length) tChars[i] = '\n';
    const keep = tChars.map((c, i) => {
      if (c !== ' ' && c !== '\t') return true;
      let a = i - 1;
      while (a >= 0 && (tChars[a] === ' ' || tChars[a] === '\t')) a--;
      let b = i + 1;
      while (b < tChars.length && (tChars[b] === ' ' || tChars[b] === '\t')) b++;
      return tChars[a] !== '\n' && tChars[b] !== '\n';
    });
    tFlags = tFlags.filter((_, i) => keep[i]);
    tChars = tChars.filter((_, i) => keep[i]);
  }
  if (tChars.join('') !== expected) return undefined;
  const chips = tFlags.some((f) => f.chip);
  let failed = false;
  const scripted = (a: number, b: number): string => {
    let out = '';
    let i = a;
    while (i < b) {
      const chip = tFlags[i]!.chip;
      if (chip) {
        const md = chipMarkdown(chip);
        if (md === undefined) failed = true;
        out += md ?? '';
        i++;
        continue;
      }
      const script = tFlags[i]!.script;
      let j = i + 1;
      while (j < b && tFlags[j]!.script === script && !tFlags[j]!.chip) j++;
      const text = escapeTitleRun(tChars.slice(i, j).join(''));
      out += script === 'sup' ? `^${text}^` : script === 'sub' ? `~${text}~` : text;
      i = j;
    }
    return out;
  };
  let marked = '';
  let i = 0;
  while (i < tChars.length) {
    if (tChars[i] === '\n') {
      marked += '\n';
      i++;
      continue;
    }
    // A run of one emphasis, within one line; its edge spaces stay outside
    // the markers, as Markdown needs them.
    let j = i + 1;
    while (j < tChars.length && tChars[j] !== '\n' && sameEmphasis(tFlags[j]!, tFlags[i]!)) j++;
    const { bold, italic } = tFlags[i]!;
    let a = i;
    let b = j;
    if (bold || italic) {
      while (a < b && /\s/.test(tChars[a]!)) a++;
      while (b > a && /\s/.test(tChars[b - 1]!)) b--;
    }
    if (a < b && (bold || italic)) {
      const marker = bold && italic ? '***' : bold ? '**' : '*';
      marked += scripted(i, a) + marker + scripted(a, b) + marker + scripted(b, j);
    } else {
      marked += scripted(i, j);
    }
    i = j;
  }
  if (failed) return undefined;
  // Kept only when it reads back as the same text with the same runs (a
  // chip as a chip).
  let spans: InlineSpan[];
  if (chips) {
    const { cleaned, chips: metas } = extractInlineChips(marked, 0);
    spans = injectChipSpans(parseInlineFormatting(cleaned), metas);
  } else spans = parseInlineFormatting(marked);
  if (spans.map((s) => s.text).join('') !== expected) return undefined;
  let at = 0;
  for (const s of spans) {
    if (s.smallCaps || s.links || s.math) return undefined;
    for (let k = 0; k < s.text.length; k++, at++) {
      const f = tFlags[at]!;
      if ((s.chip !== undefined) !== (f.chip !== undefined)) return undefined;
      if (s.chip || /\s/.test(s.text[k]!)) continue;
      if (f.bold !== !!s.bold || f.italic !== !!s.italic || f.script !== s.script) return undefined;
    }
  }
  return marked;
}

/** The title a page-span heading's default opener prints, from the lines the
 *  heading was measured into (see {@link DefaultOpenerTitle}). The same
 *  reading serves the band's measure (`build.ts`) and its paint, so the
 *  two lay out one text. */
export function defaultOpenerTitle(
  lines: readonly TitleLine[],
  numberPrefix: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  /** What joins the number to the title in the lines
   *  (`HeadingLevelConfig.numberSeparator`). */
  numberSeparator = ' ',
): DefaultOpenerTitle {
  const { chars, flags, hasMarks, removedAt } = readTitleChars(lines, false)!;
  const keptBreaks = titleBreaks;
  const keptLength = titleLength;
  const full = chars.join('');
  const drop = numberPrefix && full.startsWith(`${numberPrefix}${numberSeparator}`) ? numberPrefix.length + numberSeparator.length : 0;
  if (removedAt.length > 0) {
    // The forced breaks and the length of the title without what was left
    // out; a space a closing chip stood after goes too.
    titleBreaks = titleBreaks?.map((i) => i - removedAt.filter((c, k) => c - drop + k < i).length);
    titleLength -= removedAt.length;
    while (chars.length > drop && chars[chars.length - 1] === ' ') {
      chars.pop();
      flags.pop();
      titleLength--;
    }
    // A chip alone on the first line leaves the space its line was
    // broken at (#1162).
    while (chars.length > drop && chars[drop] === ' ') {
      chars.splice(drop, 1);
      flags.splice(drop, 1);
      titleLength--;
      titleBreaks = titleBreaks?.map((i) => Math.max(0, i - 1));
    }
  }
  const title = chars.join('').slice(drop);
  const titleText = applyTitleBreaks(title, titleBreaks, titleLength);
  // The heading's chips (#1162): the title with them, written as Markdown
  // a design text that reads inline marks sets them from. The plain title
  // leaves them out.
  if (removedAt.length > 0) {
    const marked = markedTitleWithChips(lines, numberPrefix, numberSeparator, keptBreaks, keptLength, titleText);
    if (marked !== undefined) return { titleText, marked, chips: true };
  }
  if (!hasMarks) return { titleText };
  const marked = markedTitle(chars.slice(drop), flags.slice(drop), titleBreaks, titleLength, title, titleText);
  return marked === undefined ? { titleText } : { titleText, marked };
}

/** {@link DefaultOpenerTitle.marked} of a heading with chips (#1162): its
 *  lines read back with each chip kept, the title written with them, when
 *  it reads as `titleText` once its chips are left out again. */
function markedTitleWithChips(
  lines: readonly TitleLine[],
  numberPrefix: string,
  numberSeparator: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  titleText: string,
): string | undefined {
  const kept = readTitleChars(lines, true);
  if (!kept) return undefined;
  const full = kept.chars.join('');
  const drop = numberPrefix && full.startsWith(`${numberPrefix}${numberSeparator}`) ? numberPrefix.length + numberSeparator.length : 0;
  const title = full.slice(drop);
  const withChips = applyTitleBreaks(title, titleBreaks, titleLength);
  if (withoutChips(withChips) !== titleText) return undefined;
  // Text written as `:chip[…]` in a code span would read as a chip.
  if (titleText.includes(':chip[')) return undefined;
  return markedTitle(kept.chars.slice(drop), kept.flags.slice(drop), titleBreaks, titleLength, title, withChips);
}

/** The marked title of a heading placeholder (`titleMarked`), with the
 *  document's chip styles when it holds the heading's chips (#1162). A
 *  title with chips and no styles to set them in is left plain. */
export function markedTitleFields(
  title: DefaultOpenerTitle,
  chipStyles: readonly ResolvedChipStyleConfig[] | undefined,
): Pick<HeadingPlaceholderInfo, 'titleMarked' | 'chipStyles'> {
  if (title.marked === undefined) return {};
  if (!title.chips) return { titleMarked: title.marked };
  return chipStyles ? { titleMarked: title.marked, chipStyles } : {};
}

/** The height of the title a page-span heading's default opener paints
 *  across `width`, with the opener's own painter (a greedy wrap at natural
 *  widths, a justified heading set flush left). The band reserved for the
 *  heading is at least this tall, so it holds every line the opener paints
 *  even where the heading's own measure fits more on a line: a justified
 *  line whose spaces shrink, a forced break, a run the opener sets plain
 *  (EF-100). */
export function measureDefaultOpenerHeight(
  level: ResolvedHeadingLevelConfig,
  textAlign: TextAlign,
  title: DefaultOpenerTitle,
  numberPrefix: string,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  /** The document's chip styles, for a title with chips (#1162). */
  chipStyles?: readonly ResolvedChipStyleConfig[],
): number {
  const slot = synthesiseDefaultOpenerSlot(level, numberPrefix.length > 0, textAlign, title.marked !== undefined);
  const placeholders = headingPlaceholders(
    { titleText: title.titleText, ...markedTitleFields(title, chipStyles), formattedNumber: numberPrefix },
    metadata,
    pageIndex,
  );
  const result = layoutDesignSlot(slot, { container: { x: 0, y: 0, width, height: MEASURE_CONTAINER_HEIGHT }, dpi, placeholders }, pageIndex);
  let bottom = 0;
  for (const prim of result.primitives) {
    if (prim.kind !== 'text') continue;
    for (const ln of prim.lines) bottom = Math.max(bottom, ln.topY + ln.height);
  }
  return bottom;
}
