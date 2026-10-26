// Where things sit on a page: a resource's location, the segments of a
// line placed in paint order, mirrored pages and a page's resource blocks
// (#1276: split out of geometry.ts).
import { type VDTDocument, lineTextAlign, pageIsMirrored } from 'postext';
import { type VDTLine, type VDTSegment, type VDTBlock, segmentPlainLength, addsHyphen, opensWithRepeatedHyphen, xWithinSegment } from './segmentText.js';

/** Page-space position of a resource embed (inline block or float band). */
export interface ResourceLocation {
  pageIndex: number;
  x: number;
  y: number;
}

/**
 * Find where a resource ended up in the laid-out document. Inline embeds live
 * in `doc.blocks`; floated resources only exist in their page's float band.
 */
export function findResourceLocation(
  doc: VDTDocument,
  resourceId: string,
): ResourceLocation | null {
  for (const b of doc.blocks) {
    if (b.resourceBlock?.resource.id === resourceId) {
      return { pageIndex: b.pageIndex, x: b.bbox.x, y: b.bbox.y };
    }
  }
  for (const page of doc.pages) {
    for (const fb of page.floats ?? []) {
      if (fb.resourceBlock?.resource.id === resourceId) {
        return { pageIndex: page.index, x: fb.bbox.x, y: fb.bbox.y };
      }
    }
  }
  return null;
}

/** Walk already-positioned resource lines (caption / table cells): segments
 *  paint one after another from the line origin at natural widths, in
 *  `line.order` when the line holds right-to-left runs. */
export function segmentInResourceLines(
  lines: VDTLine[],
  xPage: number,
  yPage: number,
): VDTSegment | null {
  for (const line of lines) {
    if (yPage < line.bbox.y || yPage > line.bbox.y + line.bbox.height) continue;
    const segs = line.segments;
    if (!segs) continue;
    let x = line.bbox.x;
    for (const i of paintOrder(line, segs.length)) {
      const seg = segs[i]!;
      if (xPage >= x && xPage <= x + seg.width) {
        return seg;
      }
      x += seg.width;
    }
  }
  return null;
}

/** The segment of a body-text line under `xPage` (flow frame), placed
 *  where the renderers paint it (see {@link placeLineSegments}). */
export function segmentInBlockLine(
  block: VDTBlock,
  line: VDTLine,
  xPage: number,
): VDTSegment | null {
  for (const p of placeLineSegments(block, line, false, false) ?? []) {
    if (xPage >= p.x && xPage <= p.x + p.width) return p.seg;
  }
  return null;
}

/** The indices of `n` segments in the order the renderers advance through
 *  them: `line.order` when it lists them all, else logical order. */
function paintOrder(line: Pick<VDTLine, 'order'>, n: number): readonly number[] {
  if (line.order && line.order.length === n) return line.order;
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * A segment of a line where the renderers paint it, in the page's flow
 * frame: `x` and the advance it gets (`width`, a justified space's share of
 * the slack included), and the plain characters it stands for
 * (`plainStart` is relative to the line). `reversed` says its characters
 * run from its right edge to its left in the flow frame: a right-to-left
 * run on a left-to-right page, or a left-to-right run on a mirrored page,
 * whose flow is the sheet turned about its vertical axis.
 */
export interface PlacedSegment {
  seg: VDTSegment;
  x: number;
  width: number;
  plainStart: number;
  plainLen: number;
  reversed: boolean;
}

/**
 * Where each segment of a body-text line is painted, in logical order,
 * following the canvas line painter: from the line's start (its `measure`
 * span on a block set against its frame), justified lines filling their
 * span, centred and right-aligned lines shifted by their slack (as
 * {@link lineTextAlign} reads the block's alignment), and the segments
 * advancing in `line.order` when the line has one — a line holding
 * right-to-left runs, or any line of a mirrored page. A caret or a click
 * inside a bidi line then lands on the character painted there, not on the
 * one at the same distance from the line's logical start. With `fold`, the
 * runs of one `:ref` painted in pieces are one segment (see
 * {@link foldRefRuns}) spanning all of them. `mirrored`: the line is on a
 * right-to-left page (`pageIsMirrored`). Null for a line without segments.
 */
export function placeLineSegments(block: VDTBlock, line: VDTLine, mirrored: boolean, fold = true): PlacedSegment[] | null {
  const segs = line.segments;
  if (!segs || segs.length === 0) return null;
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const effectiveWidth = span ? span.width : block.bbox.x + block.bbox.width - lineX;
  let naturalWidth = 0;
  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    naturalWidth += seg.width;
    if (seg.kind === 'space') spaceCount++;
    else wordWidth += seg.width;
  }
  // A line set ragged inside a justified paragraph (a loose CJK line, a
  // line a URL left unfillable) is painted at its natural width; an
  // overfull last line has its spaces compressed to the measure. A line
  // holding a tab stop is set as measured (#622).
  const justify = block.textAlign === 'justify' && spaceCount > 0 && !line.tabbed
    && ((line.isLastLine === false && !line.ragged) || naturalWidth > effectiveWidth);
  const spaceWidth = justify ? (effectiveWidth - wordWidth) / spaceCount : undefined;
  const align = lineTextAlign(line, block.textAlign);
  const slack = Math.max(0, effectiveWidth - naturalWidth);
  const start = lineX + (justify ? 0 : align === 'center' ? slack / 2 : align === 'right' ? slack : 0);

  const xs = new Array<number>(segs.length).fill(start);
  const widths = segs.map((seg) => (seg.kind === 'space' && spaceWidth !== undefined ? spaceWidth : seg.width));
  let x = start;
  for (const i of paintOrder(line, segs.length)) {
    xs[i] = x;
    x += widths[i]!;
  }

  const out: PlacedSegment[] = [];
  const lastIdx = segs.length - 1;
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const plainLen = segmentPlainLength(seg, i === lastIdx && addsHyphen(line), opensWithRepeatedHyphen(line, i));
    const last = out[out.length - 1];
    if (fold && seg.refContinues && last && last.seg.refResourceId === seg.refResourceId) {
      // One reference painted in pieces: one box over all of them.
      const left = Math.min(last.x, xs[i]!);
      const right = Math.max(last.x + last.width, xs[i]! + widths[i]!);
      out[out.length - 1] = { ...last, seg: { ...last.seg, text: last.seg.text + seg.text, width: last.seg.width + seg.width }, x: left, width: right - left };
    } else {
      out.push({ seg, x: xs[i]!, width: widths[i]!, plainStart: cum, plainLen, reversed: (seg.rtl === true) !== mirrored });
    }
    cum += plainLen;
  }
  return out;
}

/** The x (flow frame) of plain offset `within` of a placed segment. */
export function xInPlaced(p: PlacedSegment, within: number): number {
  const dx = xWithinSegment(p.seg, within, p.plainLen, p.width);
  return p.reversed ? p.x + p.width - dx : p.x + dx;
}

/** Whether page `pageIndex` of `doc` is set right to left in a mirrored
 *  flow frame. */
export function isMirroredPage(doc: VDTDocument, pageIndex: number): boolean {
  const page = doc.pages[pageIndex];
  return page ? pageIsMirrored(page) : false;
}

/**
 * Every visible resource embed painted on a page: inline `::resource` blocks
 * from `doc.blocks` plus the page's float band(s). Float bands may carry
 * non-resource blocks (fixed callouts); only `resourceBlock` carriers count.
 */
export function resourceBlocksOnPage(doc: VDTDocument, pageIndex: number): VDTBlock[] {
  const out: VDTBlock[] = [];
  for (const b of doc.blocks) {
    if (b.pageIndex === pageIndex && b.resourceBlock && !b.hidden) out.push(b);
  }
  for (const fb of doc.pages[pageIndex]?.floats ?? []) {
    if (fb.resourceBlock && !fb.hidden) out.push(fb);
  }
  return out;
}
