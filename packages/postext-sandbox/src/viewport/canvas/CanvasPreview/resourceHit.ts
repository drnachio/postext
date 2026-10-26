import type { VDTDocument } from 'postext';
import { mapInlineSnippet, parseMarkdown, resourceBlockRectToPage, resourceBlockToLocal, uncroppedPictureBox } from 'postext';
import type { ResourceFocusTarget } from '../../../context/SandboxContext.js';
import { hitSvgTextIndex, type SvgTextIndex } from '../../../controls/media/svgSource.js';
import { addsHyphen, foldRefRuns, resourceBlocksOnPage, segmentPlainLength } from './geometry.js';
import { blockFrameMatrix, intoBlockSpace } from '../../composed/frameHit.js';

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
    const segs = foldRefRuns(line.segments ?? []);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      let len: number;
      if (seg.captionLabel) {
        len = 0;
      } else if (seg.kind === 'space') {
        len = seg.text.length;
      } else {
        len = segmentPlainLength(seg, i === segs.length - 1 && addsHyphen(line));
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
  const segs = line.segments && foldRefRuns(line.segments);
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
  const segs = line.segments && foldRefRuns(line.segments);
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
  /** Where the run's words start in the Markdown (book offset), when the
   *  `:::figure` that shows the resource gives them in place of the
   *  resource's (a `::caption[…]` line, #935): the words are selected
   *  there, not in the Resources panel. `offset` then counts from it. */
  source?: number;
}

/** The words the `:::figure` fences of a Markdown give (#935), by resource
 *  id, in source order: read once per text. */
type FigureWords = Map<string, { kind: 'caption' | 'note'; text: string; start: number }[]>;
let figureWordsCache: { markdown: string; byResource: FigureWords } | null = null;

function figureWordsOf(markdown: string): FigureWords {
  if (figureWordsCache?.markdown === markdown) return figureWordsCache.byResource;
  const byResource: FigureWords = new Map();
  // Cheap test first: no fence gives words, nothing to parse.
  if (/::(?:caption|note)\[|\b(?:caption|note)="/.test(markdown)) {
    for (const b of parseMarkdown(markdown)) {
      const words = b.figure?.words;
      if (!words || !b.resourceId) continue;
      for (const kind of ['caption', 'note'] as const) {
        const w = words[kind];
        if (!w) continue;
        const list = byResource.get(b.resourceId) ?? [];
        list.push({ kind, text: w.text, start: w.sourceStart });
        byResource.set(b.resourceId, list);
      }
    }
  }
  figureWordsCache = { markdown, byResource };
  return byResource;
}

/**
 * Where the `kind` words of the figure `block` start in `markdown`, when a
 * `:::figure` fence gives them (`::caption[…]`, `caption="…"`, #935) and
 * they are what the page shows; null when the words are the resource's
 * own. Offsets into the run map one to one while the source reads as the
 * words do (no escape in them).
 */
export function figureWordsSource(markdown: string, block: VDTBlock, kind: 'caption' | 'note'): number | null {
  const resource = block.resourceBlock?.resource;
  const shown = resource?.[kind];
  if (!resource || !shown) return null;
  for (const w of figureWordsOf(markdown).get(resource.id) ?? []) {
    if (w.kind === kind && w.text === shown && markdown.slice(w.start, w.start + shown.length) === shown) return w.start;
  }
  return null;
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
  /** The page's Markdown: a caption or a note a `:::figure` gives in its
   *  own words maps there (`ResourceTextHit.source`). */
  markdown?: string,
): ResourceTextHit | null {
  const page = doc.pages[pageIndex];
  for (const block of resourceBlocksOnPage(doc, pageIndex)) {
    // A block of a composed frame is read in the frame's coordinates (#910).
    const at = intoBlockSpace(blockFrameMatrix(page, block.id), xPage, yPage);
    if (!inside(block.bbox, at.x, at.y)) continue;
    const rb = block.resourceBlock!;
    const resourceId = rb.resource.id;
    // A rotated block keeps its geometry in its upright frame: test the
    // point there.
    const { x: xLocal, y: yLocal } = resourceBlockToLocal(rb, at.x, at.y);

    for (const kind of ['caption', 'note'] as const) {
      const lines = kind === 'caption' ? rb.captionLines : rb.noteLines;
      const hitIdx = lines.findIndex((l) => yLocal >= l.bbox.y && yLocal <= l.bbox.y + l.bbox.height);
      if (hitIdx < 0) continue;
      const run = resolveResourceRun(rb, { kind });
      if (!run) continue;
      const source = markdown === undefined ? null : figureWordsSource(markdown, block, kind);
      return { resourceId, target: { kind }, offset: offsetInRun(run, hitIdx, xLocal), ...(source !== null ? { source } : {}) };
    }

    if (rb.table) {
      for (const cell of rb.table.cells) {
        if (!inside(cell.rect, xLocal, yLocal)) continue;
        const target: ResourceFocusTarget = { kind: 'cell', row: cell.row, col: cell.col };
        if (cell.lines.length === 0) return { resourceId, target, offset: 0 };
        const run = resolveResourceRun(rb, target);
        if (!run) return { resourceId, target, offset: 0 };
        const idx = nearestLineIndex(run.lines, yLocal);
        return { resourceId, target, offset: idx < 0 ? 0 : offsetInRun(run, idx, xLocal) };
      }
    }

    if (rb.kind === 'svg' && rb.fileId && svgIndexFor) {
      const body = {
        x: (rb.rotation ? 0 : block.bbox.x) + rb.bodyRect.x,
        y: (rb.rotation ? 0 : block.bbox.y) + rb.bodyRect.y,
        width: rb.bodyRect.width,
        height: rb.bodyRect.height,
      };
      if (body.width > 0 && body.height > 0 && inside(body, xLocal, yLocal)) {
        const index = svgIndexFor(rb.fileId);
        if (index) {
          // A picture cropped within its safe area maps through the box the
          // whole picture covers.
          const full = rb.bodySource ? uncroppedPictureBox(body.x, body.y, body.width, body.height, rb.bodySource) : body;
          const offset = hitSvgTextIndex(index, (xLocal - full.x) / full.width, (yLocal - full.y) / full.height);
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
    // A rotated figure's body, as the box it takes on the page (its
    // content turned inside it).
    const body = rb.rotation
      ? resourceBlockRectToPage(rb, rb.bodyRect)
      : { x: block.bbox.x + rb.bodyRect.x, y: block.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height };
    // Cropped within its safe area: the box the whole picture covers.
    const full = rb.bodySource && !rb.rotation ? uncroppedPictureBox(body.x, body.y, body.width, body.height, rb.bodySource) : body;
    return { ...full, fileId: rb.fileId };
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
