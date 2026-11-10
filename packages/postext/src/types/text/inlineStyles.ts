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
  /** Room above the text band, in place of {@link paddingY}. */
  paddingTop?: Dimension;
  /** Room below the text band, in place of {@link paddingY}. */
  paddingBottom?: Dimension;
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
}

/**
 * A decoration line of a character style: an underline or a
 * strike-through (`CharacterStyleConfig.underline` / `strike`). Em lengths
 * are relative to the run's own size.
 */
export interface CharacterStyleLineConfig {
  /** Draw the line. Default `false`. */
  enabled?: boolean;
  /** Line colour. Default the run's text colour. */
  color?: ColorValue;
  /** Opacity, percent (0–100). Default `100`. A print PDF sets a line
   *  under 100 as a tint of its colour over the paper, with no
   *  transparency. */
  opacity?: number;
  /** Stroke width. Default `0.06em`. */
  thickness?: Dimension;
  /** Where the line runs, from the baseline: below it for an underline
   *  (default `0.12em`), above it for a strike-through (default `0.3em`). */
  offset?: Dimension;
  /** `solid` (default) a rule, `double` two rules, `dotted` a row of
   *  dots, `dashed` a row of dashes, `wavy` a wave. */
  style?: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';
  /** Leave the word spaces of the run out: the line breaks at each space.
   *  Default `false` (the line runs on under the spaces). */
  skipSpaces?: boolean;
}

/**
 * The highlighter band of a character style (`CharacterStyleConfig.highlight`):
 * a band of colour painted behind the run, like a marker pen. Its edges are
 * measured from the baseline (positive: up), in em of the run: a band from
 * `-0.05em` to `0.35em` is a broad marker stroke under the lower half of the
 * letters; from `-0.2em` to `0.8em` it covers the words.
 */
export interface CharacterStyleHighlightConfig {
  /** Paint the band. Default `false`. */
  enabled?: boolean;
  /** Band colour. Default a highlighter yellow (`#ffe14d`). */
  color?: ColorValue;
  /** Opacity, percent (0–100). Default `70`. The band is painted behind
   *  the text, so the letters keep their colour; a print PDF sets it as a
   *  tint of its colour over the paper, with no transparency. */
  opacity?: number;
  /** Where the band starts, from the baseline (negative: below it).
   *  Default `-0.2em`. */
  bottom?: Dimension;
  /** Where the band ends, from the baseline. Default `0.8em`. */
  top?: Dimension;
  /** How far the band reaches past the run's first and last letters.
   *  Default `0.08em`. */
  overhang?: Dimension;
  /** Corner radius. Default `0.08em`. */
  radius?: Dimension;
  /** How irregular the band's edges are, 0–100: `0` (default) a clean
   *  band; higher values wobble its top and bottom edges and slant its
   *  ends, as a marker drawn by hand. The wobble is the same on every
   *  render. */
  rough?: number;
  /** Leave the word spaces of the run out: one band per word. Default
   *  `false`. */
  skipSpaces?: boolean;
}

/**
 * A named character style, set on a run of text with `[some words]|id|`:
 * a face, a colour and decorations (an underline, a highlighter band, a
 * strike-through) for words inside a paragraph. Unlike a chip the run
 * breaks and hyphenates as the text around it does; a decoration broken
 * across two lines is drawn on each.
 *
 * An em `fontSize` and `letterSpacing` are relative to the text around the
 * run; the decorations' em lengths to the run's own size. A size larger
 * than the text's never changes the line spacing: the lines keep their
 * grid.
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
  /** Text colour. Default the text's (bold and italic words keep their
   *  emphasis colours). */
  color?: ColorValue;
  /** Tracking added after every character of the run (em = the text around
   *  it; negative tightens). Default none. */
  letterSpacing?: Dimension;
  /** `uppercase` sets the run in capitals. Default `none`. */
  textTransform?: 'none' | 'uppercase';
  /** Set the run in small capitals. Default `false`. */
  smallCaps?: boolean;
  underline?: CharacterStyleLineConfig;
  highlight?: CharacterStyleHighlightConfig;
  strike?: CharacterStyleLineConfig;
}

export interface ResolvedCharacterStyleLine {
  enabled: boolean;
  /** Unset: the run's text colour. */
  color?: ColorValue;
  opacity: number;
  thickness: Dimension;
  offset: Dimension;
  style: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';
  skipSpaces: boolean;
}

export interface ResolvedCharacterStyleHighlight {
  enabled: boolean;
  color: ColorValue;
  opacity: number;
  bottom: Dimension;
  top: Dimension;
  overhang: Dimension;
  radius: Dimension;
  rough: number;
  skipSpaces: boolean;
}

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
  textTransform: 'none' | 'uppercase';
  smallCaps: boolean;
  underline: ResolvedCharacterStyleLine;
  highlight: ResolvedCharacterStyleHighlight;
  strike: ResolvedCharacterStyleLine;
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
