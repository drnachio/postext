// The design slots synthesised when none is set: the default opener of a
// page-span heading, of a :::part page and of a part row in the contents
// (#1276: split out of headerFooter.ts).
import type { ResolvedHeadingLevelConfig, TextAlign, ResolvedDesignSlot, ResolvedDesignTextElement } from '../../../types.js';
import type { ResolvedConfig, VDTPage } from '../../../vdt.js';
import { resolveDesignLineHeight } from '../../../defaults/structure/headerFooter.js';

/** Build a synthesised default design slot for a `span: 'page'` heading when
 *  the user has not configured an `advancedDesign.slot`. Renders as a single
 *  text element, anchored to fill the full-page-width container, using the
 *  heading level's resolved typography and `headings.textAlign` (justified
 *  sets flush left, like the last line of a justified heading). Emits
 *  `{number} {titleText}` (the level's `numberSeparator` between them) when
 *  the heading carries a numberPrefix, otherwise `{titleText}`. With `marked`, `{titleText}` holds the title as inline
 *  Markdown (see {@link DefaultOpenerTitle}) and the element reads it so. */
export function synthesiseDefaultOpenerSlot(
  level: ResolvedHeadingLevelConfig,
  hasNumberPrefix: boolean,
  textAlign: TextAlign,
  marked = false,
): ResolvedDesignSlot {
  // `{number}` is the heading placeholder for the formatted number;
  // `{formattedNumber}` is not one, and left the title with a leading space.
  // The level's separator joins them, as in the column (`'　'` in Chinese).
  const content = hasNumberPrefix ? `{number}${level.numberSeparator ?? ' '}{titleText}` : '{titleText}';
  const textEl: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'defaultHeadingOpener',
    parity: 'all',
    pages: 'all',
    placement: {
      anchor: { to: 'container', edge: 'top-left' },
      offset: { x: { value: 0, unit: 'pt' }, y: { value: 0, unit: 'pt' } },
      size: { width: 'fill', height: 'fill' },
    },
    content,
    fontFamily: level.fontFamily,
    fontSize: level.fontSize,
    fontWeight: level.fontWeight,
    italic: level.italic,
    color: level.color,
    align: textAlign === 'center' || textAlign === 'right' ? textAlign : 'left',
    verticalAlign: 'middle',
    // The level's own leading, as the band that holds the title was
    // measured with it (EF-100).
    ...resolveDesignLineHeight(level.lineHeight, level.fontSize),
    overflow: 'wrap',
    hyphenate: true,
    // The level's tracking, as its in-column text is measured (EF-83).
    ...(level.letterSpacing && level.letterSpacing.value !== 0 ? { letterSpacing: level.letterSpacing } : {}),
    // The heading's bold, italic and script runs (EF-122).
    ...(marked ? { inlineMarks: true } : {}),
  };
  return { elements: [textEl] };
}

/** The level-1 heading settings, which the default part designs borrow. */
function levelOne(resolved: ResolvedConfig): ResolvedHeadingLevelConfig {
  return resolved.headings.levels.find((l) => l.level === 1) ?? resolved.headings.levels[0]!;
}

/** `{number}` and `{titleText}` joined as the book's chapter openers join
 *  them: with the H1's `numberSeparator` (`'　'` in Chinese, one space by
 *  default). */
function partNumberAndTitle(resolved: ResolvedConfig): string {
  return `{number}${levelOne(resolved).numberSeparator ?? ' '}{titleText}`;
}

/** Default opener design of a `:::part` page when `parts.design` is empty:
 *  `{number} {titleText}` (the H1's `numberSeparator` between them; just
 *  `{titleText}` without a number) in the H1 typography, anchored at the
 *  top-left of the part's body area — the container is the trim box, so
 *  the offset is the part margins. Purely decorative: raise
 *  `parts.margins.top` to keep the body clear of it. */
export function synthesiseDefaultPartSlot(
  resolved: ResolvedConfig,
  page: VDTPage,
  trimBox: { x: number; y: number },
  hasNumber: boolean,
): ResolvedDesignSlot {
  const level = levelOne(resolved);
  const content = hasNumber ? partNumberAndTitle(resolved) : '{titleText}';
  const textEl: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'defaultPartOpener',
    parity: 'all',
    pages: 'all',
    placement: {
      anchor: { to: 'container', edge: 'top-left' },
      offset: {
        x: { value: page.contentArea.x - trimBox.x, unit: 'px' },
        y: { value: page.contentArea.y - trimBox.y, unit: 'px' },
      },
      size: { width: { value: page.contentArea.width, unit: 'px' }, height: 'auto' },
    },
    content,
    fontFamily: level.fontFamily,
    fontSize: level.fontSize,
    fontWeight: level.fontWeight,
    italic: level.italic,
    color: level.color,
    align: 'left',
    verticalAlign: 'top',
    lineHeight: level.lineHeight.unit === 'em' ? level.lineHeight.value : 1.2,
    overflow: 'wrap',
    hyphenate: true,
  };
  return { elements: [textEl] };
}

/** Default row design of a part in the contents when `toc.parts.design` is
 *  empty: `{number} {titleText}` (the H1's `numberSeparator` between them;
 *  just `{titleText}` without a number) at the left and `{pageNumber}` at
 *  the right, in the level-1 entry typography. */
export function synthesiseDefaultTocPartSlot(resolved: ResolvedConfig, hasNumber: boolean): ResolvedDesignSlot {
  const entry = resolved.toc.levels[0]!;
  const common = {
    kind: 'text' as const, parity: 'all' as const, pages: 'all' as const,
    fontFamily: entry.fontFamily, fontSize: entry.fontSize, fontWeight: entry.fontWeight, italic: entry.italic,
    color: entry.color, verticalAlign: 'middle' as const, lineHeight: 1.2, hyphenate: false,
  };
  const title: ResolvedDesignTextElement = {
    ...common, id: 'tocPartTitle', content: hasNumber ? partNumberAndTitle(resolved) : '{titleText}', align: 'left', overflow: 'ellipsis-end',
    placement: { anchor: { to: 'container', edge: 'left' }, offset: {}, size: { width: 'auto', height: 'auto' } },
  };
  const page: ResolvedDesignTextElement = {
    ...common, id: 'tocPartPage', content: '{pageNumber}', align: 'right', overflow: 'clip',
    fontWeight: resolved.toc.pageNumber.fontWeight, color: resolved.toc.pageNumber.color,
    placement: { anchor: { to: 'container', edge: 'right' }, offset: {}, size: { width: 'auto', height: 'auto' } },
  };
  return { elements: [title, page] };
}
