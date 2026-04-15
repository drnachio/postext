import type { VDTDocument } from 'postext';

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
  const justifyFill = block.textAlign === 'justify' && line.isLastLine === false;
  const segs = line.segments;

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
    const segPlainLen = (isLastSeg && line.hyphenated && seg.text.endsWith('-'))
      ? Math.max(0, seg.text.length - 1)
      : seg.text.length;
    const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
    if (inLineOffset <= cum + segPlainLen) {
      const within = inLineOffset - cum;
      const ratio = segPlainLen > 0 ? within / segPlainLen : 0;
      return x + ratio * segRendered;
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
  // 1. Find a block on this page whose bbox contains the click.
  let hitBlock: VDTDocument['blocks'][number] | undefined;
  for (const b of doc.blocks) {
    if (b.pageIndex !== pageIndex) continue;
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
  const justifyFill = hitBlock.textAlign === 'justify' && hitLine.isLastLine === false;
  const segs = hitLine.segments;
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
      const segPlainLen = (isLastSeg && hitLine.hyphenated && seg.text.endsWith('-'))
        ? Math.max(0, seg.text.length - 1)
        : seg.text.length;
      const segRendered = seg.width + (seg.kind === 'space' ? extraPerSpace : 0);
      if (clampedX <= x + segRendered) {
        const within = clampedX - x;
        const ratio = segRendered > 0 ? within / segRendered : 0;
        result = cum + Math.round(ratio * segPlainLen);
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
