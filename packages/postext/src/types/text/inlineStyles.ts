import type { TextDotsStyle } from '../designPlacement.js';
import type { ColorValue, Dimension } from '../page.js';

/**
 * A named chip style, selected by the inline `:chip[text]{style="<id>"}`
 * (a chip without `style`, or with an id no style declares, takes the first
 * style). A chip is a boxed run of text — a word of a word bank, a key, a
 * tag — that flows with the line as one unbreakable unit.
 *
 * Its advance is the text plus the horizontal padding and border on both
 * sides. The box is a band around the baseline (0.8 em above, 0.25 em
 * below at the chip's font size) grown by the vertical padding and border;
 * the vertical padding paints outside the line box and never changes the
 * line height, so the baseline grid holds. A box taller than the line pitch
 * would touch the chips of the next line (the sandbox warns).
 *
 * Em dimensions of the box (`paddingX`, `paddingY`, `paddingTop`,
 * `paddingBottom`, `borderRadius`, `borderWidth`, `gap`) are relative to
 * the chip's font size; an em
 * `fontSize` is relative to the surrounding text.
 */
export interface ChipStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Paint the box fill. Default `true`. */
  backgroundEnabled?: boolean;
  /** Box fill. Default a pale blue (`#e8eef7`). */
  background?: ColorValue;
  /** Box outline colour. Default the main palette colour. */
  borderColor?: ColorValue;
  /** Box outline width; `0` draws none. Default `0.5pt`. */
  borderWidth?: Dimension;
  /** Corner radius, clamped to half the box height. Default `0.3em`. */
  borderRadius?: Dimension;
  /** Room between the outline and the text, left and right. Default `0.3em`. */
  paddingX?: Dimension;
  /** Room above and below the text band. Paints outside the line box.
   *  Default `0.1em`. */
  paddingY?: Dimension;
  /** Room above the text band, in place of {@link paddingY}. The band
   *  runs 0.8 em above the baseline and 0.25 em below it, so its middle
   *  sits 0.275 em above the baseline, lower than the middle of a capital
   *  (about 0.35 em in most faces): a top padding larger than the bottom
   *  one by twice the difference (`paddingTop: 0.2em`, `paddingBottom:
   *  0.05em`) centres a capital or a figure in a round chip. Default
   *  `paddingY`. */
  paddingTop?: Dimension;
  /** Room below the text band, in place of {@link paddingY}. Default
   *  `paddingY`. */
  paddingBottom?: Dimension;
  /** Chip text family. Default the surrounding text's. */
  fontFamily?: string;
  /** Chip text size (em = the surrounding text). Default the surrounding
   *  text's. */
  fontSize?: Dimension;
  /** Chip text colour. Default the surrounding text's (bold runs keep the
   *  bold colour). */
  color?: ColorValue;
  /** Set the chip text bold / italic (on top of its own markup). Default
   *  `false`. */
  bold?: boolean;
  italic?: boolean;
  /** Minimum room kept between the box and a neighbouring word or chip
   *  across a word space: a narrower space is widened to it (the extra is
   *  not stretched by justification). Nothing is added at a line edge or
   *  against glued punctuation. Default `0.25em`. */
  gap?: Dimension;
  /** Paint the chip's letters as dots to trace (see {@link TextDotsStyle};
   *  em = the chip text). With no fill, no outline and no padding, a chip
   *  is a dotted word in the line: `:chip[gato]{style="dots"}`. Absent:
   *  filled. */
  dotted?: TextDotsStyle;
  /** Draw the outline as a line under the text only — solid, dotted or
   *  dashed, `borderWidth` thick in `borderColor` — instead of round the
   *  box: a blank to write on (#1227). Absent: the whole outline. */
  underline?: ChipUnderline;
  /** The narrowest the box is, outline and padding included: the text is
   *  centred in the room left (#1227). Absent: as wide as its text. */
  minWidth?: Dimension;
}

/** `chipStyles[].underline`. */
export type ChipUnderline = 'solid' | 'dotted' | 'dashed';

/**
 * A named highlight style, selected by the inline `:mark[text]{style="<id>"}`
 * (#888; a mark without `style`, or with an id no style declares, takes the
 * first style). A mark is a coloured band behind a phrase, as a textbook
 * highlights its key words: unlike a chip it is ordinary text, set and
 * broken over lines like the words around it, and the band follows each
 * piece of it on its line. Its horizontal padding and rounded ends are
 * drawn at the true start and end of the phrase only; where the phrase
 * breaks, the band stops square at the last letter of the line.
 *
 * The band takes no room: it is painted under the text, from 0.8 em above
 * the baseline to 0.25 em below it (the em of the marked text), grown by
 * the vertical padding, and its horizontal padding reaches into the word
 * spaces around the phrase. The layout of the text is the same as without
 * the mark.
 */
export interface MarkStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Band colour. Default a pale yellow (`#fff0a0`). */
  background?: ColorValue;
  /** Colour of the marked text. Default the text's own. */
  color?: ColorValue;
  /** Corner radius of the band's two ends, clamped to half its height.
   *  Default `0` (square ends; `0.2em` up to postext 1.51). */
  borderRadius?: Dimension;
  /** How far the band reaches past the first and the last letter of the
   *  phrase, into the space beside it. Default `0.15em`. */
  paddingX?: Dimension;
  /** Room above and below the text band. Default `0.05em`. */
  paddingY?: Dimension;
  /** Room above the text band, in place of {@link paddingY}. A negative
   *  value lowers the band's top edge into the letters: `-0.4em` leaves a
   *  broad marker stroke under the lower half of the words. */
  paddingTop?: Dimension;
  /** Room below the text band, in place of {@link paddingY}; negative
   *  raises its bottom edge. */
  paddingBottom?: Dimension;
  /** Paint the band. Default `true`; `false` leaves the mark its
   *  {@link line} and text colour alone. */
  backgroundEnabled?: boolean;
  /** The band's opacity, percent (0–100). Default `100`. Under 100 the
   *  text and whatever lies under the band show through it; a print PDF
   *  whose standard forbids transparency (PDF/X-1a) sets it as a
   *  tint of its colour over white paper. */
  opacity?: number;
  /** How irregular the band's edges are, 0–100: `0` (default) a clean
   *  band; higher values wobble its top and bottom edges and cut its ends
   *  on a slant, as a highlighter drawn by hand. The wobble is the same on
   *  every render. */
  rough?: number;
  /** A line drawn with the mark, under the words or through them, in one
   *  of five styles: a wavy correction mark, a dashed strike-through. The
   *  band and the line can be used together. Absent: no line. */
  line?: MarkLineConfig;
  /** How the band of a phrase that wraps onto another line is cut (CSS
   *  `box-decoration-break`). `'slice'` (the default): one band cut where
   *  the line breaks, square at the cut, with the padding and the rounded
   *  corners only at the phrase's true start and end. `'clone'`: each line
   *  piece gets a whole band of its own, with `paddingX` and the rounded
   *  corners on both of its ends, as a heading set on a colour band cut per
   *  line. The layout is the same either way. */
  decorationBreak?: MarkDecorationBreak;
}

/** `markStyles[].decorationBreak`. */
export type MarkDecorationBreak = 'slice' | 'clone';

/** `markStyles[].line`: the line of a highlight mark. It sits where the
 *  face puts its underline or its strikeout (as `:underline[…]` and
 *  `~~…~~` do), on the central axis in Chinese and Japanese text and down
 *  a vertical page, and runs on under the word spaces of the phrase. */
export interface MarkLineConfig {
  /** `under` the words (default) or `through` them. */
  position?: MarkLinePosition;
  /** `solid` (default), `double`, `dotted`, `dashed` or `wavy`. */
  style?: MarkLineStyle;
  /** Line colour. Default the marked text's colour. */
  color?: ColorValue;
  /** Stroke width (em = the marked text). Default the face's own
   *  underline or strikeout thickness. */
  thickness?: Dimension;
}

/** `markStyles[].line.position`. */
export type MarkLinePosition = 'under' | 'through';
/** `markStyles[].line.style`. */
export type MarkLineStyle = 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';

/** A mark line with its defaults filled in. */
export interface ResolvedMarkLineConfig {
  position: MarkLinePosition;
  style: MarkLineStyle;
  /** Unset: the marked text's colour. */
  color?: ColorValue;
  /** Unset: the face's own. */
  thickness?: Dimension;
}

/** A highlight style with every default filled in. */
export interface ResolvedMarkStyleConfig {
  id: string;
  name: string;
  background: ColorValue;
  /** Unset: the text's own. */
  color?: ColorValue;
  borderRadius: Dimension;
  paddingX: Dimension;
  paddingY: Dimension;
  /** Unset: `paddingY`. */
  paddingTop?: Dimension;
  /** Unset: `paddingY`. */
  paddingBottom?: Dimension;
  decorationBreak: MarkDecorationBreak;
  backgroundEnabled: boolean;
  /** 0–100. */
  opacity: number;
  /** 0–100. */
  rough: number;
  /** Unset: no line. */
  line?: ResolvedMarkLineConfig;
}

/**
 * A named character style, set on a run of words with the inline
 * `:span[some words]{style="<id>"}`: the face, size, weight, slant,
 * colour, tracking and case of the run, defined once in the design. Unlike
 * a chip the run is text: it breaks, hyphenates and justifies as the words
 * around it do.
 *
 * A style that should also be highlighted, underlined in a dashed or wavy
 * line, or struck through names a highlight style ({@link mark}): the run
 * takes that `markStyles` entry as if it were written inside
 * `:mark[…]{style="<mark>"}`, so a decoration is defined in one place
 * whichever way it reaches the words.
 *
 * An em `fontSize` and `letterSpacing` are relative to the text around the
 * run. A size larger than the text's never changes the line spacing: the
 * lines keep their grid.
 */
export interface CharacterStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Family of the run. Default the text's. */
  fontFamily?: string;
  /** Size of the run (em = the text around it). Default the text's. */
  fontSize?: Dimension;
  /** Weight of the run's regular text (100–900); its bold words keep the
   *  bold. Default the text's. */
  fontWeight?: number;
  /** Set the run in italic. Default `false`. */
  italic?: boolean;
  /** Text colour. Default the text's. Paint only: changing it never moves
   *  a line. */
  color?: ColorValue;
  /** Tracking added after every character of the run (em = the text around
   *  it; negative tightens). Default none. */
  letterSpacing?: Dimension;
  /** `uppercase` sets the run in capitals, by the case rules of the
   *  document's language (a Turkish `i` becomes `İ`); the text keeps its
   *  letters as written for search, copying and assistive technology.
   *  Default `none`. */
  textTransform?: CharacterStyleCase;
  /** Set the run in small capitals (as `:smallcaps[…]`). Default `false`. */
  smallCaps?: boolean;
  /** The id of a highlight style (`markStyles`) the run also takes: its
   *  band, its line, its text colour. Absent: none. */
  mark?: string;
}

/** `characterStyles[].textTransform`. */
export type CharacterStyleCase = 'none' | 'uppercase';

/** A character style with every default filled in. */
export interface ResolvedCharacterStyleConfig {
  id: string;
  name: string;
  /** Unset: the text's. */
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
  italic: boolean;
  color?: ColorValue;
  letterSpacing?: Dimension;
  textTransform: CharacterStyleCase;
  smallCaps: boolean;
  /** A highlight style the run takes; only an id `markStyles` declares. */
  mark?: string;
}

/** An inline chip style with every default filled in. */
export interface ResolvedChipStyleConfig {
  id: string;
  name: string;
  backgroundEnabled: boolean;
  background: ColorValue;
  borderColor: ColorValue;
  borderWidth: Dimension;
  borderRadius: Dimension;
  paddingX: Dimension;
  paddingY: Dimension;
  /** Unset: `paddingY`. */
  paddingTop?: Dimension;
  /** Unset: `paddingY`. */
  paddingBottom?: Dimension;
  /** Unset: the surrounding text's. */
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  bold: boolean;
  italic: boolean;
  gap: Dimension;
  /** Unset: the letters are filled. */
  dotted?: TextDotsStyle;
  /** Unset: the whole outline. */
  underline?: ChipUnderline;
  minWidth?: Dimension;
}
