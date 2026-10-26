import type { VDTDocument } from 'postext';
import { bandTitleBlocks, bandTitleOwner, bandLineBoxes, bandPlainToSource, bandCharAtX, isHiddenUnderBand } from './bandTitle.js';
import { intoBlockSpace, blockFrameMatrix, blockPointShown } from '../../composed/frameHit.js';
import { documentShapingLanguage } from '../../../controls/language/measureLanguage.js';
import { placeLineSegments, xInPlaced, isMirroredPage } from './geometry/placement.js';
import { warichuOffset, offsetWithinSegment } from './geometry/segmentText.js';

export { segmentPlainLength, opensWithRepeatedHyphen, addsHyphen, foldRefRuns, segmentGraphemeStarts, warichuOffset } from './geometry/segmentText.js';
export { findResourceLocation, placeLineSegments, isMirroredPage, resourceBlocksOnPage } from './geometry/placement.js';
export type { ResourceLocation, PlacedSegment } from './geometry/placement.js';
export { designImageFileIdAtPixel, refResourceIdAtPixel, linkTargetAtPixel, findLinkLocation, pageTargetAtPixel } from './geometry/hitTest.js';
export type { LinkTarget } from './geometry/hitTest.js';

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
 * coordinate (in the page's flow frame, px) where the renderers paint that
 * character boundary (see {@link placeLineSegments}): per-segment widths,
 * justified slack over the spaces, the line's alignment and its bidi
 * order. `mirrored`: the line is on a right-to-left page.
 */
export function xForPlainInLine(
  block: VDTDocument['blocks'][number],
  line: VDTDocument['blocks'][number]['lines'][number],
  inLineOffset: number,
  mirrored = false,
): number {
  const placed = placeLineSegments(block, line, mirrored);
  if (!placed) {
    const blockRight = block.bbox.x + block.bbox.width;
    const lineLen = Math.max(0, (line.plainEnd ?? 0) - (line.plainStart ?? 0));
    const justifyFill = block.textAlign === 'justify' && line.isLastLine === false && !line.ragged && !line.tabbed;
    const renderedWidth = justifyFill
      ? Math.max(line.bbox.width, blockRight - line.bbox.x)
      : line.bbox.width;
    const ratio = lineLen > 0 ? inLineOffset / lineLen : 0;
    // A plain line is one left-to-right text: on a mirrored page it runs
    // from the right of its box in the flow frame.
    return mirrored ? line.bbox.x + (1 - ratio) * renderedWidth : line.bbox.x + ratio * renderedWidth;
  }
  // The caret stands before the character at the offset, where that
  // character is painted; past the line's last one, after it. In a bidi
  // line the end of one segment and the start of the next can be far apart.
  for (const p of placed) {
    if (inLineOffset >= p.plainStart && inLineOffset < p.plainStart + p.plainLen) return xInPlaced(p, inLineOffset - p.plainStart);
  }
  let end = placed[placed.length - 1]!;
  for (const p of placed) if (p.plainLen > 0 && p.plainStart + p.plainLen <= inLineOffset) end = p;
  return xInPlaced(end, end.plainLen);
}

/**
 * The x extents (flow frame, left to right) that a plain range
 * `[from, to)` of a line covers: one per run of segments painted side by
 * side, so a selection across a bidi line shows as the pieces the
 * characters are painted in rather than one bar from the range's first x
 * to its last.
 */
export function plainRangeInLine(
  block: VDTDocument['blocks'][number],
  line: VDTDocument['blocks'][number]['lines'][number],
  from: number,
  to: number,
  mirrored = false,
): { x1: number; x2: number }[] {
  const placed = placeLineSegments(block, line, mirrored);
  if (!placed) {
    const a = xForPlainInLine(block, line, from, mirrored);
    const b = xForPlainInLine(block, line, to, mirrored);
    return [{ x1: Math.min(a, b), x2: Math.max(a, b) }];
  }
  const pieces: { x1: number; x2: number }[] = [];
  for (const p of placed) {
    const lo = Math.max(from, p.plainStart);
    const hi = Math.min(to, p.plainStart + p.plainLen);
    if (hi <= lo) continue;
    const a = xInPlaced(p, lo - p.plainStart);
    const b = xInPlaced(p, hi - p.plainStart);
    pieces.push({ x1: Math.min(a, b), x2: Math.max(a, b) });
  }
  pieces.sort((u, v) => u.x1 - v.x1);
  const merged: { x1: number; x2: number }[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last && piece.x1 <= last.x2 + 0.5) last.x2 = Math.max(last.x2, piece.x2);
    else merged.push({ ...piece });
  }
  return merged;
}

/**
 * Reverse hit-test: given page-space pixel coordinates, find the source offset
 * in the markdown document that corresponds to the clicked glyph. Returns null
 * when the click lands on page background (outside any block).
 */
export function pixelToSourceOffset(
  doc: VDTDocument,
  pageIndex: number,
  xFlow: number,
  yFlow: number,
): number | null {
  // A composed frame's blocks (and the design overlays they carry) keep
  // the frame's own coordinates, put on the page by its matrix (text
  // scale, turn): the point is read in the frame of each block (#910).
  const page = doc.pages[pageIndex];
  const local = (blockId: string | undefined) =>
    blockId === undefined ? { x: xFlow, y: yFlow } : intoBlockSpace(blockFrameMatrix(page, blockId), xFlow, yFlow);

  // 0. Opener bands render the heading / part title through a design slot.
  //    Those text blocks carry the title's source map, so a click on them
  //    lands the cursor on the clicked glyph — and takes precedence over the
  //    heading's invisible lines hidden under the band.
  const bandTitles = bandTitleBlocks(doc, pageIndex);
  for (const b of bandTitles) {
    const { x, y } = local(bandTitleOwner(b));
    // Their characters are measured in the language the page paints them
    // in (#770).
    const boxes = bandLineBoxes(b, documentShapingLanguage(doc));
    // Hit either the element box or any of its line boxes (a small author
    // line has a thin element box; the line box covers the full leading).
    const inside = (r: { x: number; y: number; width: number; height: number }) =>
      x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    if (!inside(b.bbox) && !boxes.some(inside)) continue;
    if (boxes.length === 0) return b.sourceStart ?? null;
    let box = boxes[0]!;
    let best = Infinity;
    for (const candidate of boxes) {
      const dy = y < candidate.y ? candidate.y - y : y > candidate.y + candidate.height ? y - candidate.y - candidate.height : 0;
      if (dy < best) { best = dy; box = candidate; }
    }
    return bandPlainToSource(b, box.plainStart + bandCharAtX(box, x));
  }

  // 1. Find a block on this page whose bbox contains the click.
  let hitBlock: VDTDocument['blocks'][number] | undefined;
  let xPage = xFlow;
  let yPage = yFlow;
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex) continue;
    if (isHiddenUnderBand(b, bandTitles)) continue;
    // A heading drawn through an advanced design keeps invisible in-column
    // lines; its glyphs belong to the overlay's text blocks (handled above).
    if (b.designOverlay) continue;
    // A callout frame spans its whole box but carries no text of its own;
    // its children follow in `doc.blocks` and own the clickable glyphs.
    if (b.type === 'callout') continue;
    const p = local(b.id);
    // Text a frame clips at its foot is not painted, so not clicked.
    if (!blockPointShown(page, b.id, p)) continue;
    const bx = b.bbox.x;
    const by = b.bbox.y;
    if (p.x < bx || p.x > bx + b.bbox.width) continue;
    if (p.y < by || p.y > by + b.bbox.height) continue;
    hitBlock = b;
    // The rest of the hit test reads the block's lines in its frame.
    xPage = p.x;
    yPage = p.y;
    break;
  }
  if (!hitBlock) return null;

  // A drop cap (#623): a click on the initial lands before it, or after
  // it on its right half (the start of the rest of the word).
  const cap = hitBlock.dropCap;
  if (cap && cap.sourceStart !== undefined && xPage >= cap.x && xPage <= cap.x + cap.width
    && yPage >= cap.baselineY - cap.fontSizePx && yPage <= cap.baselineY) {
    const after = xPage > cap.x + cap.width / 2;
    if (!after) return cap.sourceStart;
    return hitBlock.sourceMap?.[cap.plainEnd - (hitBlock.plainPrefixLen ?? 0)] ?? cap.sourceEnd ?? null;
  }

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

  // 3. Find the segment painted under the click (see placeLineSegments,
  //    which xForPlainInLine reads too) and the plain-char offset in it.
  const mirrored = isMirroredPage(doc, pageIndex);
  const placed = placeLineSegments(hitBlock, hitLine, mirrored);
  const lineLen = Math.max(0, hitLine.plainEnd - hitLine.plainStart);
  let inLineOffset: number;

  if (!placed) {
    const blockRight = hitBlock.bbox.x + hitBlock.bbox.width;
    const justifyFill = hitBlock.textAlign === 'justify' && hitLine.isLastLine === false && !hitLine.ragged;
    const renderedWidth = justifyFill
      ? Math.max(hitLine.bbox.width, blockRight - hitLine.bbox.x)
      : hitLine.bbox.width;
    const rel = Math.max(0, Math.min(renderedWidth, xPage - hitLine.bbox.x));
    const ratio = renderedWidth > 0 ? rel / renderedWidth : 0;
    inLineOffset = Math.round((mirrored ? 1 - ratio : ratio) * lineLen);
  } else {
    // Clamp the click to the line's painted extent, then take the segment
    // it falls in, by x: in a bidi line that is not the logical order.
    let left = Infinity;
    let right = -Infinity;
    for (const p of placed) {
      left = Math.min(left, p.x);
      right = Math.max(right, p.x + p.width);
    }
    const clampedX = Math.max(left, Math.min(xPage, right));
    let hit = placed[0]!;
    let best = Infinity;
    for (const p of placed) {
      const d = clampedX < p.x ? p.x - clampedX : clampedX > p.x + p.width ? clampedX - p.x - p.width : 0;
      if (d < best) { best = d; hit = p; }
      if (d === 0) break;
    }
    const dx = Math.max(0, Math.min(hit.width, clampedX - hit.x));
    const along = hit.reversed ? hit.width - dx : dx;
    inLineOffset = hit.plainStart + (hit.seg.warichu
      ? Math.min(hit.plainLen, warichuOffset(hit.seg, along, yPage - hitLine.baseline))
      : offsetWithinSegment(hit.seg, along, hit.plainLen, hit.width));
    inLineOffset = Math.min(inLineOffset, lineLen);
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
