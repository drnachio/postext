// Line numbers in the margin (#621). A pass over the finished layout:
// once a pass has placed every line and stamped its page labels, the
// lines are walked in reading order (page by page, column by column, top
// to bottom), counted, and every Nth one gets its number in a design slot
// of its page (`VDTPage.lineNumbers`). The numbers are painted where the
// layout leaves room for them and never move a line, so balancing and
// re-breaks cannot invalidate them: each pass counts its own layout.
//
// What is counted (`lineNumbers.count`):
// - `'verse'`: the lines of `:::verse` poems, once per line of verse — a
//   turnover (`VDTLine.verseLine.turnover`, the ʿajuz of a staggered
//   bayt) takes no number;
// - `'all'`: every line of body paragraphs, list items, quotations and
//   verse.
// Never: headings, captions, tables and pictures, display maths, design
// text, notes, the contents and the index, and the text of a callout —
// unless the paragraph style the text is set in says `lineNumbers: true`
// (a style with `lineNumbers: false` is never counted).
//
// The count starts again at `lineNumbers.restart` (a chapter, a section,
// a page, a poem), at a `:::numbering{lines=N}` directive, and at a poem
// whose fence sets `lineStart=N`.

import type { ContentBlock } from '../parse';
import type { LayoutContinuation, ResolvedLineNumbersConfig } from '../types';
import {
  type ResolvedConfig,
  createBoundingBox,
  flowRectToPage,
  pageIsVertical,
  type BoundingBox,
  type ContentWarning,
  type VDTBlock,
  type VDTColumn,
  type VDTDesignTextBlock,
  type VDTDocument,
  type VDTLine,
  type VDTLineNumberMark,
  type VDTPage,
} from '../vdt';
import { buildFontString } from '../measure';
import { measureTextWidth } from '../measure/canvas';
import { dimensionToPx } from '../units';
import { formatNumeral, parseNumberFormat } from '../numbering';
import { isRtlScriptChar } from '../bidi';
import { resolvedLocale } from './config';

/** What changes the count at a point of the content. */
type LineCountEvent =
  | { kind: 'heading'; level: number }
  | { kind: 'numbering'; next: number }
  | { kind: 'poem'; poem: number; lineStart?: number };

/** How a poem's fence numbers it: skipped (`numbered=false`), its own
 *  interval (`interval=N`), its first line's number (`lineStart=N`). */
interface PoemNumbering {
  numbered: boolean;
  interval?: number;
  lineStart?: number;
}

/** A whole number ≥ `min` written in a directive attribute. */
function wholeAttr(value: string | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value.trim());
  return Number.isInteger(n) && n >= min ? n : undefined;
}

/** The numbering a poem's fence asks for. */
export function poemNumbering(attrs: Readonly<Record<string, string>> | undefined): PoemNumbering {
  const numbered = attrs?.numbered?.trim().toLowerCase();
  const interval = wholeAttr(attrs?.interval, 1);
  const lineStart = wholeAttr(attrs?.lineStart, 0);
  return {
    numbered: numbered !== 'false' && numbered !== 'no' && numbered !== '0',
    ...(interval !== undefined ? { interval } : {}),
    ...(lineStart !== undefined ? { lineStart } : {}),
  };
}

/** The poem a content block sets, as numbered in the document (bayt
 *  poems, one block each, are numbered after their index). */
function poemKey(block: ContentBlock, index: number): number {
  return block.verse?.stanza ? block.verse.stanza.poem : -1 - index;
}

/** Whether a content block opens a poem. */
function opensPoem(block: ContentBlock): boolean {
  return block.verse !== undefined && (block.verse.stanza === undefined || block.verse.stanza.index === 0);
}

/** The events of `blocks`, by content index. */
function lineCountEvents(blocks: readonly ContentBlock[]): Map<number, LineCountEvent[]> {
  const events = new Map<number, LineCountEvent[]>();
  const push = (i: number, e: LineCountEvent) => {
    const list = events.get(i);
    if (list) list.push(e);
    else events.set(i, [e]);
  };
  blocks.forEach((b, i) => {
    if (b.type === 'heading' && b.level) push(i, { kind: 'heading', level: b.level });
    else if (b.type === 'directive' && b.directiveName === 'numbering') {
      const next = wholeAttr(b.directiveAttrs?.lines, 0);
      if (next !== undefined) push(i, { kind: 'numbering', next });
    } else if (opensPoem(b)) {
      const { lineStart } = poemNumbering(b.verse!.attrs);
      push(i, { kind: 'poem', poem: poemKey(b, i), ...(lineStart !== undefined ? { lineStart } : {}) });
    }
  });
  return events;
}

/** The running count: the last number given, whether the next counted
 *  line is the first after a restart, and whether the count restarted. */
class LineCounter {
  value: number;
  fresh: boolean;
  restarted = false;

  constructor(private readonly cfg: ResolvedLineNumbersConfig, inherited: number | undefined) {
    const continues = inherited !== undefined && cfg.restart !== 'page' && cfg.restart !== 'poem';
    this.value = continues ? inherited : cfg.startAt - 1;
    this.fresh = !continues;
    if (!continues && inherited !== undefined) this.restarted = true;
  }

  /** Start again so that the next line is numbered `next`. */
  restart(next = this.cfg.startAt): void {
    this.value = next - 1;
    this.fresh = true;
    this.restarted = true;
  }

  apply(e: LineCountEvent): void {
    if (e.kind === 'numbering') this.restart(e.next);
    else if (e.kind === 'heading') {
      if ((this.cfg.restart === 'chapter' && e.level === 1) || (this.cfg.restart === 'section' && e.level <= 2)) this.restart();
    } else if (e.lineStart !== undefined) this.restart(e.lineStart);
    else if (this.cfg.restart === 'poem') this.restart();
  }

  /** Count one line: its number, and whether it is printed. */
  next(interval: number): { n: number; printed: boolean } {
    this.value += 1;
    const first = this.fresh;
    this.fresh = false;
    return { n: this.value, printed: this.value % interval === 0 || (first && this.cfg.numberFirst) };
  }
}

/** Whether the text of a paragraph style is counted: its own
 *  `lineNumbers`, else `fallback`. */
function styleCounts(resolved: ResolvedConfig, styleId: string | undefined, fallback: boolean): boolean {
  if (!styleId) return fallback;
  const own = resolved.paragraphStyles.find((s) => s.id === styleId)?.lineNumbers;
  return own ?? fallback;
}

/** Blocks whose lines are never counted. */
function neverCounted(block: VDTBlock): boolean {
  return block.type === 'heading' || block.type === 'resource' || block.type === 'mathDisplay' || block.type === 'callout'
    || block.hidden === true || block.designOverlay !== undefined
    || block.footnoteNote !== undefined || block.tocEntry !== undefined || block.tocPart !== undefined
    || block.indexLevel !== undefined || block.bibEntry !== undefined || block.comic !== undefined;
}

/** How the lines of `block` are counted: not at all, as verse (a line of
 *  verse once, its turnovers not), or line by line (prose). */
function blockCounting(
  block: VDTBlock,
  raw: ContentBlock | undefined,
  resolved: ResolvedConfig,
  cfg: ResolvedLineNumbersConfig,
): 'none' | 'verse' | 'prose' {
  if (neverCounted(block)) return 'none';
  const styleId = block.paragraphStyleId;
  // A box's text is counted only when its style opts in.
  if (block.containerId !== undefined) {
    if (!styleCounts(resolved, styleId, false)) return 'none';
    return raw?.verse ? 'verse' : 'prose';
  }
  if (raw?.verse) {
    if (!poemNumbering(raw.verse.attrs).numbered) return 'none';
    return styleCounts(resolved, styleId, true) ? 'verse' : 'none';
  }
  return styleCounts(resolved, styleId, cfg.count === 'all') ? 'prose' : 'none';
}

/** Whether a line of a poem takes a number: a line of verse, not a
 *  turnover or the second line of a staggered bayt. */
function isLineOfVerse(line: VDTLine): boolean {
  if (line.verseLine) return !line.verseLine.turnover;
  if (line.verse) return line.verse.part !== 'ajuz';
  return false;
}

/** One number to place on a page. */
interface PendingNumber {
  mark: VDTLineNumberMark;
  baseline: number;
  column: VDTColumn;
  line: VDTLine;
  block: VDTBlock;
}

/** The overlaps of side-column numbers with floats, per document. */
const overlapWarnings = new WeakMap<VDTDocument, ContentWarning[]>();

/** The `lineNumberOverlap` warnings of the last pass laid out as `doc`. */
export function lineNumberWarnings(doc: VDTDocument): ContentWarning[] {
  return overlapWarnings.get(doc) ?? [];
}

/**
 * Count the lines of `doc` and set the numbers of the printed ones in
 * `page.lineNumbers` (with `page.lineNumberMarks`), and the last number in
 * `doc.lastLineNumber`. `blocks` are the parsed content blocks the layout
 * was built from (`VDTBlock.contentIndex` points into them);
 * `continuation.lineNumber` is the number the count goes on from. A
 * vertical document gets no numbers.
 */
export function buildLineNumbers(
  doc: VDTDocument,
  blocks: readonly ContentBlock[],
  continuation: Pick<LayoutContinuation, 'lineNumber'> | undefined,
): void {
  const resolved = doc.config;
  const cfg = resolved.lineNumbers;
  if (!cfg?.enabled || resolved.layout.writingMode === 'vertical-rl') return;
  const dpi = resolved.page.dpi;
  const bodyPx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const sizePx = dimensionToPx(cfg.fontSize, dpi, bodyPx);
  const gapPx = dimensionToPx(cfg.gap, dpi, sizePx);
  const font = buildFontString(cfg.fontFamily, sizePx, cfg.fontWeight === 400 ? 'normal' : String(cfg.fontWeight), cfg.italic ? 'italic' : 'normal');
  const style = parseNumberFormat(cfg.format, resolvedLocale(resolved)) ?? 'decimal';
  const events = lineCountEvents(blocks);
  const eventIndices = [...events.keys()].sort((a, b) => a - b);
  let nextEvent = 0;
  const counter = new LineCounter(cfg, continuation?.lineNumber);
  const poems = new Map<number, PoemNumbering>();
  const warnings: ContentWarning[] = [];
  const offset = doc.pageIndexOffset ?? 0;

  for (const page of doc.pages) {
    if (pageIsVertical(page)) continue;
    if (cfg.restart === 'page') counter.restart();
    const pending: PendingNumber[] = [];
    for (const column of page.columns) {
      if (column.kind === 'side') continue;
      for (const block of column.blocks) {
        const c = block.contentIndex;
        if (c !== undefined) {
          while (nextEvent < eventIndices.length && eventIndices[nextEvent]! <= c) {
            for (const e of events.get(eventIndices[nextEvent]!)!) counter.apply(e);
            nextEvent++;
          }
        }
        const raw = c !== undefined ? blocks[c] : undefined;
        const counting = blockCounting(block, raw, resolved, cfg);
        if (counting === 'none') continue;
        let interval = cfg.interval;
        if (raw?.verse) {
          const key = poemKey(raw, c!);
          let poem = poems.get(key);
          if (!poem) {
            poem = poemNumbering(raw.verse.attrs);
            poems.set(key, poem);
          }
          interval = poem.interval ?? interval;
        }
        block.lines.forEach((line, lineIndex) => {
          if (counting === 'verse' ? !isLineOfVerse(line) : line.text.length === 0 && !line.segments?.length) return;
          const { n, printed } = counter.next(interval);
          if (!printed) return;
          pending.push({
            mark: { number: n, label: formatNumeral(n, style, resolved.numerals), columnIndex: column.index, blockId: block.id, lineIndex },
            baseline: line.baseline,
            column,
            line,
            block,
          });
        });
      }
    }
    if (pending.length > 0) placeNumbers(page, pending, { cfg, resolved, font, sizePx, gapPx, offset, warnings });
  }
  doc.lastLineNumber = counter.value;
  if (counter.restarted) doc.lineNumberRestarted = true;
  if (warnings.length > 0) overlapWarnings.set(doc, warnings);
}

interface PlaceContext {
  cfg: ResolvedLineNumbersConfig;
  resolved: ResolvedConfig;
  font: string;
  sizePx: number;
  gapPx: number;
  offset: number;
  warnings: ContentWarning[];
}

/** The physical side of a column the numbers of `position` stand on
 *  (`'side'` is placed apart). */
function sideFor(position: ResolvedLineNumbersConfig['position'], page: VDTPage, ctx: PlaceContext): 'left' | 'right' {
  const recto = (page.index + ctx.offset) % 2 === 0;
  const outerRight = recto !== (ctx.resolved.page.binding === 'right');
  const rtl = ctx.resolved.direction === 'rtl';
  switch (position) {
    case 'left': return 'left';
    case 'right': return 'right';
    case 'inner': return outerRight ? 'left' : 'right';
    case 'start': return rtl ? 'right' : 'left';
    case 'end': return rtl ? 'left' : 'right';
    default: return outerRight ? 'right' : 'left';
  }
}

/** Set the numbers of one page in its slot. */
function placeNumbers(page: VDTPage, pending: readonly PendingNumber[], ctx: PlaceContext): void {
  const { cfg, font, sizePx, gapPx } = ctx;
  const widths = pending.map((p) => measureTextWidth(p.mark.label, font));
  const widest = Math.max(...widths);
  const ascent = sizePx * 0.8;
  const physical = new Map<VDTColumn, BoundingBox>();
  const rectOf = (col: VDTColumn): BoundingBox => {
    let r = physical.get(col);
    if (!r) {
      r = flowRectToPage(page, col.bbox);
      physical.set(col, r);
    }
    return r;
  };
  const sideColumns = page.columns.filter((c) => c.kind === 'side');
  // Text columns side by side in one band.
  const bandColumns = (col: VDTColumn): VDTColumn[] => page.columns
    .filter((c) => (c.kind ?? 'text') === 'text' && (c.band ?? 0) === (col.band ?? 0))
    .sort((a, b) => rectOf(a).x - rectOf(b).x);
  const sideRule = (col: VDTColumn): 'left' | 'right' => {
    const base = sideFor(cfg.position === 'side' ? 'outer' : cfg.position, page, ctx);
    if ((col.kind ?? 'text') !== 'text') return base;
    const band = bandColumns(col);
    if (band.length < 2) return base;
    const at = band.indexOf(col);
    if (cfg.multiColumn === 'gutter') return at === 0 ? 'right' : 'left';
    if (cfg.multiColumn === 'outer-edges') {
      if (at === 0) return 'left';
      if (at === band.length - 1) return 'right';
    }
    return base;
  };
  // The side column beside a text column, when numbers go there.
  const sideColumnOf = (col: VDTColumn, baseline: number): VDTColumn | undefined => {
    if (cfg.position !== 'side' || sideColumns.length === 0) return undefined;
    return sideColumns.find((s) => {
      const r = rectOf(s);
      return baseline >= r.y && baseline <= r.y + r.height;
    }) ?? sideColumns.find((s) => (s.band ?? 0) === (col.band ?? 0)) ?? sideColumns[0];
  };
  const floats = cfg.position === 'side'
    ? [...(page.floats ?? []), ...sideColumns.flatMap((s) => s.blocks)].map((b) => ({ block: b, rect: flowRectToPage(page, b.bbox) }))
    : [];

  const textBlocks: VDTDesignTextBlock[] = [];
  const marks: VDTLineNumberMark[] = [];
  pending.forEach((p, i) => {
    const w = widths[i]!;
    const col = rectOf(p.column);
    const side = sideColumnOf(p.column, p.baseline);
    let x: number;
    if (side) {
      const s = rectOf(side);
      if (s.x >= col.x) {
        // The side column on the right: flush with its left edge.
        x = cfg.align === 'right' ? s.x + widest - w : s.x;
      } else {
        const edge = s.x + s.width;
        x = cfg.align === 'left' ? edge - widest : edge - w;
      }
    } else if (sideRule(p.column) === 'left') {
      const edge = col.x - gapPx;
      x = cfg.align === 'left' ? edge - widest : edge - w;
    } else {
      const edge = col.x + col.width + gapPx;
      x = cfg.align === 'right' ? edge + widest - w : edge;
    }
    const bbox = createBoundingBox(x, p.baseline - ascent, w, sizePx);
    if (side) {
      const hit = floats.find((f) => f.rect.x < bbox.x + bbox.width && bbox.x < f.rect.x + f.rect.width
        && f.rect.y < bbox.y + bbox.height && bbox.y < f.rect.y + f.rect.height);
      if (hit) {
        const start = p.line.sourceStart ?? p.block.sourceStart;
        const end = p.line.sourceEnd ?? p.block.sourceEnd;
        ctx.warnings.push({
          kind: 'lineNumberOverlap',
          number: p.mark.label,
          pageIndex: page.index,
          ...(start !== undefined && end !== undefined ? { sourceStart: start, sourceEnd: end } : {}),
        });
      }
    }
    const label = p.mark.label;
    const rtl = [...label].some((ch) => isRtlScriptChar(ch.codePointAt(0)!));
    textBlocks.push({
      kind: 'text',
      bbox,
      fontString: font,
      color: cfg.color.hex,
      lines: [{
        text: label,
        xOffset: 0,
        baselineY: p.baseline,
        width: w,
        ...(rtl ? { runs: [{ text: label, fontString: font, width: w, rtl: true as const }] } : {}),
      }],
      clip: false,
      artifact: true,
      ...(rtl ? { direction: 'rtl' as const } : {}),
    });
    marks.push(p.mark);
  });
  const left = Math.min(...textBlocks.map((b) => b.bbox.x));
  const top = Math.min(...textBlocks.map((b) => b.bbox.y));
  const right = Math.max(...textBlocks.map((b) => b.bbox.x + b.bbox.width));
  const bottom = Math.max(...textBlocks.map((b) => b.bbox.y + b.bbox.height));
  page.lineNumbers = { bbox: createBoundingBox(left, top, right - left, bottom - top), blocks: textBlocks };
  page.lineNumberMarks = marks;
}

/** Recolour the numbers of the pages whose part or section palette
 *  overrides the entry `lineNumbers.color` links to. */
export function recolorLineNumbers(doc: VDTDocument, palettes: readonly (Record<string, string> | undefined)[]): void {
  const linked = doc.config.lineNumbers?.color.paletteId;
  if (!linked) return;
  for (const page of doc.pages) {
    const hex = palettes[page.index]?.[linked];
    if (!hex || !page.lineNumbers) continue;
    for (const b of page.lineNumbers.blocks) if (b.kind === 'text') b.color = hex;
  }
}

/**
 * The number of the last line of verse in `blocks` (#621), counted from
 * `before` as the layout counts it, when `lineNumbers` counts verse: a
 * book laid out one chapter at a time hands it on (`continuationAfter`).
 * Undefined when the count does not depend on the text alone (line
 * numbers off, or every line counted, which only the layout knows), so
 * the caller keeps what it had.
 */
export function lastVerseLineNumber(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  before: number | undefined,
): number | undefined {
  const cfg = resolved.lineNumbers;
  if (!cfg?.enabled || cfg.count !== 'verse' || cfg.restart === 'page' || resolved.layout.writingMode === 'vertical-rl') return undefined;
  // Prose styles that opt in are counted line by line: only the layout
  // knows their lines.
  if (resolved.paragraphStyles.some((s) => s.lineNumbers === true)) return undefined;
  const counter = new LineCounter(cfg, before);
  const events = lineCountEvents(blocks);
  let insideBox = 0;
  blocks.forEach((b, i) => {
    for (const e of events.get(i) ?? []) counter.apply(e);
    if (b.type === 'containerStart' && b.containerName === 'callout') insideBox++;
    else if (b.type === 'containerEnd' && b.containerName === 'callout') insideBox = Math.max(0, insideBox - 1);
    if (!b.verse || !poemNumbering(b.verse.attrs).numbered) return;
    // A poem in a box is counted only when its style opts in.
    const styleId = b.verse.attrs.style?.trim();
    if (!styleCounts(resolved, styleId, insideBox === 0)) return;
    const lines = b.verse.stanza ? b.verse.stanza.lines.length : b.text.split('\n').filter((l) => l.trim().length > 0).length;
    for (let k = 0; k < lines; k++) counter.next(1);
  });
  return counter.value;
}
