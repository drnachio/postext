// The token a rich paragraph is measured in and its break points, swatch
// sizes, span fonts, super- and subscript metrics, small caps and the
// width of a token's text (#1276: split out of rich.ts).
import type { TabStopPx, TabLeaderPlacement } from '../tabs.js';
import type { TabStopAlign } from '../../types.js';
import type { VDTAnnotationRun, VDTSwatch, VDTChip, VDTSegmentMarks, VDTLineSegment, VDTLine } from '../../vdt.js';
import type { MathRender } from '../../math/types.js';
import type { SwatchBox } from '../../parse/index.js';
import { getMeasureLanguage, withMeasureLanguage, measureTextWidth } from '../canvas.js';
import { findPxSize, withPxSize } from '../fontString.js';
import { graphemeCount } from '../graphemes.js';
import { measuringVertically, mayHoldVerticalCell, verticalTextWidth } from '../vertical.js';
import { type ScriptContext, pieceScriptContext, scriptAt, getMeasureScriptContext, faceReadsScript, rtlTextWidth, scriptTextWidth, isLetterless } from '../script.js';

export interface RichBreakPoint {
  charIndex: number;
  widthBefore: number;
  /** The line ends on the character before `charIndex` as it is — a hard
   *  hyphen the word already carries — and no hyphen is added. */
  bare?: boolean;
  /** A soft hyphen typed in the source: the author's own break, taken like
   *  a dictionary syllable (a hyphen is added) but never held back by the
   *  hyphenation zone of ragged text or its two-line cap. */
  author?: boolean;
  /** A break inside a run with no spaces that is no hyphenation point:
   *  between two ideographs, after a dash or a slash between two words, or
   *  at a zero-width space the author typed. The line
   *  ends as it is, nothing is added, and no hyphenation penalty applies. */
  free?: boolean;
  /** Taken only by the greedy breaker (ragged lines, and justified ones
   *  without optimal line breaking), as pretext's breaker takes it on plain
   *  paragraphs; Knuth–Plass does not break here on either path. */
  greedyOnly?: boolean;
  /** A `free` break next to a CJK character: the line it ends is not
   *  `hyphenated`, so the column-end hyphen rules leave it alone. */
  cjk?: boolean;
  /** A syllable break inside a Catalan `l·l`: the hyphen takes the place of
   *  the middle dot (`il-` | `lusió`), whose width, here, the line ending
   *  at this break gives back. In a document shaped in its own language
   *  it is what the text up to the dot is narrower than the text with it
   *  (`col` against `col·`): the head is then as wide as `col` and its
   *  hyphen, the two texts painted (#770). */
  replacesWidth?: number;
  /** Knuth–Plass, in a document shaped in its own language (#770): what
   *  the rest of the word, set from this break at a line's start as a text
   *  of its own, is wider than the pieces after the break measured inside
   *  the word (negative: narrower). See {@link RichToken.ownPieces}. */
  restShift?: number;
}

export interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Superscript / subscript token: measured and painted with `scriptFont`
   *  (the span font at the script size) and painted `baselineShift` px
   *  below the baseline (negative: above). */
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
  /** The Arabic words of a slanted style set upright (`InlineSpan.upright`):
   *  the face they are measured and painted in, the span's with its slant
   *  taken off. */
  faceFont?: string;
  /** An inline footnote marker at a size of its own
   *  (`footnotes.markerSize`): the font it is measured and painted with,
   *  on the baseline. */
  markerFont?: string;
  /** One of a subscript and a superscript set over each other (see
   *  {@link stackedScriptPairs}): the `first` has width 0, the `second`
   *  the pair's advance. Neither is ever broken or hyphenated. */
  stacked?: 'first' | 'second';
  /** Small capitals: `text` keeps its own case (hyphenation reads it) and
   *  `width` is the synthesised small caps' (see {@link smallCapsWidth});
   *  the line's segments are split into capital runs once it is broken. */
  smallCaps?: boolean;
  kind: 'text' | 'space';
  width: number;
  breakPoints?: RichBreakPoint[];
  hyphenWidth?: number;
  /** The break points are bare (a URL / DOI broken after a slash or before
   *  a dot): the line ends without a hyphen and nothing is appended. */
  bareBreaks?: boolean;
  /** When present, this token is an atomic math formula. `text` is a single
   *  `\uFFFC` placeholder and `width` is the math render's widthPx. */
  mathRender?: MathRender;
  /** When present, this token is an inline `:ref{\u2026}` to a resource. `text`
   *  already carries the resolved label; the token is atomic (never wraps
   *  apart) and the id flows onto the segment so renderers can colour/link it. */
  refResourceId?: string;
  /** The reference names an anchor (#262): `refResourceId` is its id. */
  refAnchor?: true;
  /** The book page index the anchor landed on, when known. */
  refPageIndex?: number;
  /** A later piece of a reference whose label breaks at its spaces (#702,
   *  {@link refLabelTokens}): a word after the first, or a space between
   *  two of them. Its segment is flagged `refContinues`. */
  refContinues?: true;
  /** A footnote marker (`[^id]`): atomic like a reference; the id flows
   *  onto the segment. */
  footnoteId?: string;
  /** A footnote marker set in the line gap (`footnotes.markerPosition:
   *  'side'`): what is painted there; the token is 0 wide (see
   *  `VDTLineSegment.sideMarker`). */
  sideRuns?: VDTAnnotationRun[];
  /** A footnote marker set flush with the right side of a vertical line
   *  (`footnotes.markerPosition: 'right'`): how far its baseline moves
   *  across the line (negative: right), px, for its em box at
   *  `markerFont` to end where the line's does. */
  markerShift?: number;
  /** True when this token belongs to a caption's numbered label. Flows to the
   *  segment so renderers can apply the label colour. */
  captionLabel?: boolean;
  /** {@link InlineSpan.labelTab}: a space whose width {@link setLabelTabs}
   *  sets. */
  labelTab?: 'lead' | 'gap';
  /** When present, this token is an inline colour swatch (`:swatch{…}`): an
   *  atomic square of `width` px, filled with `color` (hex) when resolved,
   *  with the shape its attributes give it (#1104). */
  swatch?: VDTSwatch;
  /** When present, this token is an inline chip (`:chip[…]`): an atomic box
   *  of `width` px (margins included) with its own text runs. */
  chip?: VDTChip;
  /** The chip style's gap (px), read when the word spaces around the chip
   *  are sized (see {@link applyChipGaps}). */
  chipGap?: number;
  /** A space inside inline code (`InlineSpan.codeSpace`, #845): the line
   *  may break at it, but justification neither stretches nor shrinks it. */
  fixedGlue?: true;
  /** Vertical text: a `:tcy[…]` run, one upright cell of one em (see
   *  `VDTLineSegment.tcy`). */
  tcy?: true;
  /** Vertical text: a `:upright[…]` or `:sideways[…]` run (see
   *  `VDTLineSegment.orientation`). */
  orientation?: 'upright' | 'sideways';
  /** The token ends on a dash a line may end after, and the next token
   *  touches it: a run in another style, as in `riddles—*and*` (see
   *  {@link markDashJoins}). The line may break between the two. */
  dashJoin?: boolean;
  /** Chinese marks on the token's text (#193), for the segment. */
  cjkMarks?: VDTSegmentMarks;
  /** Characters the layout added (a book title's 《》). */
  inserted?: boolean;
  /** One word of a joining script set in more than one style
   *  (`كتا**ب**`), joined from the runs its spans cut it into (see
   *  {@link joinStyledRuns}): each run's text and style, in order. The
   *  token is measured whole, in the style of its longest run (`bold`,
   *  `italic`), and becomes one segment painted as one shaped word
   *  (`VDTLineSegment.runs`). */
  runs?: { text: string; bold?: boolean; italic?: boolean }[];
  /** How far kashidas may widen this word, px: its box's stretch in
   *  Knuth–Plass (`measure/rtl/kashida.ts`). Absent on any other token. */
  kashida?: number;
  /** A tab (#622, `InlineSpan.tab`): a `space` token whose width the line
   *  breaker sets where its line has got to (`measure/tabs.ts`); `stop` is
   *  the one-off stop of `:tab{at=…}`. Never skipped at a line's start nor
   *  trimmed at its end. */
  tab?: { stop?: TabStopPx };
  /** A tab placed at its stop: the stop (see `VDTLineSegment.tab`) and its
   *  leader (see {@link setTabbedLine}). */
  tabPlaced?: { align: TabStopAlign; at: number };
  tabLeader?: TabLeaderPlacement;
  /** A word with no letter, in a face that draws punctuation by script
   *  (#725, `measure/script.ts`): the script it was measured in and is
   *  painted in (`VDTLineSegment.scriptContext`); `scriptRtl` when it was
   *  measured as a right-to-left word (its bidi level is odd). `scriptRtl`
   *  alone: a right-to-left word with letters in such a face, measured in
   *  a context set right to left, as it is painted (`rtlTextWidth`).
   *  Absent on every other token. */
  scriptContext?: ScriptContext;
  scriptRtl?: true;
  /** The language of the run this word is of, when the run names its own
   *  and the document is shaped in its own (`:ltr[…]{lang=en}`, #764): what
   *  is measured of the word later (a cut, a piece) is measured in it. */
  lang?: string;
  /** A word with a letter that may be painted in pieces with none
   *  (`10.1006/ijhc.2001`): the script in force where its text starts,
   *  which such a piece takes when no letter stands before it in the text
   *  (`pieceScriptContext`). */
  wordScript?: ScriptContext;
  /** In a document shaped in its own language (#770): the two halves of
   *  this word, broken at a line end, are each measured as the text
   *  painted. The rest that opens the next line is measured from the break
   *  on (`lar`, not `instal·lar` less `instal·`), and its later pieces as
   *  that text grows by them ({@link ownRest}). The value is the tracking
   *  each of its characters was measured with, px. Absent in a document
   *  that keeps the host's language, and on a word that holds CJK
   *  characters (measured unit by unit, so its rest is already its own). */
  ownPieces?: number;
}

/** Whether a resolved swatch colour can fill the square: a six- or
 *  eight-digit hex (`#rrggbb`, `#rrggbbaa`) or an `rgb()` / `rgba()`
 *  colour. Anything else leaves the swatch an empty outline. */
export function isSwatchFill(color: string): boolean {
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) || /^rgba?\([^()]*\)$/i.test(color);
}

/** The shape fields of a swatch segment (#1104, see `VDTSwatch`): only
 *  those its attributes set, so a plain swatch keeps today's segment. */
export function swatchShapeOf(box: SwatchBox, side: number, width: number): Omit<VDTSwatch, 'color' | 'icon'> {
  return {
    ...(box.sidePx !== undefined || width !== side ? { side } : {}),
    ...(box.borderWidthPx !== undefined ? { borderWidth: box.borderWidthPx } : {}),
    ...(box.borderColor !== undefined ? { borderColor: box.borderColor } : {}),
    ...(box.radiusPx !== undefined ? { radius: Math.min(box.radiusPx, side / 2) } : {}),
  };
}

/** Side of an inline colour swatch: three quarters of the font size (the
 *  height of a capital), read from the `px` size of the CSS font string. */
export function swatchSidePx(font: string): number {
  const m = findPxSize(font);
  const size = m ? Number(m.value) : 16;
  return Math.max(1, size * 0.75);
}

export function pickSpanFont(
  bold: boolean,
  italic: boolean,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  if (bold && italic) return boldItalicFont;
  if (bold) return boldFont;
  if (italic) return italicFont;
  return normalFont;
}

/** Superscripts and subscripts are set at this fraction of the text size
 *  (the compositor's default). */
export const SCRIPT_SIZE_RATIO = 0.583;
/** A superscript rises this fraction of the text size: a third of an em,
 *  as browsers raise `vertical-align: super`. */
export const SUPERSCRIPT_SHIFT_RATIO = 0.333;
/** A subscript drops this fraction of the text size (EF-80): 0.15 em, the
 *  drop TeX gives a subscript alone (σ16 of its text fonts, MathJax's
 *  `$T_0$`), which keeps a figure inside the descender line. It used to
 *  drop as far as a superscript rises, and hung below the descenders. */
export const SUBSCRIPT_SHIFT_RATIO = 0.15;
/** A subscript stacked under a superscript (`T~0~^2^`) drops this fraction
 *  of the text size instead: 0.25 em, TeX's drop for a subscript with a
 *  superscript over it (σ17, 0.247 em), which clears room between the two. */
export const STACKED_SUBSCRIPT_SHIFT_RATIO = 0.25;
/** `font` at `scale` times its size. */
export function scaledFont(font: string, scale: number): string {
  return withPxSize(font, (size) => parseFloat(size) * scale);
}

/** The font a script token is measured and painted with (`font` at the
 *  script size) and its baseline shift in px (negative: up). `stacked`: a
 *  subscript with a superscript set over it, which drops further. */
export function scriptMetrics(font: string, script: 'sup' | 'sub', stacked = false): { font: string; baselineShift: number } {
  const m = findPxSize(font);
  const size = m ? parseFloat(m.value) : 0;
  const scaled = withPxSize(font, () => size * SCRIPT_SIZE_RATIO);
  const ratio = script === 'sup'
    ? -SUPERSCRIPT_SHIFT_RATIO
    : stacked ? STACKED_SUBSCRIPT_SHIFT_RATIO : SUBSCRIPT_SHIFT_RATIO;
  return { font: scaled, baselineShift: size * ratio };
}

/**
 * The subscripts and superscripts to stack (EF-80): a subscript and a
 * superscript that touch, with nothing between them (`T~0~^2^`, or
 * `T^2^~0~`), are set one over the other, as TeX sets `T_0^2`, not one after
 * the other. `scripts[i]` is the script of the i-th run of a line or word
 * (undefined for anything else); returns the index of the first run of each
 * pair. A run pairs once: after `x~a~^b^~c~` the `c` follows the pair.
 *
 * Stacked runs are painted at the same pen position: the first advances
 * nothing (its width becomes 0 and it is flagged `stacked`), the second
 * carries the pair's advance, the wider of the two — so every renderer that
 * paints runs one after another by their widths sets them stacked, and the
 * widths still add up to the line's.
 */
export function stackedScriptPairs(scripts: readonly ('sup' | 'sub' | undefined)[]): number[] {
  const firsts: number[] = [];
  for (let i = 0; i + 1 < scripts.length; i++) {
    const a = scripts[i];
    const b = scripts[i + 1];
    if (a && b && a !== b) {
      firsts.push(i);
      i++;
    }
  }
  return firsts;
}

/** Font a token is measured with: its span font, or the script font of a
 *  superscript / subscript. */
export function tokenFont(
  t: { bold: boolean; italic: boolean; scriptFont?: string; faceFont?: string },
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  return t.scriptFont ?? t.faceFont ?? pickSpanFont(t.bold, t.italic, normalFont, boldFont, italicFont, boldItalicFont);
}

/** The script, small-caps and Chinese-mark fields a token derived from
 *  another (a split, a hyphenated head) carries on. */
export function scriptOf(t: { script?: 'sup' | 'sub'; scriptFont?: string; baselineShift?: number; faceFont?: string; smallCaps?: boolean; cjkMarks?: VDTSegmentMarks; inserted?: boolean; scriptContext?: ScriptContext; scriptRtl?: true; lang?: string }): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift' | 'faceFont' | 'smallCaps' | 'cjkMarks' | 'inserted' | 'scriptContext' | 'scriptRtl' | 'lang'> {
  return {
    ...(t.script ? { script: t.script, scriptFont: t.scriptFont, baselineShift: t.baselineShift } : {}),
    ...(t.faceFont ? { faceFont: t.faceFont } : {}),
    ...(t.smallCaps ? { smallCaps: true } : {}),
    ...(t.cjkMarks ? { cjkMarks: t.cjkMarks } : {}),
    ...(t.inserted ? { inserted: true } : {}),
    // The pieces of a word with no letter are shaped in its script (#725).
    ...(t.scriptContext ? { scriptContext: t.scriptContext } : {}),
    ...(t.scriptRtl ? { scriptRtl: true as const } : {}),
    // And the pieces of a word of a run in another language in it (#764).
    ...(t.lang !== undefined ? { lang: t.lang } : {}),
  };
}

/** The script fields of the piece `[from, to)` of `token`, a head or a
 *  tail of it: the token's own when it is a word with no letter, or one
 *  measured right to left; else, for a word with a letter that may have
 *  pieces with none (`RichToken.wordScript`), the script of the piece when
 *  it holds no letter (it is then measured and painted in it), or the
 *  script in force where it starts, for the pieces cut from it later. */
export function pieceScriptFields(token: Pick<RichToken, 'text' | 'scriptContext' | 'scriptRtl' | 'wordScript'>, from: number, to: number): Pick<RichToken, 'scriptContext' | 'scriptRtl' | 'wordScript'> {
  if (token.wordScript === undefined) return {};
  const script = pieceScriptContext(token.text, from, to, token.wordScript);
  if (script) return { scriptContext: script };
  const start = scriptAt(token.text, from, token.wordScript);
  return start ? { wordScript: start } : {};
}

/** The width of a word of a joining script (Arabic…), always painted
 *  right to left: measured so too in a face that draws its punctuation by
 *  script (#725, `rtlTextWidth`), so the bracket or the stop at its edge
 *  takes the forms it is painted in, and in every face in a document
 *  shaped in its own language (#770, see `rtlTextWidth`); as any text
 *  otherwise. */
export function rtlWordWidth(text: string, font: string): number {
  return getMeasureScriptContext().enabled && !measuringVertically() && (faceReadsScript(font) || getMeasureLanguage() !== undefined) ? rtlTextWidth(text, font) : textWidth(text, font, false);
}

/** How a token's text is measured: in its script when it is a word with
 *  no letter given one (#725), else as any text (`textWidth`). */
export function tokenTextWidth(token: Pick<RichToken, 'scriptContext' | 'scriptRtl' | 'smallCaps' | 'wordScript' | 'lang'>, font: string): (text: string) => number {
  // A word of a run in another language is measured in it (#764).
  if (token.lang !== undefined) {
    const { lang, ...rest } = token;
    const inner = tokenTextWidth(rest, font);
    return (text) => withMeasureLanguage(lang, () => inner(text));
  }
  const script = token.scriptContext;
  if (script) return (text) => (text === '' ? 0 : scriptTextWidth(text, font, script, token.scriptRtl === true));
  // A right-to-left word of a face that draws punctuation by script.
  if (token.scriptRtl) return (text) => (text === '' ? 0 : rtlTextWidth(text, font));
  // What opens a word before its first letter is measured in its script.
  const word = token.wordScript;
  if (word) return (text) => (isLetterless(text) ? scriptTextWidth(text, font, word, false) : textWidth(text, font, token.smallCaps));
  return (text) => textWidth(text, font, token.smallCaps);
}

/** Small capitals are synthesised, the same way on every backend: a
 *  lowercase letter is set as its capital at this fraction of the text
 *  size, while capitals, digits and punctuation keep the full size — the
 *  ratio browsers use for a face without real small caps. */
export const SMALL_CAPS_SIZE_RATIO = 0.7;

/** `font` at the small-caps size. */
export function smallCapsFont(font: string): string {
  return withPxSize(font, (size) => parseFloat(size) * SMALL_CAPS_SIZE_RATIO);
}

/** A lowercase letter with a one-unit capital (`ß` and the like, whose
 *  capital is longer, stay as they are so the text keeps its length). */
function smallCapsLowered(ch: string): string | undefined {
  const up = ch.toUpperCase();
  return up !== ch && up.length === 1 ? up : undefined;
}

/** A text cut into runs of full-size characters and of lowercase letters
 *  (`small`, already set as capitals). */
export function smallCapsRuns(text: string): { text: string; small: boolean }[] {
  const runs: { text: string; small: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const up = smallCapsLowered(ch);
    const small = up !== undefined;
    const last = runs[runs.length - 1];
    if (last && last.small === small) last.text += up ?? ch;
    else runs.push({ text: up ?? ch, small });
  }
  return runs;
}

/** Advance of `text` set in small capitals from `font` (per-character
 *  tracking not included). */
export function smallCapsWidth(text: string, font: string): number {
  let small: string | undefined;
  let w = 0;
  for (const run of smallCapsRuns(text)) {
    w += measureTextWidth(run.text, run.small ? (small ??= smallCapsFont(font)) : font);
  }
  return w;
}

/** Advance of `text` in `font`, set in small capitals when `smallCaps`.
 *  In vertical text (`measuringVertically`) a character that stands in a
 *  cell of its own advances its cell (`verticalTextWidth`), as the
 *  renderers paint it, and so does a short number set in one cell
 *  (`cjk.uprightDigits`) and a Japanese pair of !? marks
 *  (`mayHoldVerticalCell`). */
export function textWidth(text: string, font: string, smallCaps: boolean | undefined): number {
  if (measuringVertically() && mayHoldVerticalCell(text)) {
    return verticalTextWidth(text, font, (run) => (smallCaps ? smallCapsWidth(run, font) : measureTextWidth(run, font)));
  }
  return smallCaps ? smallCapsWidth(text, font) : measureTextWidth(text, font);
}

/** Segments that still carry the small-caps flag of their token. */
export type PendingSegment = VDTLineSegment & { smallCaps?: boolean };

/**
 * Split every small-caps segment of the broken lines into runs painted as
 * they were measured: capitals at the segment's font, lowercase letters as
 * capitals at the small-caps size (a `fontString` of their own). The last
 * run absorbs any rounding so the segment keeps its measured width, and the
 * line text follows the painted case (the same length, so source maps
 * hold).
 */
export function expandSmallCaps(
  lines: VDTLine[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): void {
  for (const line of lines) {
    const segs = line.segments as PendingSegment[] | undefined;
    if (!segs || !segs.some((s) => s.smallCaps)) continue;
    // A leader (#622) is no text of the line.
    const spelled = (list: readonly VDTLineSegment[]) => list.filter((s) => !s.leader).map((s) => s.text).join('');
    const before = spelled(segs);
    const out: VDTLineSegment[] = [];
    for (const seg of segs) {
      if (!seg.smallCaps) { out.push(seg); continue; }
      const rest: PendingSegment = { ...seg };
      delete rest.smallCaps;
      const runs = smallCapsRuns(seg.text);
      if (seg.kind !== 'text' || !runs.some((r) => r.small)) {
        out.push({ ...rest, text: runs.map((r) => r.text).join('') });
        continue;
      }
      const base = seg.fontString ?? pickSpanFont(!!seg.bold, !!seg.italic, normalFont, boldFont, italicFont, boldItalicFont);
      const small = smallCapsFont(base);
      let used = 0;
      runs.forEach((run, i) => {
        const font = run.small ? small : base;
        const width = i === runs.length - 1
          ? seg.width - used
          : measureTextWidth(run.text, font) + (letterSpacingPx + (line.letterSpacing ?? 0) + (seg.tracking ?? 0)) * graphemeCount(run.text);
        used += width;
        // Capitals keep the segment's own font (none for a plain run).
        const piece: VDTLineSegment = { ...rest, text: run.text, width };
        if (run.small || seg.fontString) piece.fontString = font;
        else delete piece.fontString;
        // A reference stays one reference: the later runs continue it.
        if (i > 0 && seg.refResourceId !== undefined) piece.refContinues = true;
        out.push(piece);
      });
    }
    line.segments = out;
    if (line.text === before) line.text = spelled(out);
  }
}
