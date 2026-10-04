/**
 * Classical Arabic verse (#378, arabic-typography §6.1): a `:::verse` poem,
 * each bayt on one line in two hemistichs — the ṣadr on the start side
 * (the right in Arabic), the ʿajuz on the end side, a gap between them.
 * Every hemistich of a poem is set to one common width, so the hemistichs
 * of every bayt start and end on the same verticals and the rhyme letters
 * of the ʿajuz line up down the poem.
 *
 * - The common width: `width` on the fence, else the widest hemistich of
 *   the poem's two-hemistich lines, at most half the measure less the gap.
 * - Each hemistich is brought to it with kashidas first (verse elongates
 *   more than prose: twice the body's longest elongation at a join), then
 *   its word spaces. A hemistich of one word that cannot fill it leaves the
 *   rest to the gap, so its ends still sit on the verticals.
 * - A hemistich wider than the common width tightens its word spaces to
 *   `bodyText.minWordSpacing`; if it still does not fit, the bayt is set
 *   staggered: the ṣadr flush with the start side on its own line, the
 *   ʿajuz flush with the end side on the next. A hemistich wider than the
 *   measure is broken over lines there, which only a narrow column calls
 *   for.
 * - A line of one hemistich (no `||`) is centred on the poem.
 * - The poem is centred in the measure (`align="start"`: flush with the
 *   start side). `gap` sets the gap (default 2 em); `ornament` prints a
 *   mark in its middle (٭, ✻), which is no character of the text.
 *
 * The poem is a paragraph whose lines carry final segment widths (the
 * block is set flush left): every renderer paints it as measured, the gap
 * a `space` segment flagged `labelTab`. Lines are in the flow frame, so a
 * mirrored page turns the whole poem. The hemistichs are measured as
 * paragraphs of their own in the poem's direction: each has its own bidi
 * order, joined here in the order of that direction.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import type { DirectiveAttrs } from '../parse/types';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from '../measure';
import { measureRichBlock } from '../measure';
import { cachedMeasureRichBlock } from '../measure/cache';
import { pickSpanFont, textWidth } from '../measure/rich';
import { normalSpaceWidthFor } from '../measure/canvas';
import { lineBaselineOffset } from '../measure/vertical';
import { sliceSpan } from '../parse/links';
import { distributeKashida, writtenText, type KashidaOptions } from '../measure/kashida';
import { dimensionToPx } from '../units';
import type { DimensionUnit } from '../types';
import type { BlockStyle } from './styles';

/** How far a poem's verse elongates a join, against the body's
 *  `kashidaMaxLength`: classical prints stretch verse more than prose. */
const VERSE_KASHIDA_SCALE = 2;
/** Default gap between the hemistichs, in ems. */
const DEFAULT_GAP_EM = 2;
/** Measure a hemistich on one line. */
const ONE_LINE = 1e7;

/** A poem's settings read from its fence. */
export interface VerseSettings {
  gapPx: number;
  /** Fixed hemistich width (`width`), px. */
  widthPx?: number;
  align: 'center' | 'start';
  ornament?: string;
}

/** `2em`, `12mm`, `1.5` (ems) as px at `fontSizePx`; undefined when it is
 *  not a length. */
function lengthAttr(value: string | undefined, dpi: number, fontSizePx: number): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(cm|mm|in|pt|px|em|rem)?\s*$/.exec(value ?? '');
  if (!m) return undefined;
  return dimensionToPx({ value: Number(m[1]), unit: (m[2] ?? 'em') as DimensionUnit }, dpi, fontSizePx);
}

/** The settings of a poem's fence (`gap`, `width`, `align`, `ornament`). */
export function verseSettings(attrs: DirectiveAttrs, dpi: number, fontSizePx: number): VerseSettings {
  const gapPx = lengthAttr(attrs.gap, dpi, fontSizePx) ?? DEFAULT_GAP_EM * fontSizePx;
  const widthPx = lengthAttr(attrs.width, dpi, fontSizePx);
  const ornament = attrs.ornament?.trim();
  return {
    gapPx,
    ...(widthPx !== undefined && widthPx > 0 ? { widthPx } : {}),
    align: attrs.align?.trim() === 'start' ? 'start' : 'center',
    ...(ornament ? { ornament } : {}),
  };
}

/** The poem's rows: each a list of one or two hemistichs (their spans), cut
 *  at the text's line feeds and tabs. */
function verseRows(spans: readonly InlineSpan[]): InlineSpan[][][] {
  const rows: InlineSpan[][][] = [[[]]];
  for (const span of spans) {
    let from = 0;
    for (let i = 0; i <= span.text.length; i++) {
      const ch = span.text[i];
      if (i < span.text.length && ch !== '\n' && ch !== '\t') continue;
      if (i > from) rows[rows.length - 1]!.at(-1)!.push(sliceSpan(span, from, i));
      if (ch === '\n') rows.push([[]]);
      else if (ch === '\t') rows[rows.length - 1]!.push([]);
      from = i + 1;
    }
  }
  return rows.map((row) => row.filter((h) => h.length > 0)).filter((row) => row.length > 0);
}

/** One hemistich as measured: its segments in logical order, their visual
 *  order (left to right), its width. */
interface Hemistich {
  segments: VDTLineSegment[];
  order: number[];
  width: number;
  text: string;
}

interface VerseLayoutInput {
  contentBlock: ContentBlock;
  style: BlockStyle;
  /** The measure, px. */
  measureMaxWidth: number;
  dpi: number;
  minWordSpacing: number;
  /** The body's kashida options for this style, when it takes kashidas. */
  kashida?: KashidaOptions;
  /** The poem's direction and its frame's. */
  direction: 'ltr' | 'rtl';
  frameDirection: 'ltr' | 'rtl';
  cache?: MeasurementCache;
}

/** Lay a poem out (see the module comment). */
export function measureVerse(input: VerseLayoutInput): MeasuredBlock {
  const { contentBlock, style, measureMaxWidth: measure, direction } = input;
  const settings = verseSettings(contentBlock.verse?.attrs ?? {}, input.dpi, style.fontSizePx);
  const fonts = {
    normal: style.fontString,
    bold: style.boldFontString ?? style.fontString,
    italic: style.italicFontString ?? style.fontString,
    boldItalic: style.boldItalicFontString ?? style.fontString,
  };
  const fontOf = (seg: VDTLineSegment) => seg.fontString ?? pickSpanFont(!!seg.bold, !!seg.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  const widthOf = (seg: VDTLineSegment, text: string) => textWidth(text, fontOf(seg), false);
  const lineHeight = style.lineHeightPx;
  const options: MeasureBlockOptions = { textAlign: 'left', direction };
  const measureSpans = (spans: InlineSpan[], width: number): VDTLine[] => (input.cache
    ? cachedMeasureRichBlock(spans, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, width, lineHeight, options, input.cache)
    : measureRichBlock(spans, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, width, lineHeight, options)).lines;
  const hemistichOf = (line: VDTLine): Hemistich => {
    const segments = line.segments ?? [];
    return {
      segments,
      order: line.order && line.order.length === segments.length ? line.order : segments.map((_, i) => i),
      width: segments.reduce((s, seg) => s + seg.width, 0),
      text: segments.map((seg) => writtenText(seg)).join(''),
    };
  };

  const rows = verseRows(contentBlock.spans).map((row) => row.map((spans) => ({ spans, line: measureSpans(spans, ONE_LINE)[0] })));
  // The common width: the widest hemistich of the two-hemistich lines,
  // within half the measure less the gap.
  const half = Math.max(0, (measure - settings.gapPx) / 2);
  let widest = 0;
  for (const row of rows) if (row.length === 2) for (const h of row) widest = Math.max(widest, h.line ? hemistichOf(h.line).width : 0);
  const w = Math.min(settings.widthPx ?? widest, half);
  const total = 2 * w + settings.gapPx;
  const hasBayts = rows.some((r) => r.length === 2);

  // Flow x of a span `width` wide on a side of `[x0, x1]`. The start side
  // is the frame's start when the poem runs the frame's way, its end when
  // it runs against it (an Arabic poem on a left-to-right page).
  const same = direction === input.frameDirection;
  const place = (width: number, side: 'start' | 'end' | 'center', x0: number, x1: number): number => {
    const x = side === 'center' ? x0 + (x1 - x0 - width) / 2
      : (side === 'start') === same ? x0 : x1 - width;
    return Math.max(0, Math.min(x, Math.max(0, measure - width)));
  };
  const poemX = hasBayts ? (settings.align === 'start' ? place(total, 'start', 0, measure) : Math.max(0, (measure - total) / 2)) : 0;
  const poemEnd = hasBayts ? poemX + total : measure;

  const verseKashida = input.kashida ? { ...input.kashida, maxLengthPx: input.kashida.maxLengthPx * VERSE_KASHIDA_SCALE } : undefined;
  const spaceWidth = normalSpaceWidthFor(fonts.normal);

  /** A hemistich set to `target` px: kashidas first, then its word spaces;
   *  what neither can take is returned as `short`. One that is too wide
   *  tightens its spaces, down to `minWordSpacing`; `fits` says whether it
   *  came to the target. */
  const justify = (h: Hemistich, target: number): { h: Hemistich; short: number; fits: boolean } => {
    let segments = h.segments.map((seg) => ({ ...seg }));
    let width = h.width;
    if (width > target + 0.01) {
      const spaces = segments.filter((seg) => seg.kind === 'space' && !seg.autospace);
      const shrinkable = spaces.reduce((s, seg) => s + Math.max(0, seg.width - spaceWidth * input.minWordSpacing), 0);
      if (width - shrinkable > target + 0.01) return { h, short: 0, fits: false };
      const ratio = shrinkable > 0 ? (width - target) / shrinkable : 0;
      for (const seg of spaces) seg.width -= Math.max(0, seg.width - spaceWidth * input.minWordSpacing) * ratio;
      return { h: { ...h, segments, width: target }, short: 0, fits: true };
    }
    if (verseKashida) {
      const done = distributeKashida(segments, target - width, verseKashida, widthOf);
      if (done) {
        segments = done.segments;
        width += done.added;
      }
    }
    const spaces = segments.filter((seg) => seg.kind === 'space' && !seg.autospace);
    let short = Math.max(0, target - width);
    if (spaces.length > 0 && short > 0) {
      for (const seg of spaces) seg.width += short / spaces.length;
      width = target;
      short = 0;
    }
    return { h: { ...h, segments, width }, short, fits: true };
  };

  const baselineOffset = lineBaselineOffset(lineHeight, fonts.normal);
  const lines: VDTLine[] = [];
  const push = (segments: VDTLineSegment[], order: number[], x: number, text: string, verse: NonNullable<VDTLine['verse']>) => {
    const y = lines.length * lineHeight;
    const width = segments.reduce((s, seg) => s + seg.width, 0);
    const kashida = segments.reduce((n, seg) => n + (seg.kashida?.length ?? 0), 0);
    const identity = order.every((v, i) => v === i);
    lines.push({
      text,
      bbox: createBoundingBox(x, y, width, lineHeight),
      baseline: y + baselineOffset,
      hyphenated: false,
      segments,
      isLastLine: false,
      ...(identity ? {} : { order }),
      ...(kashida > 0 ? { kashida } : {}),
      verse,
    });
  };
  /** The lines of one hemistich set alone: one when it fits the measure,
   *  else broken over the measure; each placed on `side`. */
  const alone = (spans: InlineSpan[], h: Hemistich, side: 'start' | 'end' | 'center', bayt: number, part: 'sadr' | 'ajuz' | 'single', x0: number, x1: number) => {
    const set = h.width <= measure + 0.01 ? [h] : measureSpans(spans, measure).map(hemistichOf);
    for (const piece of set) push(piece.segments, piece.order, place(piece.width, side, x0, x1), piece.text, { bayt, part });
  };

  rows.forEach((row, bayt) => {
    const measured = row.map((r) => (r.line ? hemistichOf(r.line) : undefined));
    if (row.length === 1 || !measured[0] || !measured[1]) {
      const r = row.find((x) => x.line)!;
      if (!r) return;
      alone(r.spans, hemistichOf(r.line!), 'center', bayt, 'single', hasBayts ? poemX : 0, poemEnd);
      return;
    }
    const sadr = justify(measured[0], w);
    const ajuz = justify(measured[1], w);
    if (!sadr.fits || !ajuz.fits) {
      // Staggered: the ṣadr flush with the start side, the ʿajuz with the
      // end, each at its natural width.
      alone(row[0]!.spans, measured[0], 'start', bayt, 'sadr', poemX, poemEnd);
      alone(row[1]!.spans, measured[1], 'end', bayt, 'ajuz', poemX, poemEnd);
      return;
    }
    // The gap takes what the hemistichs could not fill, so the ṣadr starts
    // on the start vertical and the ʿajuz ends on the end one.
    const gapWidth = settings.gapPx + sadr.short + ajuz.short;
    const gap: VDTLineSegment[] = [];
    if (settings.ornament) {
      const mark: VDTLineSegment = { kind: 'text', text: settings.ornament, width: 0, inserted: true };
      mark.width = widthOf(mark, mark.text);
      // The ornament sits in the middle of the poem, whatever a short
      // hemistich left on its side of the gap.
      const side = Math.max(0, (settings.gapPx - mark.width) / 2);
      gap.push({ kind: 'space', text: '\t', width: sadr.short + side, labelTab: true }, mark,
        { kind: 'space', text: '', width: side + ajuz.short, labelTab: true });
    } else {
      gap.push({ kind: 'space', text: '\t', width: gapWidth, labelTab: true });
    }
    const s = sadr.h;
    const a = ajuz.h;
    const segments = [...s.segments, ...gap, ...a.segments];
    const offA = s.segments.length + gap.length;
    const gapIdx = gap.map((_, i) => s.segments.length + i);
    // Visual order: the ṣadr first in reading order, so on the left in a
    // left-to-right poem and on the right in a right-to-left one.
    const order = direction === 'rtl'
      ? [...a.order.map((i) => i + offA), ...gapIdx.slice().reverse(), ...s.order]
      : [...s.order, ...gapIdx, ...a.order.map((i) => i + offA)];
    // The ṣadr runs from the poem's start vertical, the ʿajuz ends on its
    // end vertical: the line spans the poem.
    push(segments, order, poemX, `${s.text}\t${a.text}`, { bayt, part: 'bayt' });
  });

  if (lines.length > 0) lines[lines.length - 1]!.isLastLine = true;
  return { lines, totalHeight: lines.length * lineHeight };
}
