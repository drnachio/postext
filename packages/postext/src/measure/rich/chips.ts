// Inline chips as tokens: their face, readings, the gaps beside them and
// their margins (#1276: split out of rich.ts).
import type { VDTChipRun, VDTAnnotationRun } from '../../vdt.js';
import { uprightFace } from '../../writing/uprightArabic.js';
import type { InlineSpan } from '../../parse/index.js';
import { measureTextWidth } from '../canvas.js';
import { quoteFamily } from '../font.js';
import { splitAtFontSize, findPxSize } from '../fontString.js';
import { measuresRunsAsPainted, directChipRuns, paintedRunWidth } from '../../design/bidiText.js';
import { graphemeCount } from '../graphemes.js';
import { CENTRAL } from '../cjk/cjkAnnotate.js';
import { NO_BREAK_SPACES } from '../spaces.js';
import { wordLetterSpacing } from '../rtl/joining.js';
import { type RichToken, pickSpanFont, scriptMetrics, smallCapsRuns, smallCapsFont, stackedScriptPairs } from './tokens.js';

/** The text band of a chip box around the baseline, as fractions of the
 *  chip's font size: from the ascenders down past the descenders; the
 *  vertical padding and border grow it. */
export const CHIP_ASCENT_RATIO = 0.8;
export const CHIP_DESCENT_RATIO = 0.25;

/** `font` set in `family` (when given) at `sizePx`: the style and weight
 *  words of the CSS shorthand are kept. */
export function withFace(font: string, family: string | undefined, sizePx: number): string {
  const m = splitAtFontSize(font);
  if (!m) return font;
  return `${m.prefix}${sizePx}px ${family ? quoteFamily(family) : m.family}`;
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
  const sizeMatch = findPxSize(normalFont);
  const sizePx = box?.fontSizePx ?? (sizeMatch ? parseFloat(sizeMatch.value) : 16);
  const runs: VDTChipRun[] = [];
  // The script of each run, and the unscaled font of a subscript's (which
  // drops further when a superscript is stacked over it).
  const runScripts: ('sup' | 'sub' | undefined)[] = [];
  const runBaseFonts: string[] = [];
  // The ruby of each run's span, for its reading (#1244).
  const runRubies: (InlineSpan['ruby'] | undefined)[] = [];
  // An upright chip (an exercise's number, #1244) takes the slant off the
  // text's faces too.
  const face = (bold: boolean, italic: boolean): string => {
    const f = pickSpanFont(bold, italic, normalFont, boldFont, italicFont, boldItalicFont);
    return chip.upright ? uprightFace(f) : f;
  };
  for (const s of chip.spans) {
    if (s.text.length === 0) continue;
    const bold = s.bold || span.bold || !!box?.bold;
    const italic = !chip.upright && (s.italic || span.italic || !!box?.italic);
    // A word the chip's face has no letters for keeps the text's (#845).
    const base = withFace(face(bold, italic), s.textFace ? undefined : box?.fontFamily, sizePx);
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
        // A run of a joining script takes no tracking (`measure/rtl/joining.ts`).
        width: measureTextWidth(piece.text, piece.font) + wordLetterSpacing(piece.text, letterSpacingPx) * graphemeCount(piece.text),
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
        ...(baselineShift !== undefined ? { baselineShift } : {}),
      });
      runScripts.push(smallCaps ? undefined : s.script);
      runBaseFonts.push(base);
      runRubies.push(s.ruby);
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
  // Right-to-left runs cut where the direction changes, and their order
  // (`VDTChip.order`).
  // In a document shaped in its own language each is as wide as it is
  // painted, in its own direction, and the chip as wide as its runs (#770,
  // `measuresRunsAsPainted`).
  const asPainted = measuresRunsAsPainted();
  const directed = directChipRuns(
    runs,
    (t, f, rtl) => (asPainted ? paintedRunWidth(t, f, rtl) : measureTextWidth(t, f)) + wordLetterSpacing(t, letterSpacingPx) * graphemeCount(t),
    asPainted,
    box?.direction,
  );
  const textWidth = (asPainted ? directed.runs : runs).reduce((sum, r) => sum + r.width, 0);
  const ownPaddingX = box?.paddingXPx ?? 0;
  const paddingY = box?.paddingYPx ?? 0;
  // A style may pad the top and the bottom apart (EF-172).
  const paddingTop = box?.paddingTopPx ?? paddingY;
  const paddingBottom = box?.paddingBottomPx ?? paddingY;
  const borderWidth = box?.borderWidthPx ?? 0;
  // A box as wide as another text (an exercise's longest answer) or a
  // least width (#1227) widens its padding evenly: the text stays centred.
  const widthTextPx = chip.widthText
    ? measureTextWidth(chip.widthText, withFace(face(span.bold || !!box?.bold, !chip.upright && (span.italic || !!box?.italic)), box?.fontFamily, sizePx))
    : 0;
  // The readings of its ruby words, which the box is at least as wide as.
  const readings = chipReadings(runs, runRubies, withFace(normalFont, box?.fontFamily, sizePx / 2), sizePx, textWidth);
  const readingsWidth = readings.length > 0 ? Math.max(...readings.map((r) => r.dx + r.width)) - Math.min(...readings.map((r) => r.dx)) : 0;
  const inner = Math.max(textWidth, widthTextPx, readingsWidth, (box?.minWidthPx ?? 0) - (ownPaddingX + borderWidth) * 2);
  const paddingX = ownPaddingX + (inner - textWidth) / 2;
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
      runs: directed.runs,
      ...(directed.order ? { order: directed.order } : {}),
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
      ...(box?.dotted ? { dotted: box.dotted } : {}),
      ...(box?.underline ? { underline: box.underline } : {}),
      ...(chip.blank ? { blank: true as const, ...(chip.blankLabel ? { blankLabel: chip.blankLabel } : {}) } : {}),
      // Across the line, each reading's em box clears the chip's own box
      // (its padding and border too, which a boxed blank has a lot of): over
      // it, or under it, and right of a vertical line, as the box is turned.
      ...(readings.length > 0 ? {
        readings: readings.map(({ width, under, ...r }) => {
          void width;
          const rtEm = sizePx / 2;
          const axis = under ? descent + READING_GAP_EM * sizePx + rtEm / 2 : -(ascent + READING_GAP_EM * sizePx + rtEm / 2);
          return { ...r, dx: r.dx + borderWidth + paddingX, dy: axis + CENTRAL * rtEm };
        }),
      } : {}),
      ...(chip.exercise ? { exercise: chip.exercise } : {}),
      ...(chip.joinNext ? { joinNext: true } : {}),
      // The words' source (#857), while the runs read as written.
      ...(chip.sourceOffsets && directed.runs.reduce((n, r) => n + r.text.length, 0) === chip.sourceOffsets.length ? { sourceOffsets: chip.sourceOffsets } : {}),
    },
    chipGap: box?.gapPx ?? 0,
  };
}

/** The room between a chip's box and its readings, in ems of the chip. */
const READING_GAP_EM = 0.06;

/** The readings of a chip's ruby words (`VDTChip.readings`, #1244), at
 *  half the chip's size, from where its text starts (their place across
 *  the line is set once the box is): a group ruby's over
 *  its whole base, a per-character one over its character; readings that
 *  would touch are set a quarter of their em apart and centred, as a row,
 *  over the text (`textWidth`) — a blank hides its characters, so the
 *  pinyin of 看拼音写词语 reads as a word. */
function chipReadings(runs: VDTChipRun[], rubies: (InlineSpan['ruby'] | undefined)[], font: string, sizePx: number, textWidth: number): Array<VDTAnnotationRun & { width: number; under: boolean }> {
  const out: Array<VDTAnnotationRun & { width: number; under: boolean }> = [];
  let x = 0;
  for (let i = 0; i < runs.length; ) {
    const ruby = rubies[i];
    let j = i + 1;
    let w = runs[i]!.width;
    // A group ruby's characters (or one written over several runs) share
    // one reading.
    while (ruby?.group && j < runs.length && rubies[j]?.id === ruby.id) w += runs[j++]!.width;
    if (ruby && ruby.text) {
      const rt = measureTextWidth(ruby.text, font);
      out.push({ text: ruby.text, dx: x + (w - rt) / 2, dy: 0, fontString: font, width: rt, under: ruby.position === 'under' });
    }
    x += w;
    i = j;
  }
  if (out.length < 2) return out;
  const apart = (sizePx / 2) * 0.25;
  let moved = false;
  for (let k = 1; k < out.length; k++) {
    const least = out[k - 1]!.dx + out[k - 1]!.width + apart;
    if (out[k]!.dx < least) { out[k]!.dx = least; moved = true; }
  }
  if (moved) {
    const shift = (textWidth - (out[out.length - 1]!.dx + out[out.length - 1]!.width - out[0]!.dx)) / 2 - out[0]!.dx;
    for (const r of out) r.dx += shift;
  }
  return out;
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
export function applyChipGaps(tokens: RichToken[], noBreakWidth: (token: RichToken, run: string) => number): void {
  for (let i = 0; i < tokens.length; i++) {
    const space = tokens[i]!;
    // A tab makes its own room (#622), and a space inside inline code is
    // the code's own.
    if (space.kind !== 'space' || space.tab || space.fixedGlue) continue;
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
