import type { VDTDocument } from 'postext';
import { mapInlineSnippet } from 'postext';
import type { ResourceFocusTarget } from '../../context/SandboxContext';
import { hitSvgTextIndex, type SvgTextIndex } from '../../controls/svgSource';
import { resourceBlocksOnPage, segmentPlainLength } from './geometry';

// ---------------------------------------------------------------------------
// Resource text hit-testing (pure). Resource runs — table cells, captions,
// notes — are measured from the raw snippet spans and painted at natural
// widths from `line.bbox.x` (no justify fill), and their lines carry no
// plain/source ranges. This module reconstructs those ranges by consuming the
// snippet's plain text segment by segment, then maps a page pixel to an
// offset in the snippet string (what the panel's textarea edits) and back.
// ---------------------------------------------------------------------------

type VDTBlock = VDTDocument['blocks'][number];
type VDTLine = VDTBlock['lines'][number];
type ResolvedResourceBlock = NonNullable<VDTBlock['resourceBlock']>;

/** The measured lines of one editable run plus the snippet they came from. */
export interface ResourceRun {
  lines: VDTLine[];
  /** The snippet string the panel edits (cell content, caption or note). */
  content: string;
}

/** Pick the run a focus target refers to, or null when the resource has no
 *  such run (no table, unknown cell, …). */
export function resourceRunFor(rb: ResolvedResourceBlock, target: ResourceFocusTarget): ResourceRun | null {
  switch (target.kind) {
    case 'caption':
      return { lines: rb.captionLines, content: rb.resource.caption ?? '' };
    case 'note':
      return { lines: rb.noteLines, content: rb.resource.note ?? '' };
    case 'cell': {
      const cell = rb.table?.cells.find((c) => c.row === target.row && c.col === target.col);
      const model = rb.resource.table?.model;
      if (!cell || !model) return null;
      return { lines: cell.lines, content: model.rows[target.row]?.[target.col]?.content ?? '' };
    }
    case 'svgText':
      return null;
  }
}

/** Reconstructed plain-text range of one measured line. */
export interface StampedLine {
  plainStart: number;
  plainEnd: number;
  /** Plain chars each segment covers (0 for caption-label segments, 1 for a
   *  `:ref` label, otherwise the segment's text length). */
  segPlainLens: number[];
}

const SOFT_HYPHEN = '­';
const isWhitespace = (ch: string): boolean => /\s/.test(ch);

/**
 * Walk the run's plain text (`mapInlineSnippet(content).text`) alongside its
 * measured lines. The measurer drops whitespace at line starts and ends and
 * keeps interior whitespace tokens verbatim, so every line is: skip
 * whitespace, then consume each segment's plain length. Caption-label
 * segments (`Figure 1.7.`) are not part of the snippet and consume nothing.
 */
export function stampRunPlainRanges(lines: readonly VDTLine[], plainText: string): StampedLine[] {
  const out: StampedLine[] = [];
  let p = 0;
  const consume = (n: number) => {
    for (let k = 0; k < n && p < plainText.length; k++) {
      while (p < plainText.length && plainText[p] === SOFT_HYPHEN) p++;
      p++;
    }
  };
  for (const line of lines) {
    while (p < plainText.length && isWhitespace(plainText[p]!)) p++;
    const plainStart = p;
    const segPlainLens: number[] = [];
    const segs = line.segments ?? [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      let len: number;
      if (seg.captionLabel) {
        len = 0;
      } else if (seg.kind === 'space') {
        len = seg.text.length;
      } else {
        len = segmentPlainLength(seg, i === segs.length - 1 && line.hyphenated === true);
      }
      segPlainLens.push(len);
      consume(len);
    }
    out.push({ plainStart, plainEnd: p, segPlainLens });
  }
  return out;
}

/** Plain index (absolute in the run) for an x on a resource line. Resource
 *  lines paint sequentially from `line.bbox.x` at natural widths. */
export function plainIndexInResourceLine(line: VDTLine, stamped: StampedLine, xPage: number): number {
  const segs = line.segments;
  const lineLen = stamped.plainEnd - stamped.plainStart;
  if (!segs || segs.length === 0) {
    const w = line.bbox.width;
    const rel = Math.max(0, Math.min(w, xPage - line.bbox.x));
    const ratio = w > 0 ? rel / w : 0;
    return stamped.plainStart + Math.round(ratio * lineLen);
  }
  let natural = 0;
  for (const seg of segs) natural += seg.width;
  const clampedX = Math.max(line.bbox.x, Math.min(xPage, line.bbox.x + natural));
  let x = line.bbox.x;
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const len = stamped.segPlainLens[i] ?? 0;
    if (clampedX <= x + seg.width) {
      const ratio = seg.width > 0 ? (clampedX - x) / seg.width : 0;
      return stamped.plainStart + cum + Math.round(ratio * len);
    }
    x += seg.width;
    cum += len;
  }
  return stamped.plainStart + cum;
}

/** Page x for a plain index (absolute in the run) on a resource line. */
export function xForPlainInResourceLine(line: VDTLine, stamped: StampedLine, plainIndex: number): number {
  const inLine = Math.max(0, plainIndex - stamped.plainStart);
  const segs = line.segments;
  const lineLen = stamped.plainEnd - stamped.plainStart;
  if (!segs || segs.length === 0) {
    const ratio = lineLen > 0 ? Math.min(1, inLine / lineLen) : 0;
    return line.bbox.x + ratio * line.bbox.width;
  }
  let x = line.bbox.x;
  let cum = 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const len = stamped.segPlainLens[i] ?? 0;
    if (len > 0 && inLine <= cum + len) {
      return x + ((inLine - cum) / len) * seg.width;
    }
    x += seg.width;
    cum += len;
  }
  return x;
}

/** Snippet offset for a plain index (end of text → end of snippet). */
export function plainToContentOffset(sourceMap: readonly number[], contentLength: number, plain: number): number {
  if (plain <= 0) return sourceMap.length > 0 ? sourceMap[0]! : 0;
  if (plain >= sourceMap.length) return contentLength;
  return sourceMap[plain]!;
}

/** Plain index for a snippet offset: the first plain char at or after it. */
export function contentOffsetToPlain(sourceMap: readonly number[], offset: number): number {
  let lo = 0;
  let hi = sourceMap.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sourceMap[mid]! < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A run with its reconstructed plain ranges and snippet map, ready for both
 *  directions of the mapping. */
export interface ResolvedResourceRun extends ResourceRun {
  stamped: StampedLine[];
  plainText: string;
  sourceMap: number[];
}

export function resolveResourceRun(rb: ResolvedResourceBlock, target: ResourceFocusTarget): ResolvedResourceRun | null {
  const run = resourceRunFor(rb, target);
  if (!run) return null;
  const { text, sourceMap } = mapInlineSnippet(run.content);
  return { ...run, stamped: stampRunPlainRanges(run.lines, text), plainText: text, sourceMap };
}

/** Result of a resource text hit: which run, and the offset in its snippet
 *  (or in the SVG source for `svgText`). */
export interface ResourceTextHit {
  resourceId: string;
  target: ResourceFocusTarget;
  offset: number;
}

/** Index of the line whose vertical band contains `y`, else the nearest. */
function nearestLineIndex(lines: readonly VDTLine[], yPage: number): number {
  let best = -1;
  let bestDy = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const { y, height } = lines[i]!.bbox;
    if (yPage >= y && yPage <= y + height) return i;
    const dy = yPage < y ? y - yPage : yPage - (y + height);
    if (dy < bestDy) {
      bestDy = dy;
      best = i;
    }
  }
  return best;
}

function offsetInRun(run: ResolvedResourceRun, lineIdx: number, xPage: number): number {
  const line = run.lines[lineIdx]!;
  const stamped = run.stamped[lineIdx]!;
  const plain = plainIndexInResourceLine(line, stamped, xPage);
  return plainToContentOffset(run.sourceMap, run.content.length, plain);
}

const inside = (r: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/**
 * Hit-test the editable text of a resource embed at page-space coordinates:
 * caption first, then note, then table cells (by cell rect; an empty cell
 * yields offset 0), then — for SVG figures — the text nodes of the SVG via
 * the host-provided index. Returns null when nothing editable is under the
 * point.
 */
export function resourceTextAtPixel(
  doc: VDTDocument,
  pageIndex: number,
  xPage: number,
  yPage: number,
  svgIndexFor?: (fileId: string) => SvgTextIndex | undefined,
): ResourceTextHit | null {
  for (const block of resourceBlocksOnPage(doc, pageIndex)) {
    if (!inside(block.bbox, xPage, yPage)) continue;
    const rb = block.resourceBlock!;
    const resourceId = rb.resource.id;

    for (const kind of ['caption', 'note'] as const) {
      const lines = kind === 'caption' ? rb.captionLines : rb.noteLines;
      const hitIdx = lines.findIndex((l) => yPage >= l.bbox.y && yPage <= l.bbox.y + l.bbox.height);
      if (hitIdx < 0) continue;
      const run = resolveResourceRun(rb, { kind });
      if (!run) continue;
      return { resourceId, target: { kind }, offset: offsetInRun(run, hitIdx, xPage) };
    }

    if (rb.table) {
      for (const cell of rb.table.cells) {
        if (!inside(cell.rect, xPage, yPage)) continue;
        const target: ResourceFocusTarget = { kind: 'cell', row: cell.row, col: cell.col };
        if (cell.lines.length === 0) return { resourceId, target, offset: 0 };
        const run = resolveResourceRun(rb, target);
        if (!run) return { resourceId, target, offset: 0 };
        const idx = nearestLineIndex(run.lines, yPage);
        return { resourceId, target, offset: idx < 0 ? 0 : offsetInRun(run, idx, xPage) };
      }
    }

    if (rb.kind === 'svg' && rb.fileId && svgIndexFor) {
      const body = {
        x: block.bbox.x + rb.bodyRect.x,
        y: block.bbox.y + rb.bodyRect.y,
        width: rb.bodyRect.width,
        height: rb.bodyRect.height,
      };
      if (body.width > 0 && body.height > 0 && inside(body, xPage, yPage)) {
        const index = svgIndexFor(rb.fileId);
        if (index) {
          const offset = hitSvgTextIndex(index, (xPage - body.x) / body.width, (yPage - body.y) / body.height);
          if (offset !== null) return { resourceId, target: { kind: 'svgText' }, offset };
        }
      }
    }
    return null;
  }
  return null;
}

/** The rendered box of an SVG resource's figure body on a page (absolute
 *  page px), for scaling normalised SVG boxes into page space. */
export function svgBodyRectFor(
  doc: VDTDocument,
  pageIndex: number,
  resourceId: string,
): { x: number; y: number; width: number; height: number; fileId: string } | null {
  for (const block of resourceBlocksOnPage(doc, pageIndex)) {
    const rb = block.resourceBlock!;
    if (rb.resource.id !== resourceId || rb.kind !== 'svg' || !rb.fileId) continue;
    return {
      x: block.bbox.x + rb.bodyRect.x,
      y: block.bbox.y + rb.bodyRect.y,
      width: rb.bodyRect.width,
      height: rb.bodyRect.height,
      fileId: rb.fileId,
    };
  }
  return null;
}

/** The first resource block on the page carrying `resourceId`. */
export function resourceBlockOnPage(doc: VDTDocument, pageIndex: number, resourceId: string): VDTBlock | null {
  for (const block of resourceBlocksOnPage(doc, pageIndex)) {
    if (block.resourceBlock!.resource.id === resourceId) return block;
  }
  return null;
}
