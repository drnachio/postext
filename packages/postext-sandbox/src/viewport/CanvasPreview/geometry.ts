import type { VDTDocument } from 'postext';
import { pageToFlow, resourceBlockToLocal } from 'postext';
import { bandCharAtX, bandLineBoxes, bandPlainToSource, bandTitleBlocks, isHiddenUnderBand } from './bandTitle';

type VDTBlock = VDTDocument['blocks'][number];
type VDTLine = VDTBlock['lines'][number];
type VDTSegment = NonNullable<VDTLine['segments']>[number];

/**
 * Plain-text chars a rendered segment occupies in the block's `text` /
 * `sourceMap`. An inline `:ref` renders its resolved label ("tabla 1.1") but
 * is a single placeholder char in the plain text, so it must count as 1 or
 * every glyph after it on the line maps to the wrong source offset. Mirrors
 * the line-length math in `stampSourceRanges`. The hyphen a break added at
 * the end of a hyphenated line's last segment has no source char either
 * (see {@link addsHyphen}), nor the hyphen a line opens with when it repeats
 * the one of the compound the line before broke at (`dropLeadingHyphen`,
 * see {@link opensWithRepeatedHyphen}).
 */
export function segmentPlainLength(seg: VDTSegment, dropTrailingHyphen: boolean, dropLeadingHyphen = false): number {
  // Brackets the layout added (a book title's 《》, a warichu note's) are
  // no plain text (#193, #195).
  if (seg.refContinues || seg.inserted) return 0;
  if (seg.refResourceId !== undefined) return 1;
  if (seg.kind === 'swatch') return 1;
  let len = seg.text.length;
  if (dropLeadingHyphen && seg.text.startsWith('-')) len--;
  if (dropTrailingHyphen && seg.text.endsWith('-') && len > 0) len--;
  return Math.max(0, len);
}

/** Whether segment `i` of a line opens with the hyphen the line repeats
 *  from the compound the line before broke at (`bodyText.repeatHyphen`):
 *  the line's first segment, on a line flagged `repeatedHyphen`. */
export function opensWithRepeatedHyphen(line: Pick<VDTLine, 'repeatedHyphen'>, i: number): boolean {
  return i === 0 && line.repeatedHyphen === true;
}

/** Whether the hyphen a line ends with was added by its break, and so has
 *  no plain char: a hyphenated line, unless it broke after a hyphen the text
 *  carries (`hardHyphen`, "well-" | "known"). */
export function addsHyphen(line: Pick<VDTLine, 'hyphenated' | 'hardHyphen'>): boolean {
  return line.hyphenated === true && line.hardHyphen !== true;
}

/**
 * A line's segments with the runs of one `:ref` painted in pieces (a label
 * in small capitals: one run per case, the later ones `refContinues`)
 * folded into one segment, so the caret and click math treat the whole
 * label as the reference's single plain char. Returns `segs` itself when
 * nothing folds.
 */
export function foldRefRuns(segs: readonly VDTSegment[]): VDTSegment[] {
  if (!segs.some((s) => s.refContinues)) return segs as VDTSegment[];
  const out: VDTSegment[] = [];
  for (const seg of segs) {
    const last = out[out.length - 1];
    if (seg.refContinues && last && last.refResourceId === seg.refResourceId) {
      out[out.length - 1] = { ...last, text: last.text + seg.text, width: last.width + seg.width };
    } else {
      out.push(seg);
    }
  }
  return out;
}

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : undefined;

/**
 * Where the graphemes of a segment start, as offsets into its text, with
 * the text's length last — or null when every UTF-16 unit is a grapheme and
 * the segment is not tracked, so the linear mapping over units is exact.
 * A tracked segment (a justified CJK line) spreads its characters evenly,
 * one share of its width per grapheme; a supplementary-plane ideograph (𠺕)
 * is one grapheme of two units, which the caret never lands inside.
 */
export function segmentGraphemeStarts(seg: Pick<VDTSegment, 'text' | 'tracking'>): number[] | null {
  const text = seg.text;
  const complex = /[\uD800-\uDFFF\u0300-\u036F\u200D\uFE00-\uFE0F]/.test(text);
  if (!complex && seg.tracking === undefined) return null;
  const starts: number[] = [];
  if (graphemeSegmenter && complex) {
    for (const g of graphemeSegmenter.segment(text)) starts.push(g.index);
  } else {
    for (let i = 0; i < text.length; i++) starts.push(i);
  }
  starts.push(text.length);
  return starts;
}

/** The x of plain offset `within` (UTF-16 units into the segment, up to
 *  `plainLen`) over a segment `rendered` px wide: grapheme by grapheme when
 *  {@link segmentGraphemeStarts} gives its boundaries, else linearly. */
function xWithinSegment(seg: VDTSegment, within: number, plainLen: number, rendered: number): number {
  // A warichu note's part: the offset falls in its upper row, or past it in
  // the lower one (#195); both rows advance by the same cell.
  if (seg.warichu) {
    const w = seg.warichu;
    const cell = warichuCell(seg);
    return within <= w.upper.length ? within * cell : (within - w.upper.length) * cell;
  }
  const starts = seg.kind === 'text' ? segmentGraphemeStarts(seg) : null;
  if (!starts || starts.length < 2) return plainLen > 0 ? (within / plainLen) * rendered : 0;
  const n = starts.length - 1;
  let k = 0;
  while (k < n && starts[k + 1]! <= within) k++;
  return (k / n) * rendered;
}

/** The advance of one character of a warichu part's rows: the part's
 *  width (its tracking left out) over the longer row. */
function warichuCell(seg: VDTSegment): number {
  const w = seg.warichu!;
  const n = Math.max(1, w.upper.length, w.lower.length);
  return (seg.width - (seg.tracking ?? 0)) / n;
}

/**
 * The plain offset (UTF-16 units into the segment) of a click `dx` px along
 * a warichu note's part and `dy` px from the line's baseline (flow frame):
 * above the line's axis the upper row, below it the lower one, whose
 * characters follow the upper row's in the plain text (#195).
 */
export function warichuOffset(seg: VDTSegment, dx: number, dy: number): number {
  const w = seg.warichu!;
  const noteEm = w.lowerDy - w.upperDy;
  const axis = (w.upperDy + w.lowerDy) / 2 - 0.38 * noteEm;
  const cell = warichuCell(seg);
  const k = (n: number) => Math.max(0, Math.min(n, Math.round(dx / (cell || 1))));
  return dy < axis ? k(w.upper.length) : w.upper.length + k(w.lower.length);
}

/** The plain offset (UTF-16 units into the segment, at most `plainLen`) of
 *  the grapheme boundary nearest to `dx` px into a segment `rendered` px
 *  wide (see {@link xWithinSegment}). */
function offsetWithinSegment(seg: VDTSegment, dx: number, plainLen: number, rendered: number): number {
  const ratio = rendered > 0 ? dx / rendered : 0;
  const starts = seg.kind === 'text' ? segmentGraphemeStarts(seg) : null;
  if (!starts || starts.length < 2) return Math.round(ratio * plainLen);
  const n = starts.length - 1;
  const k = Math.max(0, Math.min(n, Math.round(ratio * n)));
  return Math.min(plainLen, starts[k]!);
}

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
 *  paint sequentially from the line origin at natural widths. */
function refInResourceLines(
  lines: VDTLine[],
  xPage: number,
  yPage: number,
): string | null {
  for (const line of lines) {
    if (yPage < line.bbox.y || yPage > line.bbox.y + line.bbox.height) continue;
    if (!line.segments) continue;
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (xPage >= x && xPage <= x + seg.width) {
        return seg.refResourceId ?? null;
      }
      x += seg.width;
    }
  }
  return null;
}

/** Walk a body-text line mirroring the renderers' justify-fill math. */
function refInBlockLine(
  block: VDTBlock,
  line: VDTLine,
  xPage: number,
): string | null {
  const segs = line.segments;
  if (!segs || segs.length === 0) return null;
  const blockRight = block.bbox.x + block.bbox.width;
  const justifyFill = block.textAlign === 'justify' && line.isLastLine === false && !line.ragged;
  let naturalWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    naturalWidth += seg.width;
    if (seg.kind === 'space') spaceCount++;
  }
  const renderedWidth = justifyFill
    ? Math.max(naturalWidth, blockRight - line.bbox.x)
    : naturalWidth;
  const extraPerSpace = justifyFill && spaceCount > 0
    ? Math.max(0, (renderedWidth - naturalWidth) / spaceCount)
    : 0;
  let x = line.bbox.x;
  for (const seg of segs) {
    const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
    if (xPage >= x && xPage <= x + segRendered) {
      return seg.refResourceId ?? null;
    }
    x += segRendered;
  }
  return null;
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

/**
 * Hit-test a `:ref` segment at page-space pixel coordinates. Checks body-text
 * blocks plus resource captions / table cells (including float bands).
 * Returns the referenced resource id, or null when the click isn't on a ref.
 */
type VDTPageOf = VDTDocument['pages'][number];
type DesignSlotOf = NonNullable<VDTPageOf['openerBand']>;

/**
 * The image a design slot draws under a page pixel — an opener band's cover
 * picture, a header logo, an advanced heading design's plate — as the blob
 * id the block was resolved to, or null when none is there. Slots paint in
 * order (in-column overlays, then the opener band, header and footer) and
 * later blocks over earlier ones, so the last hit wins. The point is on the
 * sheet: on a vertical page it is turned into the flow frame for every slot
 * but the header and the footer.
 */
export function designImageFileIdAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): string | null {
  const page = doc.pages[pageIndex];
  if (!page) return null;
  const slots: DesignSlotOf[] = [];
  for (const b of doc.blocks) {
    if (b.pageIndex === pageIndex && b.designOverlay) slots.push(b.designOverlay);
  }
  if (page.openerBand) slots.push(page.openerBand);
  const flow = pageToFlow(page, xPage, yPage);
  const sheetSlots = new Set<DesignSlotOf>();
  if (page.header) { slots.push(page.header); sheetSlots.add(page.header); }
  if (page.footer) { slots.push(page.footer); sheetSlots.add(page.footer); }
  let hit: string | null = null;
  for (const slot of slots) {
    const { x, y } = sheetSlots.has(slot) ? { x: xPage, y: yPage } : flow;
    for (const block of slot.blocks) {
      if (block.kind !== 'image') continue;
      const r = block.bbox;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) hit = block.fileId;
    }
  }
  return hit;
}

export function refResourceIdAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): string | null {
  const candidates: VDTBlock[] = doc.blocks.filter((b) => b.pageIndex === pageIndex && !b.resourceBlock);
  for (const rb of resourceBlocksOnPage(doc, pageIndex)) candidates.push(rb);

  for (const b of candidates) {
    if (b.hidden) continue;
    if (xPage < b.bbox.x || xPage > b.bbox.x + b.bbox.width) continue;
    if (yPage < b.bbox.y || yPage > b.bbox.y + b.bbox.height) continue;
    const rb = b.resourceBlock;
    if (rb) {
      // A rotated block keeps its lines in its upright frame.
      const p = resourceBlockToLocal(rb, xPage, yPage);
      const inCaption = refInResourceLines(rb.captionLines, p.x, p.y);
      if (inCaption !== null) return inCaption;
      if (rb.table) {
        for (const cell of rb.table.cells) {
          const inCell = refInResourceLines(cell.lines, p.x, p.y);
          if (inCell !== null) return inCell;
        }
      }
      continue;
    }
    for (const line of b.lines) {
      if (yPage < line.bbox.y || yPage > line.bbox.y + line.bbox.height) continue;
      const hit = refInBlockLine(b, line, xPage);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/**
 * Hit-test a row of the contents (`:::toc`) at page-space pixel
 * coordinates: the book page index the row points at, or null when the
 * click isn't on a row that knows its page.
 */
export function pageTargetAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): number | null {
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex || b.hidden) continue;
    const target = b.tocEntry?.pageIndex ?? b.tocPart?.pageIndex;
    if (target === undefined) continue;
    if (xPage < b.bbox.x || xPage > b.bbox.x + b.bbox.width) continue;
    if (yPage < b.bbox.y || yPage > b.bbox.y + b.bbox.height) continue;
    return target;
  }
  return null;
}

/**
 * Convert an absolute source offset (in the original markdown) to a plain-text
 * character index within the given block's plain text. Returns null if the
 * offset is outside the block. Uses the block's per-char sourceMap plus any
 * numbering prefix length.
 */
export function sourceToPlainIndex(
  block: VDTDocument['blocks'][number],
  srcOffset: number,
): number | null {
  if (!block.sourceMap || block.sourceStart === undefined || block.sourceEnd === undefined) return null;
  const prefixLen = block.plainPrefixLen ?? 0;
  if (srcOffset < block.sourceStart) return null;
  if (srcOffset >= block.sourceEnd) return prefixLen + block.sourceMap.length;
  // Binary search: smallest i with sourceMap[i] >= srcOffset
  let lo = 0;
  let hi = block.sourceMap.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (block.sourceMap[mid]! < srcOffset) lo = mid + 1;
    else hi = mid;
  }
  return prefixLen + lo;
}

/**
 * Given a line and an in-line plain-char offset, compute the exact x
 * coordinate (in page-space px) using per-segment widths and, for justified
 * non-last lines, distributing the slack over space segments.
 */
export function xForPlainInLine(
  block: VDTDocument['blocks'][number],
  line: VDTDocument['blocks'][number]['lines'][number],
  inLineOffset: number,
): number {
  const blockRight = block.bbox.x + block.bbox.width;
  const lineLen = Math.max(0, (line.plainEnd ?? 0) - (line.plainStart ?? 0));
  // A line set ragged inside a justified paragraph (a loose CJK line, a
  // line a URL left unfillable) is painted at its natural width.
  const justifyFill = block.textAlign === 'justify' && line.isLastLine === false && !line.ragged;
  const segs = line.segments && foldRefRuns(line.segments);

  if (!segs || segs.length === 0) {
    const renderedWidth = justifyFill
      ? Math.max(line.bbox.width, blockRight - line.bbox.x)
      : line.bbox.width;
    const ratio = lineLen > 0 ? inLineOffset / lineLen : 0;
    return line.bbox.x + ratio * renderedWidth;
  }

  let naturalWidth = 0;
  let spaceCount = 0;
  for (const seg of segs) {
    naturalWidth += seg.width;
    if (seg.kind === 'space') spaceCount++;
  }
  const renderedWidth = justifyFill
    ? Math.max(naturalWidth, blockRight - line.bbox.x)
    : naturalWidth;
  const extraPerSpace = justifyFill && spaceCount > 0
    ? Math.max(0, (renderedWidth - naturalWidth) / spaceCount)
    : 0;

  const lastIdx = segs.length - 1;
  let x = line.bbox.x;
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const isLastSeg = i === lastIdx;
    const segPlainLen = segmentPlainLength(seg, isLastSeg && addsHyphen(line), opensWithRepeatedHyphen(line, i));
    const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
    if (inLineOffset <= cum + segPlainLen) {
      return x + xWithinSegment(seg, inLineOffset - cum, segPlainLen, segRendered);
    }
    x += segRendered;
    cum += segPlainLen;
  }
  return x;
}

/**
 * Reverse hit-test: given page-space pixel coordinates, find the source offset
 * in the markdown document that corresponds to the clicked glyph. Returns null
 * when the click lands on page background (outside any block).
 */
export function pixelToSourceOffset(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
): number | null {
  // 0. Opener bands render the heading / part title through a design slot.
  //    Those text blocks carry the title's source map, so a click on them
  //    lands the cursor on the clicked glyph — and takes precedence over the
  //    heading's invisible lines hidden under the band.
  const bandTitles = bandTitleBlocks(doc, pageIndex);
  for (const b of bandTitles) {
    const boxes = bandLineBoxes(b);
    // Hit either the element box or any of its line boxes (a small author
    // line has a thin element box; the line box covers the full leading).
    const inside = (r: { x: number; y: number; width: number; height: number }) =>
      xPage >= r.x && xPage <= r.x + r.width && yPage >= r.y && yPage <= r.y + r.height;
    if (!inside(b.bbox) && !boxes.some(inside)) continue;
    if (boxes.length === 0) return b.sourceStart ?? null;
    let box = boxes[0]!;
    let best = Infinity;
    for (const candidate of boxes) {
      const dy = yPage < candidate.y ? candidate.y - yPage : yPage > candidate.y + candidate.height ? yPage - candidate.y - candidate.height : 0;
      if (dy < best) { best = dy; box = candidate; }
    }
    return bandPlainToSource(b, box.plainStart + bandCharAtX(box, xPage));
  }

  // 1. Find a block on this page whose bbox contains the click.
  let hitBlock: VDTDocument['blocks'][number] | undefined;
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex) continue;
    if (isHiddenUnderBand(b, bandTitles)) continue;
    // A heading drawn through an advanced design keeps invisible in-column
    // lines; its glyphs belong to the overlay's text blocks (handled above).
    if (b.designOverlay) continue;
    // A callout frame spans its whole box but carries no text of its own;
    // its children follow in `doc.blocks` and own the clickable glyphs.
    if (b.type === 'callout') continue;
    const bx = b.bbox.x;
    const by = b.bbox.y;
    if (xPage < bx || xPage > bx + b.bbox.width) continue;
    if (yPage < by || yPage > by + b.bbox.height) continue;
    hitBlock = b;
    break;
  }
  if (!hitBlock) return null;

  // 2. Find the line whose vertical band contains yPage; snap to nearest if
  //    click is in the gap between lines.
  let hitLine: VDTDocument['blocks'][number]['lines'][number] | undefined;
  let bestDy = Infinity;
  for (const line of hitBlock.lines) {
    const top = line.bbox.y;
    const bot = top + line.bbox.height;
    if (yPage >= top && yPage <= bot) {
      hitLine = line;
      break;
    }
    const dy = yPage < top ? top - yPage : yPage - bot;
    if (dy < bestDy) {
      bestDy = dy;
      hitLine = line;
    }
  }
  if (!hitLine || hitLine.plainStart === undefined || hitLine.plainEnd === undefined) {
    return hitBlock.sourceStart ?? null;
  }

  // 3. Walk segments to find the plain-char offset within the line. Mirror the
  //    justify-fill math from xForPlainInLine.
  const blockRight = hitBlock.bbox.x + hitBlock.bbox.width;
  const justifyFill = hitBlock.textAlign === 'justify' && hitLine.isLastLine === false && !hitLine.ragged;
  const segs = hitLine.segments && foldRefRuns(hitLine.segments);
  const lineLen = Math.max(0, hitLine.plainEnd - hitLine.plainStart);
  let inLineOffset: number;

  if (!segs || segs.length === 0) {
    const renderedWidth = justifyFill
      ? Math.max(hitLine.bbox.width, blockRight - hitLine.bbox.x)
      : hitLine.bbox.width;
    const rel = Math.max(0, Math.min(renderedWidth, xPage - hitLine.bbox.x));
    const ratio = renderedWidth > 0 ? rel / renderedWidth : 0;
    inLineOffset = Math.round(ratio * lineLen);
  } else {
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segs) {
      naturalWidth += seg.width;
      if (seg.kind === 'space') spaceCount++;
    }
    const renderedWidth = justifyFill
      ? Math.max(naturalWidth, blockRight - hitLine.bbox.x)
      : naturalWidth;
    const extraPerSpace = justifyFill && spaceCount > 0
      ? Math.max(0, (renderedWidth - naturalWidth) / spaceCount)
      : 0;

    const lastIdx = segs.length - 1;
    let x = hitLine.bbox.x;
    let cum = 0;
    // Clamp click to the line's rendered horizontal extent.
    const clampedX = Math.max(hitLine.bbox.x, Math.min(xPage, hitLine.bbox.x + renderedWidth));
    let resolved = false;
    let result = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const isLastSeg = i === lastIdx;
      const segPlainLen = segmentPlainLength(seg, isLastSeg && addsHyphen(hitLine), opensWithRepeatedHyphen(hitLine, i));
      const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
      if (clampedX <= x + segRendered) {
        result = cum + (seg.warichu
          ? Math.min(segPlainLen, warichuOffset(seg, clampedX - x, yPage - hitLine.baseline))
          : offsetWithinSegment(seg, clampedX - x, segPlainLen, segRendered));
        resolved = true;
        break;
      }
      x += segRendered;
      cum += segPlainLen;
    }
    inLineOffset = resolved ? result : cum;
  }

  const plainCharIndex = hitLine.plainStart + inLineOffset;

  // 4. Map plain-char back to source offset via the block's sourceMap.
  const prefixLen = hitBlock.plainPrefixLen ?? 0;
  const mapIdx = plainCharIndex - prefixLen;
  if (!hitBlock.sourceMap) return hitBlock.sourceStart ?? null;
  if (mapIdx < 0) return hitBlock.sourceStart ?? null;
  if (mapIdx >= hitBlock.sourceMap.length) return hitBlock.sourceEnd ?? null;
  return hitBlock.sourceMap[mapIdx] ?? null;
}
