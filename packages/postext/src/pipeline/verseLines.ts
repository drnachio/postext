/**
 * Verse line by line (#620): a `:::verse` poem whose lines carry no
 * hemistich separator (or `layout="lines"` on its fence), set as it is
 * written. Every source line is a line of verse, a run of blank lines a
 * stanza break, leading whitespace an indent.
 *
 * - Each stanza is a paragraph block of its own (`VerseInfo.stanza`), so a
 *   column or page breaks between stanzas by the paragraph rules, and
 *   inside one by the orphan and widow rules, which then count the
 *   stanza's lines. The space between stanzas is the block's bottom
 *   margin (`stanzaSpace`, one line of the poem's leading by default).
 * - A line's indent is its leading spaces × `indentStep` (a tab counts
 *   four spaces, an ideographic space two). A stepped line (`+ …`) starts
 *   where the line above ended, a word space on.
 * - A line wider than the measure turns over: `turnover="hang"` sets the
 *   rest on the line after it, `hang` (the style's `hangingIndent`, else
 *   `bodyText.verse.hang`) in from the line's own start; `turnover="right"`
 *   sets it flush with the end side behind an opening bracket
 *   (`turnoverMark`). Turnovers break at word spaces (and hyphenate only
 *   when the poem's style asks for hyphenation itself).
 * - `align="center"` (the default in horizontal text) centres the poem as a
 *   block on its longest line, every line flush with the block's start;
 *   `align="start"` (the default in vertical text, where the poem hangs
 *   from the head) sets it flush with the measure's start.
 *
 * The lines carry final segment widths and their own `bbox.x` (the block is
 * set flush left), in the flow frame, as the bayt layout's do
 * (`pipeline/verse.ts`): every renderer paints them as measured. A poem
 * whose direction opposes its frame's (a Latin poem in an Arabic book) is
 * measured from its own start side.
 */

import type { ContentBlock, InlineSpan } from '../parse';
import type { DirectiveAttrs } from '../parse/types';
import type { ResolvedConfig, VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { MeasuredBlock, MeasurementCache, MeasureBlockOptions } from '../measure';
import { measureRichBlock } from '../measure';
import { cachedMeasureRichBlock } from '../measure/cache';
import { pickSpanFont, textWidth } from '../measure/rich';
import { normalSpaceWidthFor } from '../measure/canvas';
import { lineBaselineOffset } from '../measure/vertical';
import { sliceSpan } from '../parse/links';
import { dimensionToPx } from '../units';
import type { ResolvedVerseConfig } from '../types';
import type { BlockStyle } from './styles';
import { lengthAttr } from './verse';

/** Measure a line of verse on one line. */
const ONE_LINE = 1e7;

/** A poem's line-layout settings, read from its fence over
 *  `bodyText.verse`. */
export interface VerseLinesSettings {
  /** Width of one leading space, px. */
  indentStepPx: number;
  turnover: 'hang' | 'right';
  /** Indent of a hanging turnover from its line's start, px. */
  hangPx: number;
  turnoverMark: string;
  /** Space between two stanzas, px. */
  stanzaSpacePx: number;
  /** Stanzas of this many lines or fewer stay whole; 0: off. */
  keepStanzas: number;
  align: 'center' | 'start';
}

/** Whether a stanza block is set line by line: a stanza of the line layout,
 *  unless the fence named no layout and the configuration was stored
 *  before #620 (`bodyText.verse.layout: 'bayt'`), when it is set as single
 *  hemistichs, as postext 1.22 set a poem with no separator. */
export function versesLineByLine(raw: ContentBlock, resolved: ResolvedConfig): boolean {
  const stanza = raw.verse?.stanza;
  return stanza !== undefined && !(stanza.auto && resolved.bodyText.verse.layout === 'bayt');
}

/** A whole number of lines or none (`keepStanzas=5`). */
function countAttr(value: string | undefined): number | undefined {
  const m = /^\s*(\d+)\s*$/.exec(value ?? '');
  return m ? Number(m[1]) : undefined;
}

/** The space between stanzas a fence asks for: a bare number counts lines
 *  of the poem's leading (`stanzaSpace=0.5`), a length is that length
 *  (`stanzaSpace=6pt`). */
function stanzaSpaceAttr(value: string | undefined, lineHeightPx: number, dpi: number, fontSizePx: number): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^(\d+(?:\.\d+)?|\.\d+)$/.test(v)) return Number(v) * lineHeightPx;
  return lengthAttr(v, dpi, fontSizePx);
}

/** The hanging indent of the paragraph style a poem's fence names, px;
 *  undefined when it names none, or one that sets none. */
function styleHangPx(attrs: DirectiveAttrs, resolved: ResolvedConfig, fontSizePx: number): number | undefined {
  const id = attrs.style?.trim();
  if (!id) return undefined;
  const cfg = resolved.paragraphStyles.find((s) => s.id === id);
  if (!cfg) return undefined;
  const px = dimensionToPx(cfg.hangingIndent, resolved.page.dpi, fontSizePx);
  return px > 0 ? px : undefined;
}

/** A poem's settings (see {@link VerseLinesSettings}). */
export function verseLinesSettings(
  attrs: DirectiveAttrs,
  style: Pick<BlockStyle, 'fontSizePx' | 'lineHeightPx'>,
  resolved: ResolvedConfig,
  vertical: boolean,
): VerseLinesSettings {
  const cfg: ResolvedVerseConfig = resolved.bodyText.verse;
  const dpi = resolved.page.dpi;
  const em = style.fontSizePx;
  const turnover = attrs.turnover?.trim();
  const align = attrs.align?.trim();
  return {
    indentStepPx: Math.max(0, lengthAttr(attrs.indentStep, dpi, em) ?? dimensionToPx(cfg.indentStep, dpi, em)),
    turnover: turnover === 'right' || turnover === 'hang' ? turnover : cfg.turnover,
    hangPx: Math.max(0, lengthAttr(attrs.hang, dpi, em) ?? styleHangPx(attrs, resolved, em) ?? dimensionToPx(cfg.hang, dpi, em)),
    turnoverMark: attrs.turnoverMark ?? cfg.turnoverMark,
    stanzaSpacePx: Math.max(0, stanzaSpaceAttr(attrs.stanzaSpace, style.lineHeightPx, dpi, em) ?? cfg.stanzaSpace * style.lineHeightPx),
    keepStanzas: countAttr(attrs.keepStanzas) ?? cfg.keepStanzas,
    align: align === 'start' || align === 'center' ? align : vertical ? 'start' : 'center',
  };
}

/** A stanza's lines of verse: its spans cut at the line feeds. */
export function stanzaRows(spans: readonly InlineSpan[]): InlineSpan[][] {
  const rows: InlineSpan[][] = [[]];
  for (const span of spans) {
    let from = 0;
    for (let i = 0; i <= span.text.length; i++) {
      if (i < span.text.length && span.text[i] !== '\n') continue;
      if (i > from) rows[rows.length - 1]!.push(sliceSpan(span, from, i));
      if (i < span.text.length) rows.push([]);
      from = i + 1;
    }
  }
  return rows;
}

export interface VerseLinesInput {
  /** The stanza, its spans resolved for measuring. */
  contentBlock: ContentBlock;
  /** Every stanza of the poem in order, spans resolved likewise; the
   *  stanza being set among them (at `contentBlock.verse.stanza.index`). */
  poem: readonly ContentBlock[];
  style: BlockStyle;
  /** The measure, px. */
  measureMaxWidth: number;
  settings: VerseLinesSettings;
  /** The poem's direction and its frame's. */
  direction: 'ltr' | 'rtl';
  frameDirection: 'ltr' | 'rtl';
  cache?: MeasurementCache;
}

/** Lay a stanza out (see the module comment). */
export function measureVerseLines(input: VerseLinesInput): MeasuredBlock {
  const { contentBlock, style, measureMaxWidth: measure, settings, direction } = input;
  const stanza = contentBlock.verse?.stanza;
  if (!stanza) return { lines: [], totalHeight: 0 };
  const fonts = {
    normal: style.fontString,
    bold: style.boldFontString ?? style.fontString,
    italic: style.italicFontString ?? style.fontString,
    boldItalic: style.boldItalicFontString ?? style.fontString,
  };
  const lineHeight = style.lineHeightPx;
  const base: MeasureBlockOptions = {
    textAlign: 'left',
    direction,
    hyphenate: style.hyphenate,
    ...(style.hyphenationZonePx !== undefined ? { hyphenationZonePx: style.hyphenationZonePx } : {}),
  };
  const measureSpans = (spans: InlineSpan[], width: number, options: MeasureBlockOptions): VDTLine[] => (input.cache
    ? cachedMeasureRichBlock(spans, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, width, lineHeight, options, input.cache)
    : measureRichBlock(spans, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, width, lineHeight, options)).lines;
  const widthOf = (line: VDTLine | undefined): number => (line?.segments ?? []).reduce((s, seg) => s + seg.width, 0);
  const space = normalSpaceWidthFor(fonts.normal);

  // How a line too wide for the measure is broken: at word spaces, the
  // turnovers in from its start (`hang`), or set behind the mark flush
  // with the end side (`right`).
  const markSeg = (): VDTLineSegment => {
    const seg: VDTLineSegment = { kind: 'text', text: settings.turnoverMark, width: 0, inserted: true };
    seg.width = textWidth(seg.text, pickSpanFont(false, false, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic), false);
    return seg;
  };
  const turnoverLines = (spans: InlineSpan[], indent: number): VDTLine[] => {
    const room = Math.max(1, measure - indent);
    const rest = settings.turnover === 'right'
      ? Math.min(markSeg().width + space, room / 2)
      : Math.min(settings.hangPx, room / 2);
    return measureSpans(spans, room, { ...base, lineIndentsPx: [0, rest] });
  };
  /** Where a too-wide line's last turnover ends, from the poem's start. */
  const endOfTurnover = (spans: InlineSpan[], indent: number): number => {
    const lines = turnoverLines(spans, indent);
    const last = lines[lines.length - 1];
    if (!last || lines.length < 2) return Math.min(measure, indent + widthOf(last));
    return settings.turnover === 'right' ? measure : indent + last.bbox.x + widthOf(last);
  };

  // The poem's lines in order, each with its natural width and indent: a
  // stepped line starts a word space past the end of the line above (its
  // last turnover's end), or flush with the end side when it would not fit.
  interface Row { spans: InlineSpan[]; width: number; indent: number; stanza: number }
  const rows: Row[] = [];
  let prevEnd = 0;
  for (const block of input.poem) {
    const st = block.verse?.stanza;
    if (!st) continue;
    stanzaRows(block.spans).forEach((spans, i) => {
      const info = st.lines[i] ?? { indent: 0 };
      const width = widthOf(measureSpans(spans, ONE_LINE, base)[0]);
      // An indent past half the measure would leave its turnovers no room.
      let indent = Math.min(info.indent * settings.indentStepPx, measure / 2);
      if (info.stepped && rows.length > 0) indent = Math.max(0, Math.min(prevEnd + space, measure - width));
      rows.push({ spans, width, indent, stanza: st.index });
      prevEnd = indent + width <= measure + 0.01 ? indent + width : endOfTurnover(spans, indent);
    });
  }

  // The poem's block: as wide as its longest line (the measure when one
  // turns over), centred or flush with the start.
  const poemWidth = rows.reduce((w, r) => Math.max(w, Math.min(measure, r.indent + r.width)), 0);
  const x0 = settings.align === 'center' ? Math.max(0, (measure - poemWidth) / 2) : 0;
  const same = direction === input.frameDirection;
  /** Flow x of a line `width` wide starting `start` px from the poem's
   *  start side. */
  const place = (start: number, width: number): number => (same ? start : Math.max(0, measure - start - width));

  const baselineOffset = lineBaselineOffset(lineHeight, fonts.normal);
  const lines: VDTLine[] = [];
  const push = (line: VDTLine, segments: VDTLineSegment[], start: number, verseLine: NonNullable<VDTLine['verseLine']>) => {
    const y = lines.length * lineHeight;
    const width = segments.reduce((s, seg) => s + seg.width, 0);
    const { verse: _bayt, measure: _measure, isLastLine: _last, ...rest } = line;
    void _bayt;
    void _measure;
    void _last;
    lines.push({
      ...rest,
      segments,
      bbox: createBoundingBox(place(start, width), y, width, lineHeight),
      baseline: y + baselineOffset,
      isLastLine: false,
      verseLine,
    });
  };
  rows.forEach((row, i) => {
    if (row.stanza !== stanza.index) return;
    const verseLine = (turnover: boolean) => ({ stanza: stanza.index, line: i, turnover });
    if (row.indent + row.width <= measure + 0.01) {
      const [line] = measureSpans(row.spans, ONE_LINE, base);
      if (line) push(line, line.segments ?? [], x0 + row.indent, verseLine(false));
      return;
    }
    // Turned over: the block spans the measure (x0 is 0).
    turnoverLines(row.spans, row.indent).forEach((line, k) => {
      const segments = line.segments ?? [];
      if (k === 0) {
        push(line, segments, row.indent, verseLine(false));
      } else if (settings.turnover === 'right') {
        // Flush with the end side, behind the mark, which stands on the
        // turnover's start side (the left of a left-to-right poem).
        const marked = [markSeg(), ...segments];
        const width = marked.reduce((s, seg) => s + seg.width, 0);
        const inner = line.order && line.order.length === segments.length ? line.order.map((o) => o + 1) : segments.map((_, j) => j + 1);
        const order = direction === 'rtl' ? [...inner, 0] : [0, ...inner];
        const { order: _order, ...unordered } = line;
        void _order;
        push(order.every((v, j) => v === j) ? unordered : { ...unordered, order }, marked, Math.max(row.indent, measure - width), verseLine(true));
      } else {
        push(line, segments, row.indent + line.bbox.x, verseLine(true));
      }
    });
  });
  // The last line of a stanza another follows: copied text leaves a blank
  // line under it.
  if (lines.length > 0) {
    const last = lines[lines.length - 1]!;
    last.isLastLine = true;
    if (!stanza.last) last.verseLine = { ...last.verseLine!, stanzaEnd: true };
  }
  return { lines, totalHeight: lines.length * lineHeight };
}
