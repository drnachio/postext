import type { ParagraphBodyField, ParagraphContainerSpacing } from './bodyText.js';
import type { CjkWordBreak } from './cjk.js';
import type { FigureStyle, TextAlign, TextAlignKeyword } from './locale.js';
import type { ColorValue, Dimension } from './page.js';

/** A named paragraph style, applied to the paragraphs inside a
 *  `:::paragraphs{style="<id>"}` container. Every typographic field is
 *  optional and inherits the body text when unset, so a style only needs to
 *  spell out what differs from running text. See
 *  {@link ResolvedParagraphStyleConfig}. */
/** How a drop cap treats an opening quote, `¿`, `¡` or bracket before
 *  the letter (#623; see {@link ParagraphDropCap.punctuation}). */
export type DropCapPunctuation = 'with-cap' | 'hang' | 'text';

/** What a drop cap does in a paragraph of fewer lines than it sinks
 *  (#623; see {@link ParagraphDropCap.shortParagraph}). */
export type DropCapShortParagraph = 'reserve' | 'shrink' | 'skip';

/** The first words after a drop cap set in small capitals or capitals
 *  (#623; see {@link ParagraphDropCap.leadIn}). */
export interface DropCapLeadIn {
  /** How many words, or `'line'` for the whole first line. */
  words?: number | 'line';
  /** Small capitals (as `:smallcaps[…]`). Default `true` unless
   *  {@link uppercase} is set. */
  smallCaps?: boolean;
  /** Capitals. Default `false`. */
  uppercase?: boolean;
}

/**
 * A drop cap (or a raised initial) opening a body paragraph (#623): the
 * first letter set large at the start of the paragraph, its first
 * {@link sink} lines shortened around it on the start side (the left in
 * Latin text, the right in Arabic and Hebrew). The paragraph is broken,
 * justified and hyphenated as any other, and it never breaks before its
 * line {@link sink}, so the letter keeps its lines across columns and
 * pages. Set by a paragraph style (the first paragraph of a
 * `:::paragraphs{style=…}` group, or every one with {@link each}) or a
 * heading level or style (the first body paragraph after the heading);
 * `{dropcap}`, `{dropcap=false}` and `{dropcap=N}` on the group's fence or
 * the heading line switch it on, off or set its lines.
 */
export interface ParagraphDropCap {
  /** Lines the initial spans, from the top of its capitals to its
   *  baseline. Default `3`; `1` with a larger {@link fontSize} is a raised
   *  initial standing on the first baseline. */
  lines?: number;
  /** Lines the initial drops into the text: it stands on the baseline of
   *  line `sink`, and those lines are shortened. Fewer than {@link lines}
   *  raises the initial above the first line, and the paragraph keeps that
   *  rise clear above it (whole grid lines). Default {@link lines} (a true
   *  drop cap). */
  sink?: number;
  /** Grapheme clusters set large: `É`, a letter with a combining mark, a
   *  surrogate pair each count one. Default `1`. */
  characters?: number;
  /** Face of the initial. Default the paragraph's. */
  fontFamily?: string;
  /** Default the paragraph's weight. */
  fontWeight?: number;
  /** Default `false`. */
  italic?: boolean;
  /** Size of the initial. Default: the size that sets the top of its
   *  capitals level with the capitals of the first line while it stands
   *  {@link lines} lines down, both cap heights measured from the faces
   *  (0.72 of the size when a face gives none). */
  fontSize?: Dimension;
  /** Default the paragraph's colour; a palette-linked colour follows part
   *  and section palettes. */
  color?: ColorValue;
  /** Space between the initial and the shortened lines. Default `0.15em`
   *  of the text size. */
  gap?: Dimension;
  /** An opening quote, `¿`, `¡` or bracket before the letter:
   *  `'with-cap'` sets it at the initial's size as part of it, `'hang'`
   *  at text size outside the measure before the initial, `'text'` at text
   *  size at the start of the first line, after the initial. Default
   *  `'with-cap'`. */
  punctuation?: DropCapPunctuation;
  /** The first words after the initial in small capitals or capitals. */
  leadIn?: DropCapLeadIn;
  /** A paragraph of fewer lines than {@link sink}: `'reserve'` keeps the
   *  block {@link sink} lines tall so the next block clears the initial,
   *  `'shrink'` sets the initial over the paragraph's own lines, `'skip'`
   *  sets the paragraph without one. A content warning says so in each
   *  case. Default `'reserve'`. */
  shortParagraph?: DropCapShortParagraph;
  /** A paragraph style's drop cap opens every paragraph of its group (a
   *  catalogue of entries), not the first only. Read on paragraph styles
   *  alone. Default `false`. */
  each?: boolean;
}

export interface ParagraphStyleConfig {
  /** Identifier referenced from `:::paragraphs{style="…"}`. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Defaults to the body font family. */
  fontFamily?: string;
  /** The style's figures (see {@link FigureStyle}): `'lining-tabular'` for a
   *  list of dates or times. Default: those of its family (the body's, with
   *  its figures, when it takes the body's). */
  figureStyle?: FigureStyle;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  /** Leading. `em`/`rem` are relative to the style's own font size.
   *  Defaults to the body line height. */
  lineHeight?: Dimension;
  /** Defaults to the body text colour. */
  color?: ColorValue;
  /** Defaults to the body alignment. `'center'` and `'right'` set every
   *  line ragged from the other side (a dedication, a signature block). */
  textAlign?: TextAlignKeyword;
  /** Colour of bold runs. Defaults to `bodyText.boldColor`. */
  boldColor?: ColorValue;
  /** Colour of italic (`*…*`) runs — in an {@link italic} style, the runs
   *  that flip back to upright. Defaults to `bodyText.italicColor` (not to
   *  {@link color}: set it to the style's colour to keep italics in it). */
  italicColor?: ColorValue;
  /** Weight of the regular text. Defaults to `bodyText.fontWeight`. */
  fontWeight?: number;
  /** Weight of bold (`**…**`) runs. Defaults to `bodyText.boldFontWeight`. */
  boldFontWeight?: number;
  /** Set the paragraphs in italics (stage directions, an epigraph); an
   *  italic `*…*` run inside them flips back to upright, as in a
   *  blockquote. Default `false`. */
  italic?: boolean;
  /** Set the paragraphs in small capitals: lowercase letters become
   *  capitals at `SMALL_CAPS_SIZE_RATIO` (0.7) of the size, capitals keep
   *  the full size. Synthesised the same way on every backend. Default
   *  `false`. */
  smallCaps?: boolean;
  /** Hyphenate when justified — and, when `bodyText.hyphenation.ragged` is
   *  on, when ragged too. Defaults to the body hyphenation setting. */
  hyphenation?: boolean;
  /** Indent of every line of the paragraphs from the left edge of the
   *  column (or box), `em` being the style's own size. The first-line and
   *  hanging indents are measured from there, so an indented line of verse
   *  can hang its turnover deeper than its own start: `indent: 1.5em` with
   *  `hangingIndent: 2.5em` sets the line at 1.5 em and its turnover at
   *  4 em. Default `0`; a negative value counts as `0`. */
  indent?: Dimension;
  /** Indent of every line from the side lines end on (the right of an
   *  English paragraph, the foot of a vertical line), `em` being the
   *  style's own size: the measure narrows by it and lines set flush to the
   *  end (`textAlign: 'end'`) stop that far short of it. A date or a
   *  signature raised N characters off the foot of a Japanese letter (地から
   *  N字上げ) is `textAlign: 'end'` with `endIndent: 'Nem'`; 地付き is the
   *  same at `0`. Default `0`; a negative value counts as `0`. */
  endIndent?: Dimension;
  /** Indent of the first line, from {@link indent}. Defaults to the body
   *  first-line indent. With a non-zero {@link hangingIndent} it applies
   *  only when the style sets it itself: the first line starts at
   *  `indent + firstLineIndent` and its turnovers at `indent +
   *  hangingIndent` (a line of verse indented one em that hangs its
   *  turnover three, #620); inherited from the body it gives way, and the
   *  first line starts at `indent`. */
  firstLineIndent?: Dimension;
  /** Indent applied to every line except the first (bibliographies,
   *  glossaries, the turnover of a line of verse), from {@link indent}.
   *  The first line starts at {@link indent}, or at `indent +
   *  firstLineIndent` when the style sets {@link firstLineIndent} itself.
   *  Default `0`. */
  hangingIndent?: Dimension;
  /** Vertical gap between consecutive paragraphs in the container. Default
   *  `0` — entries abut, off the baseline grid until the container closes. */
  spaceBetween?: Dimension;
  /** Space above the container's first block. Default `0`. */
  marginTop?: Dimension;
  /** Minimum space below the container's last block; the flow snaps back
   *  to the baseline grid after it (see {@link snapToGrid}). How it meets
   *  the space of the block after the container is
   *  `bodyText.paragraphContainerSpacing`. Default `0`. */
  marginBottom?: Dimension;
  /** Snap the flow back onto the baseline grid under the container, the
   *  space below being a minimum. `false` keeps the exact space, so the
   *  text after the container stays off the grid until the next block that
   *  snaps (a heading, the end of a list, display maths): for a document
   *  that runs off the grid, or a group whose leading is its own. Inside a
   *  callout, which has no grid, it changes nothing. Default `true`. */
  snapToGrid?: boolean;
  /** How the space under the `:::paragraphs` containers that name this
   *  style is worked out (#715): `'collapse'` or `'add'`, with the meaning
   *  of `bodyText.paragraphContainerSpacing`, in the running text and
   *  inside a box. Unset, the document's. `'add'` on a style ends its
   *  groups on the style's own space, with no line of paragraph spacing
   *  under them, while the rest of the document keeps the default. */
  containerSpacing?: ParagraphContainerSpacing;
  /** Letter case of the paragraphs: `'uppercase'` sets them in capitals,
   *  the words of a chip and the label of a `:ref` included.
   *  Length-preserving, so source maps stay 1:1: a character whose capital
   *  is longer (`ß` → `SS`) is left as it is. Maths is left alone. Default
   *  `'none'`. */
  textTransform?: ParagraphTextTransform;
  /** Tracking after every letter of the paragraphs, as CSS
   *  `letter-spacing` (#907): positive spreads the letters (a title set
   *  in capitals, `0.015em` for +15/1000 em), negative tightens a display
   *  size. An `em` value is relative to the style's own `fontSize`.
   *  Measured into the lines, so a tracked paragraph breaks where its
   *  wider words put it; justified lines spread their word spaces on top
   *  of it, and a runt the layout tightens takes its tracking from this
   *  value. Painted the same by canvas, HTML, PDF and EPUB. Words of a
   *  joining script (Arabic, Syriac, N'Ko) are left untracked
   *  (`joiningScriptLetterSpacing`). Default `0`. */
  letterSpacing?: Dimension;
  /** Where CJK lines of the paragraphs break between characters (see
   *  {@link CjkWordBreak}): `'keep-all'` only at spaces and next to
   *  punctuation (phrase-spaced kana text, 分かち書き), `'normal'` between
   *  any two characters. Unset: the document's `cjk.wordBreak`. */
  wordBreak?: CjkWordBreak;
  /** Whether line numbers (`lineNumbers`, #621) count the lines of the
   *  style's paragraphs. Unset: counted when `lineNumbers.count` is
   *  `'all'` (or, in a poem set in the style, when it counts verse);
   *  `true` counts them under `'verse'` too, and inside a callout, whose
   *  text is otherwise never counted; `false` never. */
  lineNumbers?: boolean;
  /** Tab stops of the style's paragraphs (#622; see {@link TabStop}). A
   *  tab character in their text is then a tab, and `:tab` goes to them.
   *  Unset: the body's (`bodyText.tabStops`). An empty list sets none. */
  tabStops?: TabStop[];
  /** Default stops past the last of {@link tabStops}. Unset: the body's. */
  tabInterval?: Dimension;
  /** A drop cap opening the first paragraph of each `:::paragraphs` group
   *  in the style (#623; every paragraph with `each: true`). Unset: none. */
  dropCap?: ParagraphDropCap;
}

/** Where a tab stop stands (#622): a length from the start edge of the
 *  paragraph's measure (after a paragraph style's `indent`; `em` being the
 *  paragraph's own size), `'end'` for the measure's end edge, or a share of
 *  the measure (`'50%'`). */
export type TabStopPosition = Dimension | 'end' | `${number}%`;

/** How the text after a tab sits at its stop (#622): `'start'` starts
 *  there, `'end'` ends there, `'center'` is centred on it and `'decimal'`
 *  puts its decimal separator on it (a run with none ends there). */
export type TabStopAlign = 'start' | 'end' | 'center' | 'decimal';

/**
 * A tab stop of body text (#622): a menu's prices flush right, a cast
 * list's actors after a dot leader, an exam's marks at the margin. A tab
 * goes to the first stop past the text before it; a line holding a tab is
 * set by the line-by-line breaker (never Knuth–Plass), and in justified
 * text only its word spaces after the last tab take the slack.
 */
export interface TabStop {
  position: TabStopPosition;
  /** Default `'start'`. */
  align?: TabStopAlign;
  /** Repeated over the room before the stop, flush with its end so the
   *  leaders of several lines line up: `'.'`, `'. '`, `'·'`, `'_'`, `'-'`
   *  or any short text in the paragraph's face; `'rule'` draws a line on
   *  the baseline (a form's blank). Default none. */
  leader?: string;
  /** Room kept between the text and the leader, and between the leader and
   *  the text at the stop. Default `0.5em` (the contents' `leader.gap`). */
  leaderGap?: Dimension;
  /** `'decimal'` stops: the separator. Default the document language's
   *  (`.` in English, `,` in Spanish, Catalan, Portuguese…). */
  decimalChar?: string;
}

export type ParagraphTextTransform = 'none' | 'uppercase';

export interface ResolvedParagraphStyleConfig {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  boldColor?: ColorValue;
  /** Absent when the style sets none (italics take `bodyText.italicColor`). */
  italicColor?: ColorValue;
  fontWeight: number;
  boldFontWeight: number;
  italic: boolean;
  smallCaps: boolean;
  hyphenation: boolean;
  /** The style sets {@link hyphenation} itself: a poem in the style
   *  hyphenates its turnovers only then (#620). Absent when inherited. */
  ownHyphenation?: true;
  indent: Dimension;
  /** Absent when the style sets none (or `0`). */
  endIndent?: Dimension;
  firstLineIndent: Dimension;
  /** The style sets {@link firstLineIndent} itself (it is not the body's):
   *  with a non-zero {@link hangingIndent} the two pair up (#620). Absent
   *  when inherited. */
  ownFirstLineIndent?: true;
  /** The type fields the style leaves unset and takes from the body text
   *  (#1119), so a box can set them in its own body instead. Absent when
   *  the style sets them all, and on the styles the engine makes itself
   *  (footnotes, bibliography). */
  inheritsBody?: ParagraphBodyField[];
  hangingIndent: Dimension;
  spaceBetween: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  snapToGrid: boolean;
  /** Absent when the style sets none: its containers follow
   *  `bodyText.paragraphContainerSpacing`. */
  containerSpacing?: ParagraphContainerSpacing;
  textTransform: ParagraphTextTransform;
  /** Absent unless the style sets a non-zero one (#907). */
  letterSpacing?: Dimension;
  /** Absent when the style sets none (the document's `cjk.wordBreak`). */
  wordBreak?: CjkWordBreak;
  /** Absent when the style sets none (see
   *  {@link ParagraphStyleConfig.lineNumbers}). */
  lineNumbers?: boolean;
  /** Absent when the style sets none: its paragraphs take the body's. */
  tabStops?: TabStop[];
  /** Absent when the style sets none. */
  tabInterval?: Dimension;
  /** Absent when the style sets none (#623). */
  dropCap?: ParagraphDropCap;
}
