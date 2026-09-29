/**
 * Measurement in vertical text (`layout.writingMode: 'vertical-rl'`).
 *
 * A vertical line is measured as a horizontal one in the turned flow frame
 * (see `VDTPage.flow`), cut into the runs the renderers paint
 * (`verticalRuns`): a Latin word or number set sideways keeps its
 * horizontal advance, and every character that stands in a cell of its own
 * (Han, Chinese punctuation, dashes, ellipses, and the symbols Unicode sets
 * upright — × © ± ℃ ① —, inside a Latin word or number too) advances its
 * cell down the line, whatever its horizontal width. {@link cellAdvance} is
 * the one place a cell's advance is decided; the composer then applies the
 * punctuation widths (`cjkPunctuation.ts`: compression, line-edge trims,
 * hanging, the Han–Latin space) to the cells as it does to horizontal
 * advances, along the line. {@link verticalTextWidth} measures any run of
 * text with it.
 */

import type { CjkRegion, WritingMode } from '../types';
import type { CjkClass } from './cjkClasses';
import { measureTextWidth, measureInkBox, onTextWidthCacheClear } from './canvas';
import { isVerticalCell, verticalCellEms, verticalRuns, type UprightDigits } from '../writingMode';
import { graphemesOf } from './graphemes';
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

let measureWritingMode: WritingMode = 'horizontal-tb';
let measureRegion: CjkRegion = 'mainland';
let measureUprightDigits: UprightDigits = 2;

/** Set the writing mode text is measured in, and the Chinese region whose
 *  cells it uses (the mainland interpunct takes half a cell). The build
 *  does, from the layout of the pages it is placing (a styled section may
 *  change it), and puts back what it found when it is done. */
export function setMeasureWritingMode(mode: WritingMode, region: CjkRegion = measureRegion): void {
  measureWritingMode = mode === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb';
  measureRegion = region;
}

/** The writing mode text is measured in (see {@link setMeasureWritingMode});
 *  horizontal outside a build. */
export function getMeasureWritingMode(): WritingMode {
  return measureWritingMode;
}

/** Set how many ASCII digits a number may have to be set in one upright
 *  cell in vertical text (`cjk.uprightDigits`; 0: none). The build does,
 *  from the document's configuration, and puts back what it found. */
export function setMeasureUprightDigits(digits: UprightDigits): void {
  measureUprightDigits = digits;
}

/** See {@link setMeasureUprightDigits}; 2 outside a build. */
export function getMeasureUprightDigits(): UprightDigits {
  return measureUprightDigits;
}

/** The Chinese region vertical cells are measured for. */
export function getMeasureRegion(): CjkRegion {
  return measureRegion;
}

/** Whether text is measured vertically now. */
export function measuringVertically(): boolean {
  return measureWritingMode === 'vertical-rl';
}

/** Run `fn` with text measured in `mode` (and `region`), then put back the
 *  mode in force before — also when `fn` throws. */
export function withMeasureWritingMode<T>(mode: WritingMode, fn: () => T, region: CjkRegion = measureRegion): T {
  const prevMode = measureWritingMode;
  const prevRegion = measureRegion;
  if (prevMode === mode && prevRegion === region) return fn();
  setMeasureWritingMode(mode, region);
  try {
    return fn();
  } finally {
    measureWritingMode = prevMode;
    measureRegion = prevRegion;
  }
}

/** The em of a font string (its size in px), 16 when it names none. */
export function fontEm(font: string): number {
  const m = FONT_SIZE_RE.exec(font);
  return m ? parseFloat(m[1]!) : 16;
}

/**
 * The advance of one CJK grapheme along its line. Horizontal: its measured
 * width. Vertical: its cell for every character that stands in one (one
 * em; half an em for the mainland interpunct, `verticalCellEms`); a
 * character set sideways keeps its horizontal width. `cls` is the
 * grapheme's line-break class, when the caller has it. This is a mark's
 * full advance: the composition takes its blank off afterwards
 * (`punctuationBox`), in either writing mode.
 */
export function cellAdvance(grapheme: string, font: string, vertical: boolean, cls?: CjkClass): number {
  if (vertical && isVerticalCell(grapheme)) return fontEm(font) * verticalCellEms(grapheme, measureRegion, cls);
  return measureTextWidth(grapheme, font);
}

/**
 * The advance of `text` along a vertical line: its sideways runs at
 * `measureRun`'s width (the horizontal one), each cell at
 * {@link cellAdvance}. The same runs the renderers paint
 * (`verticalRuns`), so what is measured is what is painted. Text with no
 * cell is one sideways run: `measureRun(text)`.
 */
export function verticalTextWidth(text: string, font: string, measureRun: (run: string) => number = (run) => measureTextWidth(run, font)): number {
  let width = 0;
  for (const run of verticalRuns(graphemesOf(text), measureRegion, measureUprightDigits)) {
    width += run.cell === undefined ? measureRun(run.text) : run.glyph.orient === 'tcy' ? fontEm(font) : cellAdvance(run.text, font, true);
  }
  return width;
}

/** How many times tracking follows the characters of `text` in a vertical
 *  line: once per grapheme, a number set in one cell (tate-chu-yoko)
 *  counting as one. */
export function verticalTrackCount(text: string): number {
  let n = 0;
  for (const run of verticalRuns(graphemesOf(text), measureRegion, measureUprightDigits)) {
    n += run.glyph.orient === 'tcy' ? 1 : graphemesOf(run.text).length;
  }
  return n;
}

/**
 * The advance of text painted in the page's flow (design text, list
 * markers, contents rows, box titles): `measureTextWidth`, except in
 * vertical text, where what stands in a cell advances its cell
 * ({@link verticalTextWidth}), as the renderers paint it. ASCII text reads
 * the same either way.
 */
export function flowTextWidth(text: string, font: string): number {
  // eslint-disable-next-line no-control-regex
  if (measureWritingMode === 'vertical-rl' && (/[^\u0000-\u007F]/.test(text) || (measureUprightDigits > 0 && /[0-9]/.test(text)))) return verticalTextWidth(text, font);
  return measureTextWidth(text, font);
}

/** A font string's first family, unquoted: the key of
 *  `VDTFlowFrame.centralBaselines`. */
export function fontFamilyOf(font: string): string {
  const m = FONT_SIZE_RE.exec(font);
  const rest = (m ? font.slice(m.index + m[0].length) : font).replace(/^\s*(\/\s*\S+\s*)?/, '');
  const first = rest.split(',')[0]!.trim();
  return first.length >= 2 && /^["']/.test(first) && first.endsWith(first[0]!) ? first.slice(1, -1) : first;
}

const centralCache = new Map<string, number>();

/** Drop the measured axes (fonts changed). */
export function clearCentralBaselineCache(): void {
  centralCache.clear();
}

/**
 * Where the ideographic em box's centre sits above the alphabetic baseline
 * of `family`, in ems: the axis upright characters are centred on. Read
 * from the ink of 中 at 100 px, whose long stroke runs the height of the
 * em box: the centre of its ink is the centre of the box within a few
 * hundredths of an em (0.380 in Noto Serif and Sans SC and TC, whose box
 * centre is 0.38; 0.357 in LXGW WenKai) — and every Chinese, Japanese and
 * Korean face has the character, where a face for one script lacks the
 * other's (國 is not in a Simplified Chinese font: the canvas measured a
 * fallback face's, 0.04 em off). Kept between 0.25 and 0.5 em; a measurer
 * with no ink metrics gives {@link DEFAULT_CENTRAL_BASELINE}.
 */
export function measureCentralBaseline(family: string): number {
  const hit = centralCache.get(family);
  if (hit !== undefined) return hit;
  let value = DEFAULT_CENTRAL_BASELINE;
  const box = measureInkBox('中', `100px ${/^[\w -]+$/.test(family) && !/^\d/.test(family) ? family : JSON.stringify(family)}`);
  if (box && box.ascent + box.descent > 60) {
    const centre = (box.ascent - box.descent) / 2 / 100;
    if (centre >= 0.25 && centre <= 0.5) value = Math.round(centre * 1000) / 1000;
  }
  centralCache.set(family, value);
  return value;
}

onTextWidthCacheClear(clearCentralBaselineCache);

/**
 * How far below the top of its line box a line of `font` has its baseline,
 * for a line box `lineHeightPx` tall. Horizontal text: 0.8 of the line
 * height, as it always was. Vertical text: the line box runs down the
 * column and its height is the pitch across it, and the characters stand
 * centred on the font's central axis ({@link measureCentralBaseline}), so
 * the baseline goes where that axis falls in the middle of the box: a
 * column of characters in the middle of its pitch, as CSS sets a vertical
 * line and as a rule drawn between two columns expects. `font`'s family
 * and size decide the axis; the renderers turn each character about the
 * same one (`VDTFlowFrame.centralBaselines`).
 */
export function lineBaselineOffset(lineHeightPx: number, font: string): number {
  if (measureWritingMode !== 'vertical-rl') return lineHeightPx * 0.8;
  return lineHeightPx / 2 + measureCentralBaseline(fontFamilyOf(font)) * fontEm(font);
}
