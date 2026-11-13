// A line's runs where the backends paint them (#1388): the PDF's rule in
// postext-pdf `blockRender/lineText.ts` and `segments.ts` — the justify
// decision (overfull last lines included), centre and right slack without
// the trailing tracking, a line's own `measure`, hung marks and Han–Latin
// spaces of composed lines, `line.order` for bidi — and the plain
// left-to-right setting of caption, note and cell lines (`paintLine`).
import type { VDTBlock } from '../../vdt/blocks.js';
import type { VDTLine } from '../../vdt/lines.js';
import type { VDTAnnotationRun, VDTLineSegment } from '../../vdt/segments.js';
import { lineTextAlign } from '../../vdt/flowFrames.js';
import { findPxSize } from '../../measure/fontString.js';
import { lineWordSegmentsInOrder } from '../wordPieces.js';
import { lineTrailingTracking } from '../lineInk.js';
import { lineSource, segmentShownText, type Atom, type SourceBlock } from './source.js';
import { chipRuns, swatchPaint } from './inline.js';
import { highlightShapes } from './markItems.js';
import type { DisplayAnnotation, DisplayLine, DisplayListOptions, DisplayRun, LineAlign } from './types.js';

/** The faces and colours a line's segments pick from. */
export interface LineStyle {
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  color: string;
  boldColor?: string;
  italicColor?: string;
  refColor?: string;
  /** A caption's label colour (`captionLabel` segments). */
  labelColor?: string;
}

export function pickFont(style: LineStyle, bold: boolean, italic: boolean): string {
  if (bold && italic && style.boldItalicFontString) return style.boldItalicFontString;
  if (bold && style.boldFontString) return style.boldFontString;
  if (italic && style.italicFontString) return style.italicFontString;
  return style.fontString;
}

function pickColor(style: LineStyle, seg: VDTLineSegment): string {
  if (seg.color) return seg.color;
  if ((seg.refResourceId !== undefined || seg.refAnchor) && style.refColor) return style.refColor;
  if (seg.captionLabel && style.labelColor) return style.labelColor;
  if (seg.bold && style.boldColor) return style.boldColor;
  if (seg.italic && style.italicColor) return style.italicColor;
  return style.color;
}

/** A line placed, with its source, plus the rule leaders it draws. */
export interface PlacedLine {
  line: DisplayLine;
  atoms: Atom[];
  /** Rule leaders (`leader: 'rule'`): x, width, the face size they key off. */
  leaders: { x: number; width: number; fontString: string; color: string }[];
}

/** Where the line is set and how: the decisions of `renderLineText`. */
interface Setting {
  segments: VDTLineSegment[] | undefined;
  order: readonly number[] | undefined;
  startX: number;
  align: LineAlign;
  spaceWidth?: number;
}

function sizeOf(fontString: string): number {
  const m = findPxSize(fontString, 0, true);
  return m ? Number(m.value) : 0;
}

/** The segments a line is set from: word pieces joined, re-measured,
 *  when the caller measures; the line's own otherwise. */
function setSegments(line: VDTLine, composed: boolean, style: LineStyle, tracking: number, options: DisplayListOptions | undefined) {
  const measure = options?.measure;
  if (!measure) {
    const segs = line.segments;
    return { segments: segs, order: segs && line.order?.length === segs.length ? line.order : undefined };
  }
  return lineWordSegmentsInOrder(line, composed, (seg, text) => measure(text, seg.fontString ?? pickFont(style, !!seg.bold, !!seg.italic), tracking));
}

/** The justify / align decisions for a block line (PDF `renderLineText`). */
function bodySetting(line: VDTLine, block: Pick<VDTBlock, 'textAlign' | 'bbox'>, composed: boolean, tracking: number, segments: VDTLineSegment[] | undefined, order: readonly number[] | undefined): Setting {
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const effectiveWidth = span ? span.width : block.bbox.width - (lineX - block.bbox.x);
  const align = lineTextAlign(line, block.textAlign);
  if (block.textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      if (composed && seg.hangs) continue;
      if (seg.kind === 'space' && !(composed && seg.autospace)) spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      return { segments, order, startX: lineX, align: 'justify', spaceWidth: (effectiveWidth - wordWidth) / spaceCount };
    }
  }
  const trailing = lineTrailingTracking(line, tracking);
  if ((align === 'center' || align === 'right') && segments) {
    let contentWidth = 0;
    for (const seg of segments) if (!(composed && seg.hangs)) contentWidth += seg.width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    return { segments, order, startX: lineX + (align === 'center' ? slack / 2 : slack), align };
  }
  // Ragged from the start (also the last line of a justified paragraph).
  const shown: LineAlign = align === 'justify' ? 'left' : (align as LineAlign);
  if (!segments) {
    const slack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
    return { segments, order, startX: lineX + (shown === 'right' ? slack : shown === 'center' ? slack / 2 : 0), align: shown };
  }
  return { segments, order, startX: lineX, align: shown };
}

/** A segment's East Asian setting on its run (#1394): ruby reading,
 *  tate-chu-yoko and orientation, a warichu note's rows, kanbun marks. */
function annotate(run: DisplayRun, seg: VDTLineSegment): void {
  const ann = (a: VDTAnnotationRun): DisplayAnnotation => ({ text: a.text, dx: a.dx, dy: a.dy, fontString: a.fontString, ...(a.color ? { color: a.color } : {}) });
  if (seg.ruby) {
    const r = seg.ruby;
    run.ruby = { text: r.text, fontString: r.fontString, position: r.position, ...(r.group ? { group: true } : {}), ...(r.id !== undefined ? { id: r.id } : {}), ...(r.color ? { color: r.color } : {}), ...(r.runs[0] ? { raise: -r.runs[0].dy, runs: r.runs.map(ann) } : {}) };
  }
  if (seg.tcy) run.tcy = true;
  if (seg.orientation) run.orientation = seg.orientation;
  if (seg.warichu) {
    const w = seg.warichu;
    run.warichu = { upper: w.upper, lower: w.lower, fontString: w.fontString, ...(w.color ? { color: w.color } : {}) };
  }
  if (seg.kunten) {
    const k = seg.kunten;
    run.kunten = { runs: k.runs.map((r) => ({ ...ann(r), role: r.role })), ...(k.tate ? { tate: { ...k.tate } } : {}), ...(k.color ? { color: k.color } : {}) };
  }
}

/** A space between two words of one struck or underlined run
 *  (`~~old price~~`, `++sign here++`): the measurer stamps only the words,
 *  and a writer that sets the line as runs (Word) would break the line at
 *  the space. */
function markedSpace(segs: readonly VDTLineSegment[], i: number, key: 'strike' | 'underline'): boolean {
  const seg = segs[i]!;
  if (seg.kind !== 'space') return false;
  const before = segs[i - 1]?.[key];
  const after = segs[i + 1]?.[key];
  if (!before || !after || before.id !== after.id) return false;
  const reachesEnd = before.to === undefined || before.to >= segmentShownText(segs[i - 1]!).length;
  return reachesEnd && (after.from === undefined || after.from === 0);
}

/** The runs of a line set from `setting`: x per segment (in `order` when
 *  the line carries one), each space at the justified width. */
function runsOf(setting: Setting, composed: boolean, style: LineStyle, tracking: number, leaders: PlacedLine['leaders']): DisplayRun[] {
  const segs = setting.segments ?? [];
  const advance = (seg: VDTLineSegment) => (seg.kind === 'space' ? (composed && seg.autospace ? seg.width : setting.spaceWidth ?? seg.width) : seg.width);
  const xs = new Array<number>(segs.length);
  let x = setting.startX;
  const order = setting.order && setting.order.length === segs.length ? setting.order : undefined;
  for (const i of order ?? segs.keys()) {
    xs[i] = x;
    x += advance(segs[i]!);
  }
  const runs: DisplayRun[] = [];
  let textStart = 0;
  segs.forEach((seg, i) => {
    const text = segmentShownText(seg);
    const fontString = seg.fontString ?? pickFont(style, !!seg.bold, !!seg.italic);
    const color = pickColor(style, seg);
    const run: DisplayRun = { text, x: xs[i]!, width: advance(seg), fontString, color, textStart };
    textStart += text.length;
    if (seg.bold) run.bold = true;
    if (seg.italic) run.italic = true;
    if (/\bsmall-caps\b/.test(fontString)) run.smallCaps = true;
    const t = tracking + (seg.tracking ?? 0);
    if (t !== 0 && seg.kind !== 'space') run.tracking = t;
    if (seg.script) run.script = seg.script;
    if (seg.baselineShift) run.baselineShift = -seg.baselineShift;
    if (seg.href !== undefined) run.href = seg.href;
    if ((seg.strike && seg.strike.from === undefined) || markedSpace(segs, i, 'strike')) run.strike = true;
    if ((seg.underline && seg.underline.from === undefined) || markedSpace(segs, i, 'underline')) run.underline = true;
    if (seg.footnoteId !== undefined) run.footnoteId = seg.footnoteId;
    if (seg.charStyle) run.namedStyle = { kind: 'span', id: seg.charStyle.style };
    if (seg.refResourceId !== undefined) run.refTarget = { id: seg.refResourceId, ...(seg.refAnchor ? { anchor: true } : {}) };
    if (seg.pageLink !== undefined) run.pageLink = seg.pageLink;
    if (seg.rtl) run.rtl = true;
    if (seg.leader) run.leader = true;
    annotate(run, seg);
    if (seg.kind === 'space') {
      if (setting.spaceWidth !== undefined && !(composed && seg.autospace)) run.space = true;
    } else if (seg.kind === 'math' && seg.mathRender) {
      const m = seg.mathRender;
      run.inline = { kind: 'math', ...(m.svg ? { svg: m.svg } : {}), widthPx: seg.width, heightPx: m.heightPx, ascentPx: m.ascentPx };
    } else if (seg.kind === 'score' && seg.scoreSystem) {
      const s = seg.scoreSystem;
      // Scaled to the segment's width and standing wholly on the baseline,
      // as the painters draw a system (canvas-backend/scoreRender.ts).
      const k = s.widthPx > 0 ? seg.width / s.widthPx : 1;
      run.inline = { kind: 'score', ...(s.svg ? { svg: s.svg } : {}), widthPx: seg.width, heightPx: s.heightPx * k, ascentPx: s.heightPx * k };
    } else if (seg.kind === 'swatch') {
      // The ink is the block's text colour, as the painters outline it.
      run.inline = { kind: 'swatch', widthPx: seg.width, heightPx: seg.swatch?.side ?? seg.width, swatch: swatchPaint(seg.swatch, style.color) };
    } else if (seg.chip) {
      // The chip's words in their own faces, its box under them.
      // Each chip run in its own emphasis colour, as `paintChip`'s inkFor.
      runs.push(...chipRuns(run, seg.chip, 0, (r) => (r.bold && style.boldColor) || (r.italic && style.italicColor) || style.color));
      return;
    }
    if (seg.leader === 'rule') {
      leaders.push({ x: run.x, width: run.width, fontString, color });
    }
    runs.push(run);
  });
  return runs;
}

function flags(line: VDTLine, out: DisplayLine): DisplayLine {
  if (line.hyphenated && !line.hardHyphen) out.addedHyphen = true;
  if (line.repeatedHyphen) out.repeatedHyphen = true;
  if (line.isLastLine) out.last = true;
  if (line.hardBreak) out.hardBreak = true;
  return out;
}

/**
 * A line of a flow block (paragraph, heading, list item, quote, note),
 * placed as the PDF places it, in the block's frame.
 */
export function placeBodyLine(
  line: VDTLine,
  block: Pick<VDTBlock, 'textAlign' | 'bbox' | 'letterSpacing' | 'direction'> & SourceBlock & LineStyle,
  vertical: boolean,
  options: DisplayListOptions | undefined,
  /** The page reads right to left (a block of its own direction aside). */
  rtlPage = false,
): PlacedLine {
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const composed = line.cjkComposed === true || vertical;
  const set = setSegments(line, composed, block, tracking, options);
  const setting = bodySetting(line, block, composed, tracking, set.segments, set.order);
  return finish(line, block, setting, composed, block, tracking, block.direction === 'rtl' || (rtlPage && block.direction !== 'ltr'), vertical, lineMeasure(line, block));
}

/**
 * A caption, note, continues or table-cell line: set from its own `bbox.x`
 * one segment after the other (in `order` when it carries one), with no
 * justification, as `paintLine` sets it. `source` gives the characters'
 * offsets when the text has a source of its own.
 */
export function placeResourceLine(line: VDTLine, style: LineStyle, vertical: boolean, options: DisplayListOptions | undefined): PlacedLine {
  const tracking = line.letterSpacing ?? 0;
  const composed = line.cjkComposed === true || vertical;
  const set = setSegments(line, composed, style, tracking, options);
  const setting: Setting = { segments: set.segments, order: set.order, startX: line.bbox.x, align: 'left' };
  return finish(line, {}, setting, composed, style, tracking, false, vertical, { x: line.bbox.x, width: line.bbox.width });
}

function finish(
  line: VDTLine,
  block: SourceBlock,
  setting: Setting,
  composed: boolean,
  style: LineStyle,
  tracking: number,
  rtlBlock: boolean,
  vertical: boolean,
  measure: { x: number; width: number },
): PlacedLine {
  const leaders: PlacedLine['leaders'] = [];
  const src = lineSource(block, line);
  let runs = runsOf(setting, composed, style, tracking, leaders);
  // Joined word pieces must spell the line as its own segments do.
  const joined = runs.map((r) => r.text).join('');
  if (setting.segments !== line.segments && joined !== src.text) {
    leaders.length = 0;
    runs = runsOf({ ...setting, segments: line.segments, order: line.order?.length === line.segments?.length ? line.order : undefined }, composed, style, tracking, leaders);
  }
  if (runs.length === 0 && line.text.length > 0) {
    // A line without segments: one run of the whole text.
    runs = [{ text: line.text, x: setting.startX, width: line.bbox.width, fontString: style.fontString, color: style.color, textStart: 0, ...(tracking ? { tracking } : {}) }];
  }
  const out: DisplayLine = {
    text: src.text,
    x: measure.x,
    width: measure.width,
    baseline: line.baseline,
    lineHeight: line.bbox.height,
    align: setting.align,
    runs,
    map: src.map,
  };
  if (setting.spaceWidth !== undefined) out.spaceWidth = setting.spaceWidth;
  if (rtlBlock) out.rtl = true;
  if (vertical) out.vertical = true;
  return { line: flags(line, out), atoms: src.atoms, leaders };
}

/** The measure a block line is set in: its own span, else from its start
 *  to the block's end (what justification fills). */
export function lineMeasure(line: VDTLine, block: Pick<VDTBlock, 'bbox'>): { x: number; width: number } {
  const span = line.measure;
  if (span) return { x: span.x, width: span.width };
  return { x: line.bbox.x, width: block.bbox.width - (line.bbox.x - block.bbox.x) };
}

/** A line's highlight bands (`:mark[…]`, #888), unplaced: painted under
 *  its text, in body, caption, note and cell lines alike. A band is
 *  relative to the line (x from its `bbox.x`, y from its baseline), as
 *  the PDF's `paintLineHighlights` reads it (`markItems.ts`). */
export const highlightRects = highlightShapes;

export { sizeOf };
