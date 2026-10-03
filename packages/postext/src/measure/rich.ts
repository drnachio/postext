import type { VDTChip, VDTChipRun, VDTLine, VDTLineSegment, VDTSegmentMarks } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { MathRender } from '../math/types';
import type { InlineSpan } from '../parse';
import { hyphenateText, withoutSlashJoints } from '../hyphenate';
import {
  richTokensToItems,
  computeBreakpoints,
  reconstructRichLines,
} from '../knuthPlass';
import { SOFT_HYPHEN } from './types';
import { lineMeasure, uniformMeasureFrom, type MeasuredBlock, type MeasureBlockOptions } from './types';
import { cleanSoftHyphens, measureTextWidth, normalSpaceWidthFor } from './canvas';
import { isRuntLastLine } from './runts';
import { computeJustifiedSpaceRatio, hasOverfullLine } from './plain';
import { quoteFamily } from './font';
import { trimChipLineEdges } from './chipEdges';
import { cjkJoinBreaks, hasCJK } from './cjk';
import { composeCjkParagraph, cjkWordBreaks, composesAsCjk, spanMarks, type CjkWordBreaks } from './cjkCompose';
import { graphemeCount, graphemesOf } from './graphemes';
import { fontEm, getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode, lineBaselineOffset, measuringVertically, verticalTextWidth, withMeasureWritingMode } from './vertical';
import { latinReader, uprightDigitCandidates } from '../writingMode';
import { sliceSpan } from '../parse/links';
import type { CjkRegion } from '../types';
import { NO_BREAK_SPACES, WORDS_AND_SPACES_RE, isBlankText, isBreakingSpace, isBreakingSpaceRun } from './spaces';
import { breaksAfterDash, breaksAfterHardHyphen, hasCompound, isDash, raggedStretchPx } from './breakRules';

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
   *  between two ideographs, or after a dash between two words. The line
   *  ends as it is, nothing is added, and no hyphenation penalty applies. */
  free?: boolean;
  /** Taken only by the greedy breaker (ragged lines, and justified ones
   *  without optimal line breaking), as pretext's breaker takes it on plain
   *  paragraphs; Knuth–Plass does not break here on either path. */
  greedyOnly?: boolean;
  /** A `free` break next to a CJK character: the line it ends is not
   *  `hyphenated`, so the column-end hyphen rules leave it alone. */
  cjk?: boolean;
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
  /** A footnote marker (`[^id]`): atomic like a reference; the id flows
   *  onto the segment. */
  footnoteId?: string;
  /** True when this token belongs to a caption's numbered label. Flows to the
   *  segment so renderers can apply the label colour. */
  captionLabel?: boolean;
  /** {@link InlineSpan.labelTab}: a space whose width {@link setLabelTabs}
   *  sets. */
  labelTab?: 'lead' | 'gap';
  /** When present, this token is an inline colour swatch (`:swatch{…}`): an
   *  atomic square of `width` px, filled with `color` (hex) when resolved. */
  swatch?: { color?: string };
  /** When present, this token is an inline chip (`:chip[…]`): an atomic box
   *  of `width` px (margins included) with its own text runs. */
  chip?: VDTChip;
  /** The chip style's gap (px), read when the word spaces around the chip
   *  are sized (see {@link applyChipGaps}). */
  chipGap?: number;
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
}

/** Whether a resolved swatch colour can fill the square: a six- or
 *  eight-digit hex (`#rrggbb`, `#rrggbbaa`) or an `rgb()` / `rgba()`
 *  colour. Anything else leaves the swatch an empty outline. */
export function isSwatchFill(color: string): boolean {
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) || /^rgba?\([^()]*\)$/i.test(color);
}

/** Side of an inline colour swatch: three quarters of the font size (the
 *  height of a capital), read from the `px` size of the CSS font string. */
export function swatchSidePx(font: string): number {
  const m = /(\d*\.?\d+)px/.exec(font);
  const size = m ? Number(m[1]) : 16;
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
const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/** `font` at `scale` times its size. */
export function scaledFont(font: string, scale: number): string {
  const m = FONT_SIZE_RE.exec(font);
  return m ? font.replace(FONT_SIZE_RE, `${parseFloat(m[1]!) * scale}px`) : font;
}

/** The font a script token is measured and painted with (`font` at the
 *  script size) and its baseline shift in px (negative: up). `stacked`: a
 *  subscript with a superscript set over it, which drops further. */
export function scriptMetrics(font: string, script: 'sup' | 'sub', stacked = false): { font: string; baselineShift: number } {
  const m = FONT_SIZE_RE.exec(font);
  const size = m ? parseFloat(m[1]!) : 0;
  const scaled = m ? font.replace(FONT_SIZE_RE, `${size * SCRIPT_SIZE_RATIO}px`) : font;
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
function tokenFont(
  t: { bold: boolean; italic: boolean; scriptFont?: string },
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  return t.scriptFont ?? pickSpanFont(t.bold, t.italic, normalFont, boldFont, italicFont, boldItalicFont);
}

/** The script, small-caps and Chinese-mark fields a token derived from
 *  another (a split, a hyphenated head) carries on. */
function scriptOf(t: { script?: 'sup' | 'sub'; scriptFont?: string; baselineShift?: number; smallCaps?: boolean; cjkMarks?: VDTSegmentMarks; inserted?: boolean }): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift' | 'smallCaps' | 'cjkMarks' | 'inserted'> {
  return {
    ...(t.script ? { script: t.script, scriptFont: t.scriptFont, baselineShift: t.baselineShift } : {}),
    ...(t.smallCaps ? { smallCaps: true } : {}),
    ...(t.cjkMarks ? { cjkMarks: t.cjkMarks } : {}),
    ...(t.inserted ? { inserted: true } : {}),
  };
}

/** Small capitals are synthesised, the same way on every backend: a
 *  lowercase letter is set as its capital at this fraction of the text
 *  size, while capitals, digits and punctuation keep the full size — the
 *  ratio browsers use for a face without real small caps. */
export const SMALL_CAPS_SIZE_RATIO = 0.7;

/** `font` at the small-caps size. */
export function smallCapsFont(font: string): string {
  const m = FONT_SIZE_RE.exec(font);
  return m ? font.replace(FONT_SIZE_RE, `${parseFloat(m[1]!) * SMALL_CAPS_SIZE_RATIO}px`) : font;
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
 *  (`cjk.uprightDigits`); no other ASCII text holds one. */
export function textWidth(text: string, font: string, smallCaps: boolean | undefined): number {
  if (measuringVertically() && (/[^\u0000-\u007F]/.test(text) || (getMeasureUprightDigits() > 0 && /[0-9]/.test(text)))) {
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
    const before = segs.map((s) => s.text).join('');
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
    if (line.text === before) line.text = out.map((s) => s.text).join('');
  }
}

/** The text band of a chip box around the baseline, as fractions of the
 *  chip's font size: from the ascenders down past the descenders; the
 *  vertical padding and border grow it. */
export const CHIP_ASCENT_RATIO = 0.8;
export const CHIP_DESCENT_RATIO = 0.25;

/** `font` set in `family` (when given) at `sizePx`: the style and weight
 *  words of the CSS shorthand are kept. */
function withFace(font: string, family: string | undefined, sizePx: number): string {
  const m = /^(.*?)(\d*\.?\d+)px\s+(.+)$/.exec(font);
  if (!m) return font;
  return `${m[1]}${sizePx}px ${family ? quoteFamily(family) : m[3]}`;
}

/**
 * One atomic token for an inline chip: its words measured run by run (the
 * span font — plus the chip style's bold / italic — at the chip's family
 * and size), boxed by the horizontal padding and border. The box height is
 * the chip's text band plus the vertical padding and border; it never
 * enters the line height. A chip span without a resolved box sets as bare
 * text.
 */
export function chipToken(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): RichToken {
  const chip = span.chip!;
  const box = chip.box;
  const sizeMatch = FONT_SIZE_RE.exec(normalFont);
  const sizePx = box?.fontSizePx ?? (sizeMatch ? parseFloat(sizeMatch[1]!) : 16);
  const runs: VDTChipRun[] = [];
  // The script of each run, and the unscaled font of a subscript's (which
  // drops further when a superscript is stacked over it).
  const runScripts: ('sup' | 'sub' | undefined)[] = [];
  const runBaseFonts: string[] = [];
  for (const s of chip.spans) {
    if (s.text.length === 0) continue;
    const bold = s.bold || span.bold || !!box?.bold;
    const italic = s.italic || span.italic || !!box?.italic;
    const base = withFace(pickSpanFont(bold, italic, normalFont, boldFont, italicFont, boldItalicFont), box?.fontFamily, sizePx);
    let font = base;
    let baselineShift: number | undefined;
    if (s.script) {
      const m = scriptMetrics(font, s.script);
      font = m.font;
      baselineShift = m.baselineShift;
    }
    // Small capitals (the chip's own words or the text around the chip):
    // one run per capital / lowered stretch.
    const smallCaps = !!(s.smallCaps || span.smallCaps);
    const pieces = smallCaps
      ? smallCapsRuns(s.text).map((r) => ({ text: r.text, font: r.small ? smallCapsFont(font) : font }))
      : [{ text: s.text, font }];
    for (const piece of pieces) {
      runs.push({
        text: piece.text,
        fontString: piece.font,
        width: measureTextWidth(piece.text, piece.font) + letterSpacingPx * graphemeCount(piece.text),
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
        ...(baselineShift !== undefined ? { baselineShift } : {}),
      });
      runScripts.push(smallCaps ? undefined : s.script);
      runBaseFonts.push(base);
    }
  }
  // A subscript and a superscript that touch are stacked (EF-80).
  for (const i of stackedScriptPairs(runScripts)) {
    const first = runs[i]!;
    const second = runs[i + 1]!;
    const sub = runScripts[i] === 'sub' ? i : i + 1;
    runs[sub]!.baselineShift = scriptMetrics(runBaseFonts[sub]!, 'sub', true).baselineShift;
    second.width = Math.max(first.width, second.width);
    first.width = 0;
    first.stacked = true;
  }
  const textWidth = runs.reduce((sum, r) => sum + r.width, 0);
  const paddingX = box?.paddingXPx ?? 0;
  const paddingY = box?.paddingYPx ?? 0;
  // A style may pad the top and the bottom apart (EF-172).
  const paddingTop = box?.paddingTopPx ?? paddingY;
  const paddingBottom = box?.paddingBottomPx ?? paddingY;
  const borderWidth = box?.borderWidthPx ?? 0;
  const boxWidth = textWidth + (paddingX + borderWidth) * 2;
  const ascent = sizePx * CHIP_ASCENT_RATIO + paddingTop + borderWidth;
  const descent = sizePx * CHIP_DESCENT_RATIO + paddingBottom + borderWidth;
  return {
    text: span.text,
    bold: span.bold,
    italic: span.italic,
    captionLabel: span.captionLabel,
    kind: 'text',
    width: boxWidth,
    chip: {
      styleId: box?.styleId ?? '',
      runs,
      marginLeft: 0,
      marginRight: 0,
      boxWidth,
      ascent,
      descent,
      paddingX,
      borderWidth,
      borderRadius: Math.min(box?.borderRadiusPx ?? 0, (ascent + descent) / 2, boxWidth / 2),
      ...(box?.background ? { background: box.background } : {}),
      ...(box?.borderColor ? { borderColor: box.borderColor } : {}),
      ...(box?.color ? { color: box.color } : {}),
    },
    chipGap: box?.gapPx ?? 0,
  };
}

const LEADING_NO_BREAK_RE = new RegExp(`^[${NO_BREAK_SPACES}]+`);
const TRAILING_NO_BREAK_RE = new RegExp(`[${NO_BREAK_SPACES}]+$`);

/** A chip keeps at least its style's `gap` to a neighbour across a word
 *  space: a narrower space is topped up by a margin inside the chip's own
 *  advance (so justification, which stretches spaces only, never eats it).
 *  Between two chips the shortfall is shared, so the pair ends up exactly
 *  `gap` apart. Glued neighbours (punctuation) get nothing. A no-break
 *  space is a word space too, though it rides inside the word it glues:
 *  `noBreakWidth` measures the run of them a word opens or closes with. */
function applyChipGaps(tokens: RichToken[], noBreakWidth: (token: RichToken, run: string) => number): void {
  for (let i = 0; i < tokens.length; i++) {
    const space = tokens[i]!;
    if (space.kind !== 'space') continue;
    const left = tokens[i - 1]?.chip ? tokens[i - 1]! : undefined;
    const right = tokens[i + 1]?.chip ? tokens[i + 1]! : undefined;
    if (!left && !right) continue;
    const gap = Math.max(left?.chipGap ?? 0, right?.chipGap ?? 0);
    const shortfall = gap - space.width;
    if (shortfall <= 0) continue;
    const share = left && right ? shortfall / 2 : shortfall;
    if (left) tokens[i - 1] = withChipMargins(left, 0, share);
    if (right) tokens[i + 1] = withChipMargins(right, share, 0);
  }
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]!;
    if (word.kind !== 'text' || word.chip || word.mathRender || word.swatch || word.refResourceId !== undefined || word.footnoteId !== undefined) continue;
    const lead = LEADING_NO_BREAK_RE.exec(word.text)?.[0];
    const trail = TRAILING_NO_BREAK_RE.exec(word.text)?.[0];
    const left = lead && tokens[i - 1]?.chip ? tokens[i - 1]! : undefined;
    const right = trail && tokens[i + 1]?.chip ? tokens[i + 1]! : undefined;
    if (!left && !right) continue;
    if (lead === word.text && left && right) {
      // Nothing but no-break spaces between two chips: they share it.
      const shortfall = Math.max(left.chipGap ?? 0, right.chipGap ?? 0) - word.width;
      if (shortfall > 0) {
        tokens[i - 1] = withChipMargins(left, 0, shortfall / 2);
        tokens[i + 1] = withChipMargins(right, shortfall / 2, 0);
      }
      continue;
    }
    if (left) {
      const shortfall = (left.chipGap ?? 0) - noBreakWidth(word, lead!);
      if (shortfall > 0) tokens[i - 1] = withChipMargins(left, 0, shortfall);
    }
    if (right) {
      const shortfall = (right.chipGap ?? 0) - noBreakWidth(word, trail!);
      if (shortfall > 0) tokens[i + 1] = withChipMargins(right, shortfall, 0);
    }
  }
}

function withChipMargins(token: RichToken, addLeft: number, addRight: number): RichToken {
  const chip = token.chip!;
  return {
    ...token,
    width: token.width + addLeft + addRight,
    chip: { ...chip, marginLeft: chip.marginLeft + addLeft, marginRight: chip.marginRight + addRight },
  };
}

/**
 * Tokenize inline spans into word/space tokens with bold/italic flags and measured widths.
 */
/** A word that is a URL or a bare DOI: never hyphenated by the dictionary,
 *  but breakable at its own joints so a long link cannot force an
 *  unfillable line. */
export const URL_LIKE_RE = /^(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S+$/i;

/** Break opportunities inside a URL, following the usual editorial rule:
 *  after a slash (never inside the `//` of the scheme) or before a dot,
 *  hyphen or query/fragment punctuation, so the punctuation opens the next
 *  line and no hyphen is added. Never within the first few characters. */
export function urlBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 4; i < text.length - 1; i++) {
    const prev = text[i - 1]!;
    const ch = text[i]!;
    if (prev === '/' && ch !== '/' && text[i - 2] !== '/') out.push(i);
    else if ('.?#&=_~%-'.includes(ch) && prev !== '/' && !'.?#&=_~%-'.includes(prev)) out.push(i);
  }
  return out;
}

interface SoftBreak {
  /** Offset into the word as laid out. */
  index: number;
  /** Typed in the source rather than found by the dictionary. */
  author: boolean;
}

/**
 * A word as laid out (its soft hyphens removed) and the breaks its soft
 * hyphens mark: the dictionary's when `hyphenate` is on, and the author's
 * own — the U+00AD the source carries, which the dictionary leaves as they
 * are (it does not hyphenate a word that already has them). The zero-width
 * space the dictionary puts after a slash is dropped: the rich breaker does
 * not break there, and it must not reach the line text.
 */
function syllabify(word: string, hyphenate: boolean): { clean: string; soft: SoftBreak[] } {
  const hyphenated = hyphenate ? withoutSlashJoints(word, hyphenateText(word)) : word;
  if (!hyphenated.includes(SOFT_HYPHEN)) return { clean: hyphenated, soft: [] };
  let clean = '';
  const soft: SoftBreak[] = [];
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    // A soft hyphen the dictionary inserted is not the source's character.
    const fromSource = j < word.length && ch === word[j];
    if (fromSource) j++;
    if (ch === SOFT_HYPHEN) soft.push({ index: clean.length, author: fromSource });
    else clean += ch;
  }
  return { clean, soft };
}

/** Break opportunities inside a word (`clean`, the text as laid out):
 *  - after each soft hyphen, the dictionary's or the author's (`soft`); a
 *    hyphen is added when the line ends there;
 *  - after a hard hyphen between two letters — "enseñanza-aprendizaje" —
 *    where the line ends on the hyphen the word already carries;
 *  - after an em or en dash: with `dashBreaks`, one set closed between words
 *    as `breaksAfterDash` reads it ("say—that’s", "riddles.—I"), for both
 *    breakers — `touching` is the end (the last two characters) of the word
 *    run this word touches, with no space in between, which a dash at the
 *    start of the word needs; without it, one between two letters
 *    ("largas—separadas"), for the greedy breaker only, as pretext breaks a
 *    plain paragraph there;
 *  - next to CJK characters, under the line-break rules of the document's
 *    `cjk.lineBreak` (`cjk`: the word's units, measured once each, whose
 *    running sums give the widths before its breaks). */
function wordBreakPoints(
  clean: string,
  soft: SoftBreak[],
  font: string,
  letterSpacingPx: number,
  smallCaps?: boolean,
  dashBreaks = false,
  touching?: string,
  cjk?: CjkWordBreaks,
): RichBreakPoint[] {
  const widthBefore = cjk
    ? cjk.widthBefore
    : (idx: number): number => textWidth(clean.slice(0, idx), font, smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(clean.slice(0, idx)));
  const byIndex = new Map<number, RichBreakPoint>();
  const add = (bp: Omit<RichBreakPoint, 'widthBefore'>): void => {
    if (bp.charIndex <= 0 || bp.charIndex >= clean.length) return;
    // One break per position; the word's own hyphen wins over a soft one.
    const existing = byIndex.get(bp.charIndex);
    if (existing && !(bp.bare && !existing.bare)) return;
    byIndex.set(bp.charIndex, { ...bp, widthBefore: widthBefore(bp.charIndex) });
  };
  // The character at `k`, reading back into the run this word touches.
  const charAt = (k: number): string | undefined => (k >= 0 ? clean[k] : touching?.[touching.length + k]);
  for (let i = dashBreaks ? 0 : 1; i < clean.length - 1; i++) {
    const ch = clean[i]!;
    if (ch !== '-' && !isDash(ch)) continue;
    if (dashBreaks && ch !== '-') {
      if (breaksAfterDash(charAt(i - 1), ch, clean[i + 1], charAt(i - 2))) add({ charIndex: i + 1, free: true });
      continue;
    }
    if (i === 0 || !breaksAfterHardHyphen(clean[i - 1], clean[i + 1])) continue;
    add(ch === '-' ? { charIndex: i + 1, bare: true } : { charIndex: i + 1, free: true, greedyOnly: true });
  }
  for (const s of soft) add(s.author ? { charIndex: s.index, author: true } : { charIndex: s.index });
  if (cjk) for (const idx of cjk.breaks) add({ charIndex: idx, free: true, cjk: true });
  return [...byIndex.values()].sort((a, b) => a.charIndex - b.charIndex);
}

/**
 * A word wider than the whole line (a table cell, a narrow column): divide
 * it at the last no-break space that leaves a head that fits ("300 000 |
 * 000", nothing added), else at the last syllable that fits — the
 * dictionary's, a hyphen added — or, when none does, at the last character
 * that fits, so no word ever runs past its measure. A cut next to a hyphen
 * the word carries falls after it and adds none (`hard`): never "fisica-" |
 * "-universitaria" nor "fisica--". Null when not even one character fits,
 * or, with `syllablesOnly`, when no no-break space or syllable does.
 */
export function emergencySplit(
  token: RichToken,
  font: string,
  letterSpacingPx: number,
  lineMaxWidth: number,
  syllablesOnly = false,
): { head: RichToken; tail: RichToken; hard?: boolean } | null {
  const text = token.text;
  if (text.length < 2) return null;
  const hyphenW = measureTextWidth('-', font) + letterSpacingPx;
  const widthBefore = (idx: number): number => textWidth(text.slice(0, idx), font, token.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(text.slice(0, idx)));
  const flags = { bold: token.bold, italic: token.italic, captionLabel: token.captionLabel, ...scriptOf(token) };
  // A group glued by no-break spaces too wide for any line: the space is
  // the least bad place to part it (EF-66). The line ends before it and the
  // next one opens after it.
  for (let idx = text.length - 2; idx >= 1; idx--) {
    if (!NO_BREAK_SPACES.includes(text[idx]!) || NO_BREAK_SPACES.includes(text[idx - 1]!)) continue;
    const headWidth = widthBefore(idx);
    if (headWidth > lineMaxWidth) continue;
    return {
      head: { ...flags, text: text.slice(0, idx), kind: 'text', width: headWidth },
      tail: { ...tailAfter(token, idx + 1, widthBefore(idx + 1)), ...flags },
    };
  }
  // No hyphen where the cut falls next to an ideograph, or right after a
  // hyphen of the text.
  const afterHyphen = (idx: number): boolean => text[idx - 1] === '-';
  const markW = (idx: number): number => (afterHyphen(idx) || hasCJK(text.slice(idx - 1, idx + 1)) ? 0 : hyphenW);
  const fits = (idx: number): boolean => widthBefore(idx) + markW(idx) <= lineMaxWidth;
  // The longest prefix that fits without its mark, found by doubling then
  // halving (prefix widths grow with their length): no cut past it fits,
  // so a word many lines long costs what one line of it does, not a
  // measurement of every prefix.
  let reach = 0;
  let over = text.length;
  for (let step = 1; reach + step < text.length; step *= 2) {
    if (widthBefore(reach + step) > lineMaxWidth) {
      over = reach + step;
      break;
    }
    reach += step;
  }
  while (over - reach > 1) {
    const mid = (reach + over) >> 1;
    if (widthBefore(mid) <= lineMaxWidth) reach = mid;
    else over = mid;
  }
  let at = 0;
  // The dictionary's syllables, as offsets into the text: `syllabify` maps
  // them past anything else the dictionary might put in.
  const { clean, soft } = syllabify(text, true);
  if (clean === text) {
    for (const s of soft) {
      if (s.index > 0 && s.index <= reach && fits(s.index)) at = s.index;
    }
  }
  if (at === 0 && !syllablesOnly) {
    for (let idx = reach; idx >= 1; idx--) {
      // Not right before a hyphen of the text: the next line would open
      // on it.
      if (text[idx] === '-') continue;
      if (fits(idx)) { at = idx; break; }
    }
  }
  if (at === 0) return null;
  const mark = markW(at) > 0 ? '-' : '';
  return {
    head: { ...flags, text: text.slice(0, at) + mark, kind: 'text', width: widthBefore(at) + markW(at) },
    tail: { ...tailAfter(token, at, widthBefore(at)), ...flags },
    ...(afterHyphen(at) ? { hard: true } : {}),
  };
}

/** What is left of `token` after a cut at `at` (`cutWidth` px in): its text
 *  and width from there, the break points after the cut moved with it, and
 *  what they need (the hyphen's width; a web address's joints stay bare),
 *  so the next line breaks the rest where it could break the whole. */
function tailAfter(token: RichToken, at: number, cutWidth: number): RichToken {
  const residual = (token.breakPoints ?? [])
    .filter((b) => b.charIndex > at)
    .map((b) => ({ ...b, charIndex: b.charIndex - at, widthBefore: b.widthBefore - cutWidth }));
  return {
    text: token.text.slice(at),
    bold: token.bold,
    italic: token.italic,
    kind: 'text',
    width: token.width - cutWidth,
    ...(residual.length > 0 ? { breakPoints: residual, hyphenWidth: token.hyphenWidth } : {}),
    ...(token.bareBreaks ? { bareBreaks: true } : {}),
    ...(token.dashJoin ? { dashJoin: true } : {}),
  };
}

/** For each character of the spans' joined text, whether it sits in a
 *  compound: a run of text between breaking spaces with a hyphen between
 *  two letters (see `hasCompound`). */
function compoundMask(spans: readonly InlineSpan[]): boolean[] {
  const text = spans.map((s) => s.text).join('');
  const mask = new Array<boolean>(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    if (isBreakingSpace(text[i])) { i++; continue; }
    let j = i;
    while (j < text.length && !isBreakingSpace(text[j])) j++;
    if (hasCompound(text.slice(i, j))) mask.fill(true, i, j);
    i = j;
  }
  return mask;
}

/** The script fields of a span's tokens (the font at the script size, and
 *  the shift), none for text that is no superscript or subscript. */
export function spanScriptFields(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift'> {
  if (!span.script) return {};
  const base = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
  const m = scriptMetrics(base, span.script);
  return { script: span.script, scriptFont: m.font, baselineShift: m.baselineShift };
}

/** Whether a span sets something other than its text: a `:ref` or a
 *  note marker (its label), a chip, a swatch or a formula. The orientation
 *  marks of vertical text leave such a span as it is. */
export function setsObject(span: InlineSpan): boolean {
  return span.ref !== undefined || span.footnote !== undefined || span.chip !== undefined || span.swatch !== undefined || span.math !== undefined || span.mathRender !== undefined;
}

/** A stand-in for what a span sets other than its text (a chip, a
 *  formula, a swatch, a reading, a warichu note), or sets upright: no
 *  Latin text to a number beside it. */
const NOT_LATIN = '\uFFFC';
/** A stand-in for a note marker or a reference: looked past, as a space
 *  is (`printed in 49[^1] copies`). */
const LOOKED_PAST = '\u200B';

/**
 * Vertical text: `spans` with each short number that runs with Latin text
 * (`latinReader`: `printed in 49 and 32 copies`) set sideways, as
 * `:sideways[…]` sets it, where the words it runs with lie past a space or
 * in another span (#222). A line keeps each word of a vertical paragraph in
 * a segment of its own, and a segment alone would read such a number
 * without its neighbours and stand it upright (`uprightDigitRuns`): the
 * number is measured and painted sideways as the paragraph reads it,
 * also one whose marks touch it (`(49)`, `49,`): the words those lead to
 * may lie in another segment. A piece of the paragraph never reads a
 * number as Latin that the paragraph stands upright (`latinReader`), so
 * the numbers left alone read alike in every segment. Nothing changes
 * when `digits` is 0 or no span holds a digit.
 */
export function sidewaysNumberSpans(spans: InlineSpan[], digits: number, region: CjkRegion): InlineSpan[] {
  if (!(digits > 0)) return spans;
  const numbered = (s: InlineSpan): boolean => /[0-9]/.test(s.text) && !setsObject(s) && !s.ruby && !s.warichu && !s.combineUpright && !s.orientation && !s.script;
  if (!spans.some(numbered)) return spans;
  // The paragraph as graphemes; a note marker or a reference is looked
  // past, and a span that sets something else than its text (a formula, a
  // chip, a reading, a warichu note) or that the author set upright is one
  // character that is not Latin.
  const all: string[] = [];
  const firsts: number[] = [];
  for (const s of spans) {
    firsts.push(all.length);
    if (s.footnote !== undefined || s.ref !== undefined) all.push(LOOKED_PAST);
    else if (setsObject(s) || s.ruby || s.warichu || s.combineUpright || s.orientation === 'upright') all.push(NOT_LATIN);
    else for (const g of graphemesOf(s.text)) all.push(g);
  }
  const latin = latinReader(all, region);
  let out: InlineSpan[] | undefined;
  spans.forEach((s, k) => {
    const own = numbered(s) ? graphemesOf(s.text) : undefined;
    const cuts: Array<[number, number]> = [];
    if (own) {
      for (const [i, n] of uprightDigitCandidates(own, digits)) {
        const from = firsts[k]! + i;
        if (latin(from, from + n)) cuts.push([i, i + n]);
      }
    }
    if (!own || cuts.length === 0) {
      out?.push(s);
      return;
    }
    out ??= spans.slice(0, k);
    const offset: number[] = [0];
    for (const g of own) offset.push(offset[offset.length - 1]! + g.length);
    let at = 0;
    for (const [a, b] of cuts) {
      if (offset[a]! > at) out.push(sliceSpan(s, at, offset[a]!));
      out.push({ ...sliceSpan(s, offset[a]!, offset[b]!), orientation: 'sideways' });
      at = offset[b]!;
    }
    if (at < s.text.length) out.push(sliceSpan(s, at));
  });
  return out ?? spans;
}

/**
 * The one token of a span that is set as a whole, or undefined for text:
 * - an inline `:ref` or a footnote marker: the resolved label (already in
 *   `text`) as one box that never wraps apart. Kind 'text' keeps the
 *   generic layout and renderers treating it as a word; `refResourceId` /
 *   `footnoteId` flow onto the segment for link colouring and PDF links;
 * - a chip: a box with its own runs, never broken or hyphenated inside;
 * - a swatch: one square the size of a capital;
 * - a formula: one box with the render's `widthPx`. Kind 'text' (not
 *   'space'), so trimming a line's trailing spaces never drops it.
 */
export function atomicSpanToken(
  span: InlineSpan,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  letterSpacingPx: number,
): RichToken | undefined {
  // Vertical text: a run the author set upright or sideways is one unit a
  // line never breaks inside (tate-chu-yoko one em, upright letters one em
  // each, a sideways run its horizontal width). A reference, a note
  // marker, a chip, a swatch or a formula keeps its own setting.
  if ((span.combineUpright || span.orientation) && measuringVertically() && span.text.length > 0 && !setsObject(span)) {
    const font = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    const em = fontEm(font);
    const count = span.combineUpright ? 1 : graphemeCount(span.text);
    const track = letterSpacingPx === 0 ? 0 : letterSpacingPx * count;
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width: (span.combineUpright ? em : span.orientation === 'upright' ? em * count : measureTextWidth(span.text, font)) + track,
      ...(span.combineUpright ? { tcy: true as const } : { orientation: span.orientation! }),
    };
  }
  if (span.ref || span.footnote) {
    const scriptFields = spanScriptFields(span, normalFont, boldFont, italicFont, boldItalicFont);
    const scale = span.footnote?.scale;
    const markerFont = !span.script && scale !== undefined && scale > 0 && Math.abs(scale - 1) > 1e-6
      ? scaledFont(pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont), scale)
      : undefined;
    const refFont = scriptFields.scriptFont ?? markerFont ?? pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      ...scriptFields,
      ...(markerFont ? { markerFont } : {}),
      ...(span.smallCaps ? { smallCaps: true } : {}),
      kind: 'text',
      width: textWidth(span.text, refFont, span.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(span.text)),
      ...(span.ref ? { refResourceId: span.ref.resourceId, ...(span.ref.anchor ? { refAnchor: true as const } : {}), ...(span.ref.pageIndex !== undefined ? { refPageIndex: span.ref.pageIndex } : {}) } : {}),
      ...(span.footnote ? { footnoteId: span.footnote.id } : {}),
    };
  }
  if (span.labelTab) {
    const font = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      kind: 'text',
      width: textWidth(span.text, font, false) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(span.text)),
      labelTab: span.labelTab,
    };
  }
  if (span.chip) return chipToken(span, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  if (span.swatch) {
    const swatchFont = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width: swatchSidePx(swatchFont),
      swatch: isSwatchFill(span.swatch.color) ? { color: span.swatch.color } : {},
    };
  }
  if (span.math && span.mathRender) {
    return {
      text: span.text,
      bold: span.bold,
      italic: span.italic,
      captionLabel: span.captionLabel,
      kind: 'text',
      width: span.mathRender.widthPx,
      mathRender: span.mathRender,
    };
  }
  return undefined;
}

/** The segment a token (or the part of one on a line) sets: its kind, text
 *  (soft hyphens removed), width and every flag the renderers read. Small
 *  capitals stay flagged until {@link expandSmallCaps} splits them. */
export function tokenSegment(t: RichToken): PendingSegment {
  const seg = {
    kind: t.mathRender ? 'math' : t.swatch ? 'swatch' : t.chip ? 'chip' : t.kind,
    text: cleanSoftHyphens(t.text),
    width: t.width,
    bold: t.bold || undefined,
    italic: t.italic || undefined,
    ...(t.mathRender ? { mathRender: t.mathRender } : {}),
    ...(t.swatch ? { swatch: t.swatch } : {}),
    ...(t.chip ? { chip: t.chip } : {}),
    ...(t.refResourceId !== undefined ? { refResourceId: t.refResourceId, ...(t.refAnchor ? { refAnchor: true as const } : {}), ...(t.refPageIndex !== undefined ? { refPageIndex: t.refPageIndex } : {}) } : {}),
    ...(t.footnoteId !== undefined ? { footnoteId: t.footnoteId } : {}),
    ...(t.captionLabel ? { captionLabel: true } : {}),
    ...(t.labelTab ? { labelTab: true as const } : {}),
    ...(t.script ? { script: t.script, fontString: t.scriptFont, baselineShift: t.baselineShift } : {}),
    ...(t.markerFont && !t.script ? { fontString: t.markerFont } : {}),
    ...(t.stacked === 'first' ? { stacked: true } : {}),
    ...(t.smallCaps ? { smallCaps: true } : {}),
  } as PendingSegment;
  // The fields of vertical and Chinese text, last, when set.
  if (t.tcy) seg.tcy = true;
  if (t.orientation) seg.orientation = t.orientation;
  if (t.cjkMarks) seg.cjkMarks = t.cjkMarks;
  if (t.inserted) seg.inserted = true;
  return seg;
}

/**
 * Widen the spaces of a bibliography label (#290) so the entry's text
 * starts `columnPx` from the line's start: the gap after the label takes
 * what the label leaves of the column (its own width at least), or, with
 * a space before the label, that space takes it and the label ends against
 * the gap. `items` are a paragraph's tokens or units in order; `setWidth`
 * writes a new width.
 */
export function setLabelTabs<T extends { width: number }>(
  items: readonly T[],
  tabOf: (item: T) => 'lead' | 'gap' | undefined,
  columnPx: number,
  setWidth: (item: T, width: number) => void,
): void {
  const gapAt = items.findIndex((t) => tabOf(t) === 'gap');
  if (gapAt < 0) return;
  const leadAt = items.findIndex((t, i) => i < gapAt && tabOf(t) === 'lead');
  let label = 0;
  for (let i = leadAt + 1; i < gapAt; i++) label += items[i]!.width;
  const gap = items[gapAt]!;
  if (leadAt >= 0) setWidth(items[leadAt]!, Math.max(0, columnPx - gap.width - label));
  else setWidth(gap, Math.max(gap.width, columnPx - label));
}

function tokenizeSpans(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  shouldHyphenate: boolean,
  letterSpacingPx = 0,
  /** `MeasureBlockOptions.breakAfterDashes`. */
  dashBreaks = false,
  /** `MeasureBlockOptions.hyphenateCompounds === false`: the dictionary
   *  leaves the words of a compound whole. */
  keepCompounds = false,
  /** Whether the spans hold CJK characters (`hasCJK` of their text): only
   *  then is each word looked into. */
  cjkText = true,
): RichToken[] {
  const tokens: RichToken[] = [];
  // Which characters of the joined text sit in a compound, a word (across
  // runs: "*after*-dinner") with a hyphen between two letters.
  const inCompound = keepCompounds && shouldHyphenate ? compoundMask(spans) : undefined;
  let spanStart = 0;
  // Tracking: every character (spaces included) advances `letterSpacingPx`
  // more, exactly as canvas `letterSpacing` / CSS `letter-spacing` / PDF `Tc`
  // paint it, so measured widths stay in step with the renderers.
  const track = (text: string): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(text));
  /** The script fields of a span's tokens (font at the script size, shift). */
  const scriptFieldsOf = (span: InlineSpan): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift'> => {
    if (!span.script) return {};
    const base = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    const m = scriptMetrics(base, span.script);
    return { script: span.script, scriptFont: m.font, baselineShift: m.baselineShift };
  };
  const spanFont = (span: InlineSpan): string =>
    scriptFieldsOf(span).scriptFont ?? pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);

  for (const span of spans) {
    const spanBase = spanStart;
    spanStart += span.text.length;
    const atomic = atomicSpanToken(span, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
    if (atomic) {
      tokens.push(atomic);
      continue;
    }
    const font = spanFont(span);
    // A fixed space is set as text: no break, no justification glue.
    if (span.fixedSpace) {
      if (span.text.length > 0) {
        tokens.push({ text: span.text, bold: span.bold, italic: span.italic, kind: 'text', width: textWidth(span.text, font, false) + track(span.text) });
      }
      continue;
    }
    // Chinese marks (#193) ride on the span's words like its script.
    const marks = spanMarks(span, getMeasureWritingMode() === 'vertical-rl');
    const scriptFields = {
      ...scriptFieldsOf(span),
      ...(marks ? { cjkMarks: marks } : {}),
      ...(span.inserted ? { inserted: true } : {}),
    };
    // Small capitals: the words keep their case (hyphenation reads it) and
    // measure as they will be painted.
    const sc = !!span.smallCaps;
    const scFields = sc ? { smallCaps: true } : {};

    // Split on word boundaries while preserving spaces. Each word is
    // hyphenated on its own (the dictionary works word by word anyway), so
    // its soft hyphens can be told apart from the ones the source carries.
    // A no-break space is no boundary: it stays inside the word it glues
    // ("37 °C"), which the line then never breaks at (EF-66).
    const parts = span.text.match(WORDS_AND_SPACES_RE);
    if (!parts) continue;

    let partStart = spanBase;
    for (const part of parts) {
      const partAt = partStart;
      partStart += part.length;
      const isSpace = isBreakingSpaceRun(part);
      if (!isSpace && URL_LIKE_RE.test(part.replace(/\u00AD/g, ''))) {
        const clean = part.replace(/\u00AD/g, '');
        const breakPoints: RichBreakPoint[] = urlBreakIndices(clean).map((charIndex) => ({
          charIndex,
          widthBefore: textWidth(clean.slice(0, charIndex), font, sc) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(clean.slice(0, charIndex))),
        }));
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...scFields,
          kind: 'text',
          width: textWidth(clean, font, sc) + track(clean),
          ...(breakPoints.length > 0 ? { breakPoints, hyphenWidth: 0, bareBreaks: true } : {}),
        });
        continue;
      }
      const { clean, soft } = isSpace ? { clean: part, soft: [] } : syllabify(part, shouldHyphenate && inCompound?.[partAt] !== true);
      // The characters this word touches, for a dash that opens it
      // ("**riddles.**—I", "*\"no\"*—and"): the end of a word run just
      // before, no space in between.
      const before = tokens[tokens.length - 1];
      const touching = dashBreaks && before && before.kind === 'text' && !before.mathRender && !before.swatch && !before.chip
        ? before.text.slice(-2)
        : undefined;
      // A word that holds CJK characters: measured unit by unit, once each.
      const cjk = cjkText && !isSpace && hasCJK(clean) ? cjkWordBreaks(clean, font, sc, letterSpacingPx) : undefined;
      const breakPoints = isSpace ? [] : wordBreakPoints(clean, soft, font, letterSpacingPx, sc, dashBreaks, touching, cjk);
      if (breakPoints.length > 0) {
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...scFields,
          kind: 'text',
          width: cjk ? cjk.width : textWidth(clean, font, sc) + track(clean),
          breakPoints,
          hyphenWidth: measureTextWidth('-', font) + letterSpacingPx,
        });
      } else {
        tokens.push({
          text: part,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          ...(isSpace ? {} : scFields),
          kind: isSpace ? 'space' : 'text',
          width: textWidth(part, font, sc && !isSpace) + track(part),
        });
      }
    }
  }

  if (tokens.some((t) => t.script)) stackScriptTokens(tokens, normalFont, boldFont, italicFont, boldItalicFont);
  if (tokens.some((t) => t.chip)) {
    applyChipGaps(tokens, (t, run) => measureTextWidth(run, tokenFont(t, normalFont, boldFont, italicFont, boldItalicFont)) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(run)));
  }
  if (dashBreaks) markDashJoins(tokens);
  return tokens;
}

/** A run of words a dash break may read across: not a formula, a swatch,
 *  a chip or one of two stacked scripts. */
function isWordRun(t: RichToken | undefined): t is RichToken {
  return t !== undefined && t.kind === 'text' && !t.mathRender && !t.swatch && !t.chip && !t.stacked;
}

/** Flag `dashJoin` on each word run that ends on a closed dash (as
 *  `breaksAfterDash` reads it) touched by the next word run: the dash
 *  closes one run and the next one opens in another style ("riddles—*and*",
 *  "say—**that**"). A dash inside a run, or opening one, is a break point
 *  of its own word (see {@link wordBreakPoints}). */
function markDashJoins(tokens: RichToken[]): void {
  for (let t = 0; t + 1 < tokens.length; t++) {
    const a = tokens[t]!;
    const b = tokens[t + 1]!;
    if (!isWordRun(a) || !isWordRun(b) || a.refResourceId !== undefined) continue;
    const dash = a.text[a.text.length - 1];
    if (!isDash(dash)) continue;
    // The dash and the two characters before it, read back into the run
    // before when this one is shorter.
    const tail = (isWordRun(tokens[t - 1]) ? tokens[t - 1]!.text.slice(-2) : '') + a.text.slice(-3);
    if (breaksAfterDash(tail[tail.length - 2], dash!, b.text[0], tail[tail.length - 3])) a.dashJoin = true;
  }
}

/** Set every subscript and superscript that touch one over the other (see
 *  {@link stackedScriptPairs}): the first token of a pair advances nothing,
 *  the second the pair's advance; the subscript drops to its stacked
 *  position; neither keeps a break point, so the pair never parts. Words
 *  only: a script reference, or one in small capitals, sets as it is. */
function stackScriptTokens(
  tokens: RichToken[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): void {
  const scripts = tokens.map((t) => (
    t.kind === 'text' && t.script && !t.smallCaps && t.refResourceId === undefined && t.footnoteId === undefined && !t.chip && !t.mathRender && !t.swatch
      ? t.script
      : undefined
  ));
  for (const i of stackedScriptPairs(scripts)) {
    const pair = [tokens[i]!, tokens[i + 1]!];
    for (const t of pair) {
      delete t.breakPoints;
      delete t.hyphenWidth;
      delete t.bareBreaks;
    }
    const sub = pair[0]!.script === 'sub' ? pair[0]! : pair[1]!;
    sub.baselineShift = scriptMetrics(pickSpanFont(sub.bold, sub.italic, normalFont, boldFont, italicFont, boldItalicFont), 'sub', true).baselineShift;
    pair[1]!.width = Math.max(pair[0]!.width, pair[1]!.width);
    pair[0]!.width = 0;
    pair[0]!.stacked = 'first';
    pair[1]!.stacked = 'second';
  }
}

/** Ragged hyphenation: at most this many lines in a row end on a
 *  dictionary syllable (a "ladder" of hyphens down the edge). */
const MAX_RAGGED_HYPHEN_RUN = 2;

/** Width of the spaces a line's tokens end with (trimmed when it is set). */
function trailingSpaceWidth(tokens: RichToken[]): number {
  let w = 0;
  for (let k = tokens.length - 1; k >= 0 && tokens[k]!.kind === 'space'; k--) w += tokens[k]!.width;
  return w;
}

/** How many of a line's last tokens touch the next one with no space in
 *  between (two runs of one word, "**Nota**:"): the line may not break
 *  inside that group. */
function gluedTailLength(tokens: RichToken[]): number {
  let k = 0;
  for (let i = tokens.length - 1; i >= 0 && tokens[i]!.kind !== 'space'; i--) k++;
  return k;
}

/** A token the emergency division may cut: a word, not an atomic box nor
 *  one of two stacked scripts. */
function isDivisible(token: RichToken): boolean {
  return token.kind === 'text' && !token.mathRender && !token.swatch && !token.chip && token.refResourceId === undefined && token.footnoteId === undefined && !token.stacked;
}

/** Cut a word at one of its break points: the head ends the line (with
 *  `mark`, `markWidth` px wide, appended), the tail keeps the break points
 *  after the cut. */
function splitToken(token: RichToken, bp: RichBreakPoint, mark: string, markWidth: number): { head: RichToken; tail: RichToken } {
  const flags = { bold: token.bold, italic: token.italic, captionLabel: token.captionLabel, ...scriptOf(token) };
  const residual = (token.breakPoints ?? [])
    .filter((b) => b.charIndex > bp.charIndex)
    .map((b) => ({ ...b, charIndex: b.charIndex - bp.charIndex, widthBefore: b.widthBefore - bp.widthBefore }));
  return {
    head: { ...flags, text: token.text.slice(0, bp.charIndex) + mark, kind: 'text', width: bp.widthBefore + markWidth },
    tail: {
      ...flags,
      text: token.text.slice(bp.charIndex),
      kind: 'text',
      width: token.width - bp.widthBefore,
      ...(residual.length > 0 ? { breakPoints: residual, hyphenWidth: token.hyphenWidth } : {}),
      ...(token.bareBreaks ? { bareBreaks: true } : {}),
      ...(token.dashJoin ? { dashJoin: true } : {}),
    },
  };
}

/** `token` (the tail of a compound broken after its hyphen) opening with
 *  that hyphen repeated, `hyphenWidth` px wide; its break points move with
 *  it. */
function withLeadingHyphen(token: RichToken, hyphenWidth: number): RichToken {
  return {
    ...token,
    text: `-${token.text}`,
    width: token.width + hyphenWidth,
    ...(token.breakPoints
      ? { breakPoints: token.breakPoints.map((bp) => ({ ...bp, charIndex: bp.charIndex + 1, widthBefore: bp.widthBefore + hyphenWidth })) }
      : {}),
  };
}

/** The latest break inside a line's last `glued` tokens that adds nothing
 *  to the line — between ideographs, after a dash, a hard hyphen, a URL
 *  joint — with the token's position in the line. `join`: the break falls
 *  after that whole token, at a dash that closes it (`dashJoin`); the
 *  group's last token joins the token that did not fit. */
function lastPlainBreakInGroup(
  lineTokens: RichToken[],
  glued: number,
): { at: number; token: RichToken; bp: RichBreakPoint } | { at: number; join: true } | null {
  for (let at = lineTokens.length - 1; at >= lineTokens.length - glued; at--) {
    const token = lineTokens[at]!;
    if (token.dashJoin) return { at, join: true };
    const points = token.breakPoints ?? [];
    for (let k = points.length - 1; k >= 0; k--) {
      const bp = points[k]!;
      if (token.bareBreaks || bp.bare || bp.free) return { at, token, bp };
    }
  }
  return null;
}

/** The latest syllable (the dictionary's or the author's soft hyphen)
 *  inside a line's last `glued` tokens where the line, with the hyphen it
 *  adds, still fits `lineMaxWidth`, with the token's position in the
 *  line. */
function lastSyllableInGroup(lineTokens: RichToken[], glued: number, lineMaxWidth: number): { at: number; token: RichToken; bp: RichBreakPoint } | null {
  let before = 0;
  for (let k = 0; k < lineTokens.length - glued; k++) before += lineTokens[k]!.width;
  const widthsBefore: number[] = [];
  for (let at = lineTokens.length - glued; at < lineTokens.length; at++) {
    widthsBefore[at] = before;
    before += lineTokens[at]!.width;
  }
  for (let at = lineTokens.length - 1; at >= lineTokens.length - glued; at--) {
    const token = lineTokens[at]!;
    if (!isDivisible(token) || token.bareBreaks) continue;
    const points = token.breakPoints ?? [];
    for (let k = points.length - 1; k >= 0; k--) {
      const bp = points[k]!;
      if (bp.bare || bp.free || bp.greedyOnly) continue;
      if (widthsBefore[at]! + bp.widthBefore + (token.hyphenWidth ?? 0) <= lineMaxWidth) return { at, token, bp };
    }
  }
  return null;
}

/**
 * Measure a rich text block with mixed font weights.
 * Uses canvas measureText for per-token measurement and greedy line-breaking.
 * A text of nothing but whitespace, no-break spaces included, sets no line.
 */
export function measureRichBlock(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (plainText.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }
  return measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
}

/**
 * {@link measureRichBlock} for a paragraph of a table cell, or a piece of a
 * caption or a note: a text of nothing but no-break spaces sets a line of
 * them, as CommonMark reads a line holding U+00A0 (EF-154). Ordinary
 * whitespace, and a lone zero-width U+FEFF, still set none (see
 * {@link isBlankText}). The body keeps {@link measureRichBlock}'s rule, as
 * its parser drops such a paragraph too.
 */
export function measureRichSnippet(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (isBlankText(plainText)) {
    return { lines: [], totalHeight: 0 };
  }
  return measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
}

function measureRichText(
  spans: InlineSpan[],
  plainText: string,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): MeasuredBlock {
  // A writing mode asked for this text alone (`options.writingMode`): every
  // width below reads it.
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  // Vertical text: a short number inside a Latin sentence runs sideways
  // with it, read against the whole paragraph (#222).
  if (measuringVertically()) spans = sidewaysNumberSpans(spans, getMeasureUprightDigits(), getMeasureRegion());
  // Chinese, Japanese or Korean text: its own composer, which breaks
  // between characters under the document's line-break rules and spreads
  // justified lines between them — also text with no two CJK letters in a
  // row (价¥5,999。好, 第1条、第2条). A Latin paragraph that only quotes a
  // few CJK words stays here, with a break allowed next to their characters.
  // So is a paragraph with ruby or a warichu note (#194, #195), which the
  // composer alone lays out.
  // The paragraph is looked at for CJK text once (`cjkText`); a Latin one
  // then never looks into its words.
  const cjkText = hasCJK(plainText);
  if ((cjkText && composesAsCjk(plainText)) || spans.some((s) => s.ruby || s.warichu)) {
    return composeCjkParagraph(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const textAlign = options?.textAlign ?? 'left';
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const hyphenationZonePx = shouldHyphenate ? options?.hyphenationZonePx : undefined;
  const tokens = tokenizeSpans(spans, normalFont, boldFont, italicFont, boldItalicFont, shouldHyphenate, letterSpacingPx, options?.breakAfterDashes === true, options?.hyphenateCompounds === false, cjkText);
  if (options?.labelColumnPx !== undefined) setLabelTabs(tokens, (t) => t.labelTab, options.labelColumnPx, (t, w) => { t.width = w; });
  const repeatHyphen = options?.repeatHyphen === true;
  const hasSmallCaps = tokens.some((t) => t.smallCaps);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0;

  if (tokens.length === 0) {
    return { lines: [], totalHeight: 0 };
  }

  // Knuth-Plass optimal line breaking path. A Latin paragraph quoting CJK
  // words takes it too: the breaks next to their characters are free
  // penalties, as a hyphenation point that adds nothing. Ragged text takes
  // it too with `optimalRagged`: its word spaces keep their width and each
  // line gets the ragged stretch instead.
  const ragged = textAlign !== 'justify';
  if (options?.optimal && (!ragged || options.optimalRagged)) {
    const maxStretchRatio = ragged ? 1 : options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = ragged ? 1 : options.minShrinkRatio ?? 0.8;
    // The runt threshold counts word spaces on ragged text too.
    const spaceWidth = ragged ? normalSpaceWidthFor(normalFont) + letterSpacingPx : normalSpaceWidth;
    const items = richTokensToItems(tokens, spaceWidth, maxStretchRatio, minShrinkRatio, repeatHyphen);
    const lineWidthFn = (li: number) => {
      const isFirst = li === 0;
      const indent = indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
      return lineMeasure(maxWidthPx, options.restWidths, li) - indent;
    };
    const lineIndentFn = (li: number) => {
      const isFirst = li === 0;
      return indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
    };
    const runtPenalty = options.runtPenalty ?? 0;
    const runtMinWidth = runtPenalty > 0
      ? (options.runtMinCharacters ?? 0) * spaceWidth
      : 0;
    const trackingPerChar = ragged ? 0 : options.justifyTrackingPx ?? 0;
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth: spaceWidth,
      maxStretchRatio,
      minShrinkRatio,
      runtPenalty,
      runtMinWidth,
      runtGraded: options.runtGraded === true,
      ...(options.avoidHyphenAtLines ? { avoidHyphenAtLines: options.avoidHyphenAtLines } : {}),
      ...(options.keepBreaks?.path === 'rich' ? { fixedBreaks: options.keepBreaks.at } : {}),
      looseness: options.looseness ?? 0,
      lineWidthUniformFrom: uniformMeasureFrom(options.restWidths),
      trackingPerChar,
      ...(ragged ? { raggedStretch: raggedStretchPx(normalFont) } : {}),
      ...(ragged && hyphenationZonePx !== undefined ? { hyphenationZone: hyphenationZonePx } : {}),
    });
    if (breaks.length > 0) {
      const kpLines = reconstructRichLines(
        items, breaks, tokens, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
        trackingPerChar, lineBaselineOffset(lineHeightPx, normalFont),
      );
      if (!hasOverfullLine(kpLines, lineWidthFn, ragged)) {
        if (hasSmallCaps) expandSmallCaps(kpLines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
        return {
          lines: kpLines,
          totalHeight: kpLines.length * lineHeightPx,
          ...(isRuntLastLine(kpLines, runtMinWidth) ? { lastLineRunt: true } : {}),
          breaks: { path: 'rich', at: breaks },
        };
      }
    }
    // Fallback to greedy if K-P produced no breaks, or a line past the
    // measure (a word wider than it: the greedy breaker divides it)
  }

  const lines: VDTLine[] = [];
  const baselineOffset = lineBaselineOffset(lineHeightPx, normalFont);
  let y = 0;
  let tokenIdx = 0;
  let lineIndex = 0;
  // Lines in a row that ended on a dictionary syllable (ragged hyphenation).
  let syllableRun = 0;
  // The line before broke after a compound's hyphen, which this one repeats
  // (`repeatHyphen`).
  let repeatPending = false;

  while (tokenIdx < tokens.length) {
    const isFirstLine = lineIndex === 0;
    const lineIndent = indentPx > 0
      ? (hanging ? (isFirstLine ? 0 : indentPx) : (isFirstLine ? indentPx : 0))
      : 0;
    const lineMaxWidth = lineMeasure(maxWidthPx, options?.restWidths, lineIndex) - lineIndent;

    const lineTokens: RichToken[] = [];
    let lineWidth = 0;
    let lineHyphenated = false;
    let lineSyllable = false;
    // The line ends after a hyphen the word carries (EF-140).
    let lineHardHyphen = false;

    // Consume leading spaces at line start (skip them)
    while (tokenIdx < tokens.length && tokens[tokenIdx]!.kind === 'space') {
      tokenIdx++;
    }
    // The compound's hyphen, repeated: the tail it broke from opens the
    // line with it, measured.
    const lineRepeated = repeatPending && tokens[tokenIdx]?.kind === 'text';
    if (lineRepeated) {
      const tail = tokens[tokenIdx]!;
      tokens[tokenIdx] = withLeadingHyphen(tail, tail.hyphenWidth ?? measureTextWidth('-', tokenFont(tail, normalFont, boldFont, italicFont, boldItalicFont)) + letterSpacingPx);
    }
    repeatPending = false;
    // This line ends after a compound's hyphen the next one repeats.
    let lineRepeatNext = false;

    // Greedy: add tokens until we overflow
    while (tokenIdx < tokens.length) {
      const token = tokens[tokenIdx]!;

      if (lineWidth + token.width <= lineMaxWidth) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
        continue;
      }

      // Doesn't fit. Try to split at a break point (a soft hyphen, a hard
      // hyphen inside the word, a URL joint, a dash, between ideographs).
      if (token.kind === 'text' && token.breakPoints && token.breakPoints.length > 0) {
        const remaining = lineMaxWidth - lineWidth;
        const plainBreak = (bp: RichBreakPoint): boolean => token.bareBreaks === true || bp.bare === true || bp.free === true;
        const markW = (bp: RichBreakPoint): number => (plainBreak(bp) ? 0 : (token.hyphenWidth ?? 0));
        // Hyphenation zone (ragged text): a dictionary syllable is taken only
        // when the word, sent whole to the next line, would leave more than
        // the zone empty at the end of this one, and never on a third line
        // in a row. The word's own joints (a hard hyphen, a URL's, a dash),
        // breaks between ideographs and the author's soft hyphens are always
        // candidates.
        const syllables = hyphenationZonePx === undefined
          || (syllableRun < MAX_RAGGED_HYPHEN_RUN
            && lineMaxWidth - (lineWidth - trailingSpaceWidth(lineTokens)) > hyphenationZonePx);
        let chosen: RichBreakPoint | null = null;
        for (const bp of token.breakPoints) {
          if (!syllables && !plainBreak(bp) && !bp.author) continue;
          if (bp.widthBefore + markW(bp) <= remaining) chosen = bp;
          else break;
        }
        if (chosen) {
          const mark = plainBreak(chosen) ? '' : '-';
          const split = splitToken(token, chosen, mark, markW(chosen));
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          lineHyphenated = chosen.cjk !== true;
          lineSyllable = mark !== '' && !chosen.author;
          lineHardHyphen = chosen.bare === true;
          lineRepeatNext = repeatHyphen && chosen.bare === true && !token.bareBreaks;
          tokens[tokenIdx] = split.tail;
          break;
        }
      }

      // A word wider than the whole line: divide it rather than let it run
      // past the measure (syllable first, then character).
      if (lineTokens.length === 0 && isDivisible(token) && token.width > lineMaxWidth) {
        const font = tokenFont(token, normalFont, boldFont, italicFont, boldItalicFont);
        const split = emergencySplit(token, font, letterSpacingPx, lineMaxWidth);
        if (split) {
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          lineHyphenated = true;
          lineHardHyphen = split.hard === true;
          lineRepeatNext = repeatHyphen && split.hard === true && !token.bareBreaks;
          tokens[tokenIdx] = split.tail;
          break;
        }
      }

      // The token touches the line's last one with no space between (a word
      // set in two runs, a parenthesis before a bold word): the line may not
      // break there, except between two ideographs.
      const glued = token.kind !== 'space' ? gluedTailLength(lineTokens) : 0;
      if (glued > 0) {
        const prev = lineTokens[lineTokens.length - 1]!;
        const font = tokenFont(token, normalFont, boldFont, italicFont, boldItalicFont);
        if (token.stacked !== 'second' && token.footnoteId === undefined && token.refResourceId === undefined && cjkJoinBreaks(prev.text, token.text)) {
          // The line ends between two runs, next to a CJK character: no
          // space is consumed and nothing is added.
          break;
        }
        // The group's latest plain break (between ideographs, a dash, a
        // hard hyphen) ends the line: kinsoku keeps 。 off the next line's
        // start by taking the ideograph before it along.
        const back = lastPlainBreakInGroup(lineTokens, glued);
        if (back && 'join' in back) {
          // After the dash that closes a run: the runs after it go down.
          const keep = back.at + 1;
          tokenIdx -= lineTokens.length - keep;
          while (lineTokens.length > keep) lineWidth -= lineTokens.pop()!.width;
          lineHyphenated = true;
          break;
        }
        if (back) {
          const origIdx = tokenIdx - (lineTokens.length - back.at);
          while (lineTokens.length > back.at) lineWidth -= lineTokens.pop()!.width;
          const split = splitToken(back.token, back.bp, '', 0);
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          tokens[origIdx] = split.tail;
          tokenIdx = origIdx;
          lineHyphenated = back.bp.cjk !== true;
          lineHardHyphen = back.bp.bare === true;
          lineRepeatNext = repeatHyphen && back.bp.bare === true && !back.token.bareBreaks;
          break;
        }
        if (glued < lineTokens.length) {
          // Send the whole group down: the line ends at the space before it.
          for (let k = 0; k < glued; k++) lineWidth -= lineTokens.pop()!.width;
          tokenIdx -= glued;
          break;
        }
        // The group opens the line, so it is wider than the line: divide this
        // word at a syllable where the line ends.
        if (isDivisible(token)) {
          const split = emergencySplit(token, font, letterSpacingPx, lineMaxWidth - lineWidth, true);
          if (split) {
            lineTokens.push(split.head);
            lineWidth += split.head.width;
            lineHyphenated = true;
            lineHardHyphen = split.hard === true;
            lineRepeatNext = repeatHyphen && split.hard === true && !token.bareBreaks;
            tokens[tokenIdx] = split.tail;
            break;
          }
        }
        // Or at the last syllable of the group's own words, so the tail goes
        // down with what touches it: the full stop after **osmosis** never
        // opens a line alone (EF-73). When there is none, the line ends where
        // the runs meet, as before.
        const syllable = lastSyllableInGroup(lineTokens, glued, lineMaxWidth);
        if (syllable) {
          const origIdx = tokenIdx - (lineTokens.length - syllable.at);
          while (lineTokens.length > syllable.at) lineWidth -= lineTokens.pop()!.width;
          const split = splitToken(syllable.token, syllable.bp, '-', syllable.token.hyphenWidth ?? 0);
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          tokens[origIdx] = split.tail;
          tokenIdx = origIdx;
          lineHyphenated = true;
          lineSyllable = true;
          break;
        }
      }

      // Two stacked scripts never part (EF-80): the line ends before the
      // pair, or takes it whole when the pair opens it.
      if (token.stacked === 'second' && lineTokens[lineTokens.length - 1]?.stacked === 'first') {
        if (lineTokens.length > 1) {
          lineWidth -= lineTokens.pop()!.width;
          tokenIdx--;
        } else {
          lineTokens.push(token);
          lineWidth += token.width;
          tokenIdx++;
        }
        break;
      }

      // No viable split. If line is empty, force-fit this token; else break to next line.
      if (lineTokens.length === 0) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
      }
      break;
    }

    if (lineTokens.length === 0) break;
    syllableRun = lineSyllable ? syllableRun + 1 : 0;
    repeatPending = lineRepeatNext;

    // Trim trailing spaces from line tokens
    while (lineTokens.length > 0 && lineTokens[lineTokens.length - 1]!.kind === 'space') {
      lineWidth -= lineTokens[lineTokens.length - 1]!.width;
      lineTokens.pop();
    }

    // Check if this is the last line
    // Skip remaining leading spaces to check if there's more content
    let peekIdx = tokenIdx;
    while (peekIdx < tokens.length && tokens[peekIdx]!.kind === 'space') {
      peekIdx++;
    }
    const isLastLine = peekIdx >= tokens.length;

    // Build segments for justified rendering
    const segments: VDTLineSegment[] = trimChipLineEdges(lineTokens.map(tokenSegment));

    const lineText = lineTokens.map((t) => cleanSoftHyphens(t.text)).join('');
    const contentWidth = segments.reduce((sum, t) => sum + t.width, 0);

    const justifiedSpaceRatio = computeJustifiedSpaceRatio(
      segments,
      lineMaxWidth,
      normalSpaceWidth,
      textAlign,
      isLastLine,
    );

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, y, contentWidth, lineHeightPx),
      baseline: y + baselineOffset,
      hyphenated: lineHyphenated,
      ...(lineHyphenated && lineHardHyphen ? { hardHyphen: true } : {}),
      ...(lineRepeated && lineText.startsWith('-') ? { repeatedHyphen: true } : {}),
      segments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    y += lineHeightPx;
    lineIndex++;
  }

  if (hasSmallCaps) expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  return { lines, totalHeight: y };
}
