/**
 * Geometry of ruby readings (#194), warichu notes (#195) and kanbun
 * reading marks (#430) inside a line, for the CJK composer.
 *
 * Everything is in the flow frame: `dx` along the line from where the
 * annotated segment starts, `dy` across it from the line's baseline to the
 * annotation's baseline, positive towards the line's foot (down in
 * horizontal text, left in vertical text). A character's em box is centred
 * on the font's central axis, {@link CENTRAL} em above the baseline, the
 * axis vertical text is set on (`VDTFlowFrame.centralBaselines`) and the
 * middle of a CJK face's ideographic em box in horizontal text.
 *
 * - Ruby over or under the base sits in the line gap, against the base's em
 *   box, centred on the base; a reading wider than its base widens the base's
 *   box (the base is centred in it) less what it may pass the base by: a
 *   quarter of the ruby em onto a neighbour without ruby, none past a line
 *   edge (the composer shifts it back), and it keeps a quarter of the ruby
 *   em from a neighbour's reading (two zhuyin readings: a quarter of the
 *   symbols' em).
 * - Zhuyin right of the base (horizontal text) stacks its symbols in a
 *   column beside each character, at 60 % of the ruby size (0.3 em by
 *   default, clreq §5.5.3.2), the tone mark right of the column with half
 *   of its ink above the top of the last symbol (§5.5.3.3), the
 *   neutral-tone dot above the first in a tenth of an em; the character's
 *   box grows by the column. Zhuyin over the base of vertical text is the
 *   same column down the line, its tone mark and dot standing upright.
 *   Tone marks and the dot are placed by their ink (the measurer's ink
 *   box): fonts set these modifier letters high in their em box.
 * - A warichu note's part on a line folds into two rows of the note size,
 *   centred on the line's axis with no gap between them: the upper row
 *   takes characters until it is at least half the part (the second row is
 *   never the longer), and one more while the lower row would open with a
 *   mark that may not start a line or the upper row would end with one
 *   that may not end a line (an opening bracket).
 * - Kanbun marks (訓点, JIS X 4051 §5) go with the last character of
 *   their base, at half its size: the 返り点 right after it with its box
 *   against the line's foot side (the left half of a vertical line, the
 *   lower half of a horizontal one, §5.5), the 送り仮名 against its head
 *   side (right of vertical text, over horizontal text) from half-way
 *   along it, or right after a reading on that side (§5.6), the 竪点 a
 *   thin rule half an em long on the line's axis in the gap after the
 *   character (§5.7). Inline (the default) the room after the character
 *   is its own advance: the larger of the 返り点 and the 竪点, and as far
 *   as 送り仮名 reach (they never run beside the next character, §5.6.4).
 *   Interlinear, the 返り点 sit in the line gap beside the character's
 *   lower half and nothing takes advance.
 */

import type { VDTAnnotationRun, VDTKunten } from '../vdt';
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';
import { measureInkBox, measureTextWidth, onTextWidthCacheClear } from './canvas';
import { flowTextWidth, fontEm, measuringVertically } from './vertical';
import { graphemesOf } from './graphemes';
import { latinReadingLift } from './rubyLift';

/** The central axis of a face, in em above its baseline. */
export const CENTRAL = DEFAULT_CENTRAL_BASELINE;

/** Zhuyin is set at this fraction of the ruby size (0.3 em of the text for
 *  the default half-em ruby). */
export const ZHUYIN_SIZE_RATIO = 0.6;

const BOPOMOFO_RE = /[㄀-ㄯㆠ-ㆿ]/;
/** The zhuyin tone marks: ˊ ˇ ˋ (second to fourth tone), ˉ (first, rarely
 *  written) and the neutral-tone dot ˙. */
const TONE_MARKS = new Set(['ˊ', 'ˇ', 'ˋ', 'ˉ']);
const NEUTRAL_TONE = '˙';

/** Whether a reading is zhuyin (bopomofo). */
export function isZhuyin(reading: string): boolean {
  return BOPOMOFO_RE.test(reading);
}

/** `font` at `sizePx`, style, weight and family kept. */
export function withFontSize(font: string, sizePx: number): string {
  const m = /^(.*?)(\d*\.?\d+)px(\s*\/\s*[^\s]+)?\s+(.+)$/.exec(font);
  if (!m) return font;
  return `${m[1]}${sizePx}px ${m[4]}`;
}

/** The baseline, px from the line's baseline, of text of em `rowEm` whose
 *  em box is centred `axis` px from the line's baseline. */
function baselineOf(axis: number, rowEm: number): number {
  return axis + CENTRAL * rowEm;
}

/** What a ruby base is set with. */
export interface RubyInput {
  reading: string;
  fontString: string;
  /** `over` / `under` the base, or `right` of each character in the line
   *  (zhuyin, horizontal text). */
  position: 'over' | 'under' | 'right';
  /** The base's advance and the text's em (px). */
  baseWidth: number;
  em: number;
  /** How far the reading may pass the base's box on each side (px): a
   *  quarter of the ruby em onto a neighbour without ruby, 0 at a line
   *  edge, negative (keep apart) next to another reading. */
  allowLeft: number;
  allowRight: number;
}

/** How a ruby base is set: its box's advance, where the base sits in it
 *  (`inset`), the reading's advance and the runs painted. */
export interface RubyGeometry {
  width: number;
  inset: number;
  rtWidth: number;
  runs: VDTAnnotationRun[];
  /** What the reading could pass the box by on each side (the input's). */
  allowLeft: number;
  allowRight: number;
  /** Space after each base character, px, counted in `width`: a base of
   *  several characters spread 1:2:1 under a longer reading (Japanese
   *  ruby, `rubyJis.ts`). Unset: the base keeps its own spacing. */
  tracking?: number;
}

/** The baseline (`dy`) of a reading over or under its base, px from the
 *  line's baseline: against the base's em box, a Latin reading over the
 *  base lifted clear of the base (`rubyLift.ts`). */
export function readingBaseline(reading: string, fontString: string, position: 'over' | 'under', em: number): number {
  const rtEm = fontEm(fontString);
  const side = position === 'under' ? 1 : -1;
  const rtAxis = -CENTRAL * em + side * (em / 2 + rtEm / 2);
  const lift = side < 0 ? latinReadingLift(reading, fontString, em) : 0;
  return baselineOf(rtAxis, rtEm) - lift;
}

/** Gap between a base and its zhuyin column, in em of the text. */
const ZHUYIN_GAP_EM = 0.04;
/** The space the neutral-tone dot takes along the column, in em of the
 *  text (clreq §5.5.3.3: a tenth of the base). */
const NEUTRAL_SPACE_EM = 0.1;
/** Where the ink of a tone mark or of the neutral-tone dot is centred, in
 *  em above its baseline, when the measurer gives no ink box. */
const TONE_INK_MID_EM = 0.65;

const inkMids = new Map<string, number>();
onTextWidthCacheClear(() => inkMids.clear());

/** How far above its baseline the ink of `g` is centred in `font`, px. */
function inkMid(g: string, font: string): number {
  const key = `${font}\n${g}`;
  let mid = inkMids.get(key);
  if (mid === undefined) {
    const box = measureInkBox(g, font);
    mid = box && box.ascent + box.descent > 0 ? (box.ascent - box.descent) / 2 : TONE_INK_MID_EM * fontEm(font);
    inkMids.set(key, mid);
  }
  return mid;
}

/** The start (`dx`) of an upright cell of em `cellEm` on a vertical line
 *  whose glyph's ink is centred `mid` px above its baseline, for the ink
 *  to be centred `along` px down the line (see `VDTAnnotationRun.upright`:
 *  the cell's glyph stands on the font's central axis). */
function uprightCellAt(along: number, cellEm: number, mid: number): number {
  return along - cellEm / 2 - CENTRAL * cellEm + mid;
}

/**
 * The geometry of a ruby base (see the module comment). Measured in the
 * writing mode the composer runs in: a vertical reading advances cell by
 * cell down the line.
 */
export function rubyGeometry(input: RubyInput): RubyGeometry {
  const { reading, fontString, position, baseWidth, em, allowLeft, allowRight } = input;
  const allow = { allowLeft, allowRight };
  const rtEm = fontEm(fontString);
  const zhuyin = isZhuyin(reading);
  const axis = -CENTRAL * em;
  if (zhuyin) {
    const zEm = rtEm * ZHUYIN_SIZE_RATIO;
    const zFont = withFontSize(fontString, zEm);
    const graphemes = graphemesOf(reading);
    const symbols = graphemes.filter((g) => !TONE_MARKS.has(g) && g !== NEUTRAL_TONE);
    const tone = graphemes.find((g) => TONE_MARKS.has(g));
    const neutral = graphemes.includes(NEUTRAL_TONE);
    const dot = neutral ? NEUTRAL_SPACE_EM * em : 0;
    const runs: VDTAnnotationRun[] = [];
    if (position === 'right') {
      // A column right of the character, symbols stacked down it, the
      // column (the dot's space above it included) centred on the
      // character's axis.
      const x0 = baseWidth + ZHUYIN_GAP_EM * em;
      const n = Math.max(1, symbols.length);
      const start = axis - (n * zEm + dot) / 2;
      const top = start + dot;
      symbols.forEach((g, i) => {
        const w = measureTextWidth(g, zFont);
        runs.push({ text: g, dx: x0 + (zEm - w) / 2, dy: baselineOf(top + (i + 0.5) * zEm, zEm), fontString: zFont });
      });
      let width = x0 + zEm;
      if (tone) {
        // Right of the column, half of its ink above the last symbol's top.
        const tw = measureTextWidth(tone, zFont);
        runs.push({ text: tone, dx: x0 + zEm, dy: top + (n - 1) * zEm + inkMid(tone, zFont), fontString: zFont });
        width += tw;
      }
      if (neutral) {
        const nw = measureTextWidth(NEUTRAL_TONE, zFont);
        runs.push({ text: NEUTRAL_TONE, dx: x0 + (zEm - nw) / 2, dy: start + dot / 2 + inkMid(NEUTRAL_TONE, zFont), fontString: zFont });
      }
      return { width, inset: 0, rtWidth: width - baseWidth, runs, ...allow };
    }
    // Over or under the base. In vertical text (over is the right of the
    // column) the symbols make a column down the line beside the base, the
    // tone mark upright beside the column, half of its ink above the last
    // symbol's top, and the dot upright before the first symbol; in
    // horizontal text a row, the tone mark over (under) the right end of
    // the last symbol, half of it past the symbol.
    const vertical = measuringVertically();
    const text = symbols.join('');
    const rtWidth = flowTextWidth(text, zFont);
    const need = rtWidth - 2 * Math.min(allowLeft, allowRight);
    const width = Math.max(baseWidth, need);
    const inset = (width - baseWidth) / 2;
    const dx = (width - rtWidth) / 2;
    const side = position === 'under' ? 1 : -1;
    const rtAxis = axis + side * (em / 2 + zEm / 2);
    runs.push({ text, dx, dy: baselineOf(rtAxis, zEm), fontString: zFont });
    if (tone) {
      const tw = measureTextWidth(tone, zFont);
      const mid = inkMid(tone, zFont);
      if (vertical) {
        const lastTop = dx + (symbols.length > 0 ? rtWidth - flowTextWidth(symbols[symbols.length - 1]!, zFont) : 0);
        runs.push({ text: tone, dx: uprightCellAt(lastTop, zEm, mid), dy: baselineOf(rtAxis + side * (zEm / 2 + tw / 2), zEm), fontString: zFont, upright: true });
      } else {
        runs.push({ text: tone, dx: dx + rtWidth - tw / 2, dy: rtAxis + (side * zEm) / 2 + mid, fontString: zFont });
      }
    }
    if (neutral) {
      const mid = inkMid(NEUTRAL_TONE, zFont);
      if (vertical) {
        runs.push({ text: NEUTRAL_TONE, dx: uprightCellAt(dx - dot / 2, zEm, mid), dy: baselineOf(rtAxis, zEm), fontString: zFont, upright: true });
      } else {
        const nw = measureTextWidth(NEUTRAL_TONE, zFont);
        runs.push({ text: NEUTRAL_TONE, dx: dx - dot / 2 - nw / 2, dy: rtAxis + mid, fontString: zFont });
      }
    }
    return { width, inset, rtWidth, runs, ...allow };
  }
  const rtWidth = flowTextWidth(reading, fontString);
  const need = rtWidth - 2 * Math.min(allowLeft, allowRight);
  const width = Math.max(baseWidth, need);
  const inset = (width - baseWidth) / 2;
  // `right` outside zhuyin (pinyin asked right of horizontal text): over.
  const side = position === 'under' ? 1 : -1;
  const rtAxis = axis + side * (em / 2 + rtEm / 2);
  // A Latin reading over the base: its descenders clear the base (rubyLift.ts).
  const lift = side < 0 ? latinReadingLift(reading, fontString, em) : 0;
  return { width, inset, rtWidth, runs: [{ text: reading, dx: (width - rtWidth) / 2, dy: baselineOf(rtAxis, rtEm) - lift, fontString }], ...allow };
}

/**
 * The run of a footnote marker set in the line gap (`footnotes.markerPosition:
 * 'side'`, JLReq §4.2.3): `text` at `fontString` over the text — right of a
 * vertical line, above a horizontal one — against the em box of the text
 * (`em` px), as a ruby reading over its base. It ends where its segment
 * starts, the end of the character it marks (the marker's foot aligned with
 * the word's last character), and changes nothing in the line.
 */
export function sideMarkerRun(text: string, fontString: string, em: number): VDTAnnotationRun {
  const markEm = fontEm(fontString);
  const axis = -CENTRAL * em - (em / 2 + markEm / 2);
  return { text, dx: -flowTextWidth(text, fontString), dy: baselineOf(axis, markEm), fontString };
}

/** The advance of a reading along the line (a zhuyin reading: its
 *  symbols' column, tone marks aside), before its base is sized. */
export function readingAdvance(reading: string, fontString: string, position: 'over' | 'under' | 'right'): number {
  if (!isZhuyin(reading)) return flowTextWidth(reading, fontString);
  const zEm = fontEm(fontString) * ZHUYIN_SIZE_RATIO;
  if (position === 'right') return zEm;
  const symbols = graphemesOf(reading).filter((g) => !TONE_MARKS.has(g) && g !== NEUTRAL_TONE).join('');
  return flowTextWidth(symbols, withFontSize(fontString, zEm));
}

/** What a character with kanbun marks is set with (see the module
 *  comment). Lengths are px along the line, from where its unit starts. */
export interface KuntenInput {
  kaeri?: string;
  okuri?: string;
  tate?: boolean;
  /** The marks' font (at their size) and colour. */
  fontString: string;
  color?: string;
  placement: 'inline' | 'interlinear';
  /** The text's em, px. */
  em: number;
  /** Where the character ends, and the unit's advance so far. */
  baseEnd: number;
  width: number;
  /** Where a ruby reading over (right of vertical text) or under the base
   *  ends, if it has one on that side. */
  readingOverEnd?: number;
  readingUnderEnd?: number;
}

/** Thickness of a 竪点, in em of the text (a thin rule, JIS X 4051 §5.7). */
const TATE_STROKE_EM = 0.06;

/**
 * The marks of a character with kanbun marks, and the advance they add
 * after its unit (0 when they are set interlinear). Measured in the
 * writing mode the composer runs in: down a vertical line each mark is an
 * upright cell.
 */
export function kuntenGeometry(input: KuntenInput): { extra: number; kunten: VDTKunten } {
  const { em, baseEnd, fontString } = input;
  const kEm = fontEm(fontString);
  const inline = input.placement === 'inline';
  const axis = -CENTRAL * em;
  const runs: VDTKunten['runs'] = [];
  let advance = 0;
  if (input.kaeri) {
    // The 返り点, one run per mark (a combined form such as 一レ is the
    // mark and the レ after it), along the line from the character's end
    // (inline), or ending with it in the line gap (interlinear, after a
    // reading on that side).
    let at = inline ? baseEnd : Math.max(baseEnd - kEm, input.readingUnderEnd ?? -Infinity);
    const start = at;
    const dy = baselineOf(inline ? axis + em / 2 - kEm / 2 : axis + em / 2 + kEm / 2, kEm);
    for (const g of graphemesOf(input.kaeri)) {
      runs.push({ text: g, dx: at, dy, fontString, role: 'kaeri' });
      at += flowTextWidth(g, fontString);
    }
    if (inline) advance = at - start;
  }
  let tate: VDTKunten['tate'];
  if (input.tate) {
    const thickness = Math.max(0.5, TATE_STROKE_EM * em);
    if (inline) {
      // Half an em of its own, unless the 返り点 beside it take more; the
      // rule is centred in the gap.
      advance = Math.max(advance, em / 2);
      tate = { dx: baseEnd + (advance - em / 2) / 2, dy: axis, length: em / 2, thickness };
    } else {
      // No gap: a short rule across the two characters' meeting point.
      tate = { dx: baseEnd - em / 8, dy: axis, length: em / 4, thickness };
    }
  }
  let reach = baseEnd + advance;
  if (input.okuri) {
    // From half-way along the character, or right after a reading on the
    // same side (§5.6.3).
    const dx = Math.max(baseEnd - em / 2, input.readingOverEnd ?? -Infinity);
    runs.push({ text: input.okuri, dx, dy: baselineOf(axis - em / 2 - kEm / 2, kEm), fontString, role: 'okuri' });
    reach = Math.max(reach, dx + flowTextWidth(input.okuri, fontString));
  }
  const kunten: VDTKunten = {
    ...(input.kaeri ? { kaeri: input.kaeri } : {}),
    ...(input.okuri ? { okuri: input.okuri } : {}),
    fontString,
    ...(input.color ? { color: input.color } : {}),
    runs,
    ...(tate ? { tate } : {}),
  };
  return { extra: inline ? Math.max(0, reach - input.width) : 0, kunten };
}

/** Where the upper row of a warichu part ends (units `[0, at)`): see the
 *  module comment. `startProhibited[i]`: unit `i` may not open a row;
 *  `endProhibited[i]`: unit `i` may not close one (an opening bracket), so
 *  the upper row takes the unit after it too. */
export function splitNote(widths: readonly number[], startProhibited: readonly boolean[], endProhibited?: readonly boolean[]): number {
  const n = widths.length;
  let total = 0;
  for (const w of widths) total += w;
  let prefix = 0;
  let at = 0;
  while (at < n && prefix < total / 2 - 1e-9) prefix += widths[at++]!;
  while (at < n && (startProhibited[at] || (at > 0 && endProhibited?.[at - 1]))) prefix += widths[at++]!;
  return at;
}

/** The advance of a warichu part folded at `at`: the wider row. */
export function foldWidth(widths: readonly number[], at: number): number {
  let upper = 0;
  let lower = 0;
  widths.forEach((w, i) => {
    if (i < at) upper += w;
    else lower += w;
  });
  return Math.max(upper, lower);
}

/** The baselines of a warichu part's rows (px from the line's baseline):
 *  the upper row's em box ends at the line's axis, the lower one's starts
 *  there. */
export function noteRowBaselines(em: number, noteEm: number): { upper: number; lower: number } {
  const axis = -CENTRAL * em;
  return { upper: baselineOf(axis - noteEm / 2, noteEm), lower: baselineOf(axis + noteEm / 2, noteEm) };
}
