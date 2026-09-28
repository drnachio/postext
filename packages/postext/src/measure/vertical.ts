/**
 * Measurement in vertical text (`layout.writingMode: 'vertical-rl'`).
 *
 * A vertical line is measured as a horizontal one in the turned flow frame
 * (see `VDTPage.flow`): a Latin word or number set sideways keeps its
 * horizontal advance, and every character that stands in a cell of its
 * own (Han, punctuation, dashes, ellipses: see `verticalOrientation`)
 * advances one em down the line, whatever its horizontal width — a
 * proportional dash or interpunct included. {@link cellAdvance} is the one
 * place the composer asks for a character's advance, per writing mode, so
 * other width rules (punctuation compression) can feed it later.
 */

import type { WritingMode } from '../types';
import { measureTextWidth, measureInkBox, onTextWidthCacheClear } from './canvas';
import { isVerticalCell } from '../writingMode';
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

let measureWritingMode: WritingMode = 'horizontal-tb';

/** Set the writing mode text is measured in (the build does, from the
 *  layout of the pages it is placing; a styled section may change it). */
export function setMeasureWritingMode(mode: WritingMode): void {
  measureWritingMode = mode === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb';
}

/** The writing mode text is measured in (see {@link setMeasureWritingMode});
 *  horizontal until a build sets another. */
export function getMeasureWritingMode(): WritingMode {
  return measureWritingMode;
}

/** The em of a font string (its size in px), 16 when it names none. */
export function fontEm(font: string): number {
  const m = FONT_SIZE_RE.exec(font);
  return m ? parseFloat(m[1]!) : 16;
}

/**
 * The advance of one CJK grapheme along its line (`class` is its line-break
 * class, unused for now: a hook for punctuation widths). Horizontal: its
 * measured width. Vertical: one em for every character that stands in a
 * cell of its own; a character set sideways keeps its horizontal width.
 */
export function cellAdvance(grapheme: string, font: string, vertical: boolean): number {
  if (vertical && isVerticalCell(grapheme)) return fontEm(font);
  return measureTextWidth(grapheme, font);
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
 * from the ink of 國 (a character that fills its em box) at 100 px — the
 * centre of its ink is the centre of the em box within a few hundredths of
 * an em in every CJK face tried — and kept between 0.25 and 0.5 em; a
 * measurer with no ink metrics, or a face without the character, gives
 * {@link DEFAULT_CENTRAL_BASELINE}.
 */
export function measureCentralBaseline(family: string): number {
  const hit = centralCache.get(family);
  if (hit !== undefined) return hit;
  let value = DEFAULT_CENTRAL_BASELINE;
  const box = measureInkBox('國', `100px ${/^[\w -]+$/.test(family) && !/^\d/.test(family) ? family : JSON.stringify(family)}`);
  if (box && box.ascent + box.descent > 60) {
    const centre = (box.ascent - box.descent) / 2 / 100;
    if (centre >= 0.25 && centre <= 0.5) value = Math.round(centre * 1000) / 1000;
  }
  centralCache.set(family, value);
  return value;
}

onTextWidthCacheClear(clearCentralBaselineCache);
