/**
 * 行取り (gyōdori, JLReq §2.2.5 a, §4.1.6): a heading that takes a whole
 * number of lines of the body grid, its text centred in them. "3行取り" is
 * a heading set in the room of three body lines: three characters of the
 * body size and the two line gaps between them, the heading's characters
 * centred across that band (`HeadingLevelConfig.lineSpan`).
 */

import { fontFamilyOf, lineBaselineOffset, measureCentralBaseline } from '../measure/vertical';

/** The band a heading of `lineCount` lines takes (px along the block
 *  axis), and how far below the band's top its first line box goes. */
export interface LineSpanBand {
  /** Body lines the band takes: the heading's `lineSpan`, or more when its
   *  lines need more room (the next whole number of lines). */
  lines: number;
  /** `lines` × the body line pitch. */
  height: number;
  /** Offset of the heading's first line box from the band's top. */
  shift: number;
}

/** Where the centre of the characters of a line `font` sets in a line box
 *  `boxPx` tall falls, from the box's top: its baseline less the font's
 *  ideographic centre above it. In vertical text that is the middle of the
 *  box; in horizontal text the baseline sits at 0.8 of the box, so the
 *  centre goes with the face and the size. */
function characterAxis(boxPx: number, font: string, sizePx: number): number {
  return lineBaselineOffset(boxPx, font) - measureCentralBaseline(fontFamilyOf(font)) * sizePx;
}

/**
 * The band of a 行取り heading: `span` body lines of `pitchPx` (more when
 * the heading's `lineCount` lines of `lineHeightPx` need them), with the
 * heading's characters centred across it. Centred means the middle of the
 * heading's characters (first line to last) meets the middle of the body
 * characters the band would hold (first line to last), so the heading sits
 * in the band as JLReq measures it, from the top of the first body
 * character to the foot of the last, not in its line boxes. The first line
 * box stays inside the band.
 */
export function headingLineSpanBand(
  span: number,
  lineCount: number,
  lineHeightPx: number,
  heading: { font: string; sizePx: number },
  body: { font: string; sizePx: number },
  pitchPx: number,
): LineSpanBand {
  const textHeight = lineCount * lineHeightPx;
  const lines = Math.max(span, Math.ceil((textHeight - 0.01) / pitchPx), 1);
  const height = lines * pitchPx;
  const bandCentre = characterAxis(pitchPx, body.font, body.sizePx) + ((lines - 1) * pitchPx) / 2;
  const textCentre = characterAxis(lineHeightPx, heading.font, heading.sizePx) + ((lineCount - 1) * lineHeightPx) / 2;
  const shift = Math.min(Math.max(0, bandCentre - textCentre), Math.max(0, height - textHeight));
  return { lines, height, shift };
}
