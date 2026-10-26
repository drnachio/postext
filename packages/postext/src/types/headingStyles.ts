import type { ResolvedDesignSlot } from './designElements.js';
import type { HeaderFooterSlot } from './headerFooter.js';
import type { HeadingBreakBeforeConfig, HeadingLevelConfig, ResolvedHeadingLevelConfig } from './headings.js';
import type { LayoutConfig, ResolvedLayoutConfig } from './layout.js';
import type { PageMargins } from './page.js';
import type { PartsBodyStyleConfig, ResolvedPartsBodyStyleConfig } from './parts.js';

// ---------------------------------------------------------------------------
// Heading styles — `# Title {style="…"}`. A style overrides the heading's
// level typography and design and, for the section it opens (its pages up
// to the next heading of the same or a higher level), the running heads,
// the page geometry, the body typography and the palette.
// ---------------------------------------------------------------------------

/** Typography of the body blocks in a section opened by a styled heading.
 *  Same shape as a part's body style. */
export type SectionBodyStyleConfig = PartsBodyStyleConfig;
export type ResolvedSectionBodyStyleConfig = ResolvedPartsBodyStyleConfig;

/** See {@link HeadingStyleConfig.sectionEnd}. */
export type HeadingStyleSectionEnd = 'level' | 'heading';

export interface HeadingStyleConfig extends Omit<HeadingLevelConfig, 'level' | 'numberingTemplate'> {
  /** Identifier referenced from `{style="…"}` on a heading line. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Template the style's headings are numbered with, in place of their
   *  level's `numberingTemplate` (same tokens): `'Appendix {1:A}'` letters
   *  appendices that share the chapter counter — restart it with a
   *  `{startAt=1}` attribute on the first one. `''` prints no number while
   *  the heading still counts. Unset = the level's template. */
  numberingTemplate?: string;
  /** Whether the heading counts: advances the level's counter and the
   *  chapter ordinal (`{chapterNumber}`), and is numbered in the contents.
   *  `false` for a preface, an authors list, an index. Default `true`. */
  numbered?: boolean;
  /** Whether the heading is listed by `:::toc`. Default `true`; a heading
   *  may override it with `{toc="false"}` / `{toc="true"}`. */
  toc?: boolean;
  /** Whether the style's level-1 headings become the running chapter: the
   *  chapter that `{chapterTitle}`, `{chapterNumber}`, `{attr.<key>}`, the
   *  `…AtTop` variants and the `h1` guide words name on the heading's page
   *  and the pages after it. `false` for a plate, a map or a cover set as a
   *  level-1 heading inside a chapter: the running heads keep naming the
   *  chapter it interrupts. The heading still counts when `numbered` (its
   *  own design reads its own number) and is still listed by `:::toc` when
   *  `toc`. The style still opens a section of its own until the next
   *  level-1 heading (its running-head slots, margins, columns, body style
   *  and palette, or the document's where it sets none), as every heading
   *  style does. No effect on headings of other levels. Default `true`. */
  runningChapter?: boolean;
  /** Where the section the style opens ends (#1014): `'level'` at the
   *  next heading of the same or a higher level, `'heading'` at the next
   *  heading of any level. A cover or a title page set as the book's only
   *  level-1 heading, with its chapters at level 2, takes `'heading'`: its
   *  empty running heads, margins and palette stop at the first chapter
   *  instead of running over the whole book. The heading's own design,
   *  numbering and running chapter are not affected. Default `'level'`. */
  sectionEnd?: HeadingStyleSectionEnd;
  /** Running heads of the section's pages, replacing the document's
   *  `header` / `footer` there (element `pages` / `parity` filters still
   *  apply). Unset = the document's own. */
  header?: HeaderFooterSlot;
  footer?: HeaderFooterSlot;
  /** Body area of the section's pages. Each side inherits the page margin
   *  when unset. Takes effect on the pages the section opens, so pair it
   *  with `breakBefore`. */
  margins?: PageMargins;
  /** Column layout of the section's pages (a single wide column for a
   *  preface set in a two-column book). Set, it replaces the document's
   *  `layout`: each field it leaves out takes the static default, except
   *  `columnRule`, whose unset fields (`enabled`, `color`, `lineWidth`)
   *  come from the document's `layout.columnRule` (since postext 1.5).
   *  Only its page geometry is read from it (`layoutType`, `gutterWidth`,
   *  the side column, `columnRule`), plus its `fitFiguresToPage` when a
   *  figure could move from an empty column cut short to a whole one;
   *  `inlineResourceGap`, `inlineResourceGapInBoxes`, `flowColumns`,
   *  `boxChildSplitMinLines`, `hugClosingFloats` and `floatsUnderOpener`
   *  stay the document's,
   *  and so does the `fitFiguresToPage` that shrinks figures.
   *  Unset, the section uses the document's `layout`. */
  layout?: LayoutConfig;
  /** Typography of the body blocks in the section. */
  bodyStyle?: SectionBodyStyleConfig;
  /** Palette overrides (palette id → hex) for the section's pages, applied
   *  like a part's `palette` attribute and on top of it. Not only the design
   *  slots of those pages (running heads, the opener: every colour linked
   *  to an overridden id) follow them, but the text flow too, as under a
   *  part: every flow colour equal to the base value of an overridden entry
   *  — headings, bold, italic and reference colours, bullets and list
   *  numbers, captions and caption bars, table text, rules and fills
   *  (header, body, zebra rows, a cell's own fill), callout boxes
   *  (background, border, stripe, title) and chips (fill, outline, text) —
   *  takes the section's value. Inline swatches keep theirs. The page
   *  colour too: when `page.backgroundColor` links to an overridden entry
   *  (or, unlinked, has its base value), the section's pages paint the
   *  section's value (`VDTPage.background`, since postext 1.18). Where two
   *  entries share a base value and the section gives them different
   *  values, each flow colour takes the value its own settings link to: a
   *  block's text, bold, italic, reference, marker and separator colours
   *  apart, each heading level and heading style, each part of each
   *  callout frame, each colour of each table, chip and caption style.
   *  Settings in different places that set the same colour of a block
   *  (`bodyText.color` and a callout style's `body.color`) are still told
   *  apart by value only; see the configuration docs. */
  palette?: Record<string, string>;
}

/** The level fields a heading style may override, resolved. `breakBefore`
 *  here is the style's break resolved on its own (unset fields as for a
 *  level without a break), kept for compatibility: headings merge
 *  {@link ResolvedHeadingStyleConfig.breakBefore} over their level's break
 *  instead. */
export type ResolvedHeadingStyleOverrides = Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>>;

export interface ResolvedHeadingStyleConfig {
  id: string;
  name: string;
  numbered: boolean;
  toc: boolean;
  /** See {@link HeadingStyleConfig.runningChapter}. */
  runningChapter: boolean;
  /** See {@link HeadingStyleConfig.sectionEnd}. */
  sectionEnd: HeadingStyleSectionEnd;
  /** Level fields the style sets; merged over the heading's level config. */
  overrides: ResolvedHeadingStyleOverrides;
  /** The `breakBefore` fields the style sets, as written: merged field by
   *  field over the break of the heading's level, so a style that only
   *  sets `parity` keeps the level's `enabled`. Unset = the level's. */
  breakBefore?: HeadingBreakBeforeConfig;
  /** The style's own numbering template (see
   *  {@link HeadingStyleConfig.numberingTemplate}); unset = the level's. */
  numberingTemplate?: string;
  header?: ResolvedDesignSlot;
  footer?: ResolvedDesignSlot;
  margins?: Required<PageMargins>;
  layout?: ResolvedLayoutConfig;
  bodyStyle?: ResolvedSectionBodyStyleConfig;
  palette: Record<string, string>;
}
