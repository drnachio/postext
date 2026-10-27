// Segment positions and fonts, mark sizes and grapheme advances
// (#1278: split out of cjkMarks.ts).
import type { VDTBlock, VDTLine, VDTLineSegment } from '../../vdt.js';
import type { CjkRegion } from '../../types.js';
import { lineTrailingTracking, lineInkExtent } from '../../paint/lineInk.js';
import { measureTextWidth } from '../../measure/canvas.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { isCjkGrapheme } from '../../measure/cjk/cjkClasses.js';
import { fontEm } from '../../measure/vertical.js';
import { verticalRuns } from '../../writing/writingMode.js';

/** What a block contributes to its lines' painting. */
export type BlockLike = Pick<VDTBlock, 'bbox' | 'textAlign' | 'letterSpacing' | 'fontString' | 'boldFontString' | 'italicFontString' | 'boldItalicFontString'>;

/**
 * Where the renderers paint each segment of a line: its x (absolute, in
 * the flow frame) and the advance they give it — a word space of a
 * justified line its share of the slack, a centred or right-aligned line
 * shifted by its slack. Mirrors the line painters of the canvas, PDF and
 * HTML backends.
 */
export function segmentPositions(line: VDTLine, block: BlockLike): { xs: number[]; widths: number[] } {
  const segments = line.segments ?? [];
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = block.bbox.width - lineIndent;
  let start = line.bbox.x;
  let justified: number | undefined;
  if (block.textAlign === 'justify') {
    let wordWidth = 0;
    let natural = 0;
    let spaces = 0;
    for (const seg of segments) {
      if (seg.hangs) continue;
      if (seg.kind === 'space' && !seg.autospace) spaces++;
      else wordWidth += seg.width;
      natural += seg.width;
    }
    if (spaces > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || natural > effectiveWidth)) justified = (effectiveWidth - wordWidth) / spaces;
  } else if (block.textAlign === 'center' || block.textAlign === 'right') {
    const trailing = lineTrailingTracking(line, tracking);
    const slack = Math.max(0, effectiveWidth - (lineInkExtent(line, 0).width - trailing));
    start += block.textAlign === 'center' ? slack / 2 : slack;
  }
  const xs: number[] = [];
  const widths: number[] = [];
  let x = start;
  for (const seg of segments) {
    xs.push(x);
    const w = seg.kind === 'space' && !seg.autospace && justified !== undefined ? justified : seg.width;
    widths.push(w);
    x += w;
  }
  return { xs, widths };
}

/** The font a segment is painted in. */
export function segmentFont(seg: VDTLineSegment, block: BlockLike): string {
  if (seg.fontString) return seg.fontString;
  if (seg.bold && seg.italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (seg.bold && block.boldFontString) return block.boldFontString;
  if (seg.italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

/** Characters that take no emphasis dot: punctuation, spaces, controls. */
export const NO_DOT_RE = /^[\p{P}\p{Z}\p{Cc}\p{Cf}]/u;

/** Mark sizes, in em of the text they mark. */
export const DOT = { dot: 0.16, circle: 0.2, sesame: 0.3 } as const;
export const GAP = 0.06;
export const STROKE = 0.05;
export const OUTLINE = 0.035;
export const LINE_AT = 0.08;
export const WAVE_AT = 0.1;
export const WAVE_HEIGHT = 0.08;
export const WAVE_LENGTH = 0.25;
/** A double side line: its two rules' centres this far apart. */
export const DOUBLE_GAP = 0.08;
/** A dotted side line: its dots' diameter and the pitch they come near. */
export const DOTTED_SIZE = 0.08;
export const DOTTED_PITCH = 0.16;
/** How far dots move out when a line marks the same text on their side. */
export const PAST_LINE = 0.16;

/** Where each grapheme of a segment starts and how far it advances, px
 *  from the segment's start: CJK characters share the segment's width
 *  evenly (the composer only puts characters that advance alike in one
 *  segment); anything else is measured and scaled to the segment. Down a
 *  vertical line a number set in one upright cell (`:tcy[…]`, or up to
 *  `cjk.uprightDigits` digits) is one character: it takes one dot; the
 *  letters of an `:upright[…]` run stand one to a cell, whatever their
 *  horizontal widths. */
export function graphemeAdvances(seg: VDTLineSegment, width: number, font: string, vertical?: VerticalMarks): { g: string; at: number; adv: number }[] {
  const graphemes = graphemesOf(seg.text);
  if (graphemes.length === 0) return [];
  const out: { g: string; at: number; adv: number }[] = [];
  if (vertical && seg.tcy) return [{ g: seg.text, at: 0, adv: width }];
  if (vertical && seg.orientation === 'upright') {
    const adv = width / graphemes.length;
    graphemes.forEach((g, i) => out.push({ g, at: i * adv, adv }));
    return out;
  }
  if (vertical && seg.orientation !== 'sideways' && vertical.uprightDigits > 0 && /[0-9]/.test(seg.text)) {
    const em = fontEm(font);
    const pieces = verticalRuns(graphemes, vertical.region, vertical.uprightDigits).flatMap((run) =>
      run.cell !== undefined ? [{ g: run.text, w: em * run.cell }] : graphemesOf(run.text).map((g) => ({ g, w: measureTextWidth(g, font) })));
    const sum = pieces.reduce((a, p) => a + p.w, 0);
    const k = sum > 0 ? width / sum : 1;
    let at = 0;
    for (const p of pieces) {
      out.push({ g: p.g, at, adv: p.w * k });
      at += p.w * k;
    }
    return out;
  }
  if (graphemes.every(isCjkGrapheme)) {
    const adv = width / graphemes.length;
    graphemes.forEach((g, i) => out.push({ g, at: i * adv, adv }));
    return out;
  }
  const natural = graphemes.map((g) => measureTextWidth(g, font));
  const sum = natural.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? width / sum : 1;
  let at = 0;
  graphemes.forEach((g, i) => {
    const adv = natural[i]! * scale;
    out.push({ g, at, adv });
    at += adv;
  });
  return out;
}

/** What a vertical line's dots need to find its upright cells. */
export interface VerticalMarks {
  region: CjkRegion;
  uprightDigits: number;
}
