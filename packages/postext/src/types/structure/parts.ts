import type { DesignSlot, ResolvedDesignSlot } from '../designElements.js';
import type { HeadingBreakParity } from './headings.js';
import type { OrderedListsConfig, UnorderedListsConfig } from '../text/lists.js';
import type { TextAlign, TextAlignKeyword } from '../text/locale.js';
import type { ColorValue, Dimension, PageMargins } from '../page.js';

// ---------------------------------------------------------------------------
// Parts — `:::part{number="…" title="…"}` dividers. A part opens a dedicated
// single-column page whose opener design is laid out against the full trim
// box; the blocks inside the fence (typically the chapter list) flow in that
// column with their own typography.
// ---------------------------------------------------------------------------

export interface PartsBreakBeforeConfig {
  /** Parity of the page the part opens on. Default `'odd'`. */
  parity?: HeadingBreakParity;
}

export interface PartsBreakAfterConfig {
  /** Whether the content after the part moves to a fresh page. Default `true`. */
  enabled?: boolean;
  /** Parity of that fresh page. Default `'any'` — the next chapter's own
   *  `breakBefore.parity` then decides whether a blank verso follows. */
  parity?: HeadingBreakParity;
}

/** Typography of the blocks inside a `:::part` container. Every field
 *  inherits `bodyText` / the list configs when unset. */
export interface PartsBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlignKeyword;
  /** Bullet colour of unordered lists inside the part. */
  bulletColor?: ColorValue;
  /** Number colour of ordered lists inside the part (numbers are set bold). */
  numberColor?: ColorValue;
  /** Partial overrides applied on top of the document's `unorderedLists`
   *  inside the part (after `bulletColor`). */
  unorderedLists?: UnorderedListsConfig;
  /** Partial overrides applied on top of the document's `orderedLists`
   *  inside the part (after `numberColor` and the bold weight). */
  orderedLists?: OrderedListsConfig;
}

export interface PartsConfig {
  /** Whether a `:::part` opens a divider page (default `true`). When
   *  `false` no page is opened and the fence's body is not set: the part's
   *  number, title and palette take effect from the next content on
   *  (running heads, palette-linked colours), with no break of their own.
   *  Typical use: `htmlViewer.overrides.parts.page: false`, a screen
   *  edition without section dividers. */
  page?: boolean;
  breakBefore?: PartsBreakBeforeConfig;
  breakAfter?: PartsBreakAfterConfig;
  /** Body area of the part page. Defaults to the page margins (`mirror`
   *  honoured). */
  margins?: PageMargins;
  /** Opener design. Its container is the page trim box, so `'page'` /
   *  `'bleed'` anchors and container anchors coincide. Purely decorative —
   *  it never reserves body space; raise `margins.top` to leave room for
   *  it. When empty, `{number} {titleText}` is synthesised from the H1
   *  typography, joined with the H1's `numberSeparator`. */
  design?: DesignSlot;
  /** Design of the blank verso that follows a part page (the back of the
   *  divider leaf). Same container and placeholders as `design`; when
   *  empty the verso stays plain. */
  versoDesign?: DesignSlot;
  bodyStyle?: PartsBodyStyleConfig;
}

export interface ResolvedPartsBreakBeforeConfig {
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBreakAfterConfig {
  enabled: boolean;
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBodyStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  bulletColor: ColorValue;
  numberColor: ColorValue;
  /** Kept partial: applied on top of the resolved document lists inside parts. */
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
}

export interface ResolvedPartsConfig {
  page: boolean;
  breakBefore: ResolvedPartsBreakBeforeConfig;
  breakAfter: ResolvedPartsBreakAfterConfig;
  margins: Required<PageMargins>;
  design: ResolvedDesignSlot;
  versoDesign: ResolvedDesignSlot;
  bodyStyle: ResolvedPartsBodyStyleConfig;
}
