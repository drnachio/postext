// From a point on the page to the source text: chapter files, placed
// segments, the glyph and line under the point.
import { type BoundingBox, type VDTPage, type VDTLineSegment, type VDTBlock, type VDTLine, lineTextAlign } from '../../vdt.js';
import type { SourceMapOptions, SourceElement } from '../sourceMap.js';

/** The file a source reference names: its name and, for text of another
 *  chapter, which one. */
export interface FileRef {
  file?: string;
  chapter?: number;
}

/** The `chapterFile` each file reference was made with. */
const chapterFiles = new WeakMap<FileRef, SourceMapOptions['chapterFile']>();

/** `file`, for the text of `block`: another chapter's file when the block
 *  was carried in from it (#943). */
export function ofBlock(file: FileRef, block: { sourceChapter?: number }): FileRef {
  if (block.sourceChapter === undefined) return file;
  const chapterFile = chapterFiles.get(file);
  const name = chapterFile?.(block.sourceChapter);
  const out: FileRef = { ...(name !== undefined ? { file: name } : {}), chapter: block.sourceChapter };
  chapterFiles.set(out, chapterFile);
  return out;
}

/** Whether Markdown of the chapter `c` (undefined: this document's) is
 *  what `options` asks about. */
export const inQueriedChapter = (options: SourceMapOptions | undefined, c: number | undefined): boolean =>
  options?.chapter === undefined ? c === undefined : (c ?? options.ownChapter) === options.chapter;

export type Point = { x: number; y: number };

export const inside = (r: BoundingBox | { x: number; y: number; width: number; height: number }, p: Point, slop = 0): boolean =>
  p.x >= r.x - slop && p.x <= r.x + r.width + slop && p.y >= r.y - slop && p.y <= r.y + r.height + slop;

export const fileOf = (options: SourceMapOptions | undefined, pageIndex: number): FileRef => {
  const f = typeof options?.file === 'function' ? options.file(pageIndex) : options?.file;
  const out: FileRef = f !== undefined ? { file: f } : {};
  if (options?.chapterFile) chapterFiles.set(out, options.chapterFile);
  return out;
};

/** The flag of an element whose box is in `page`'s flow frame (#929). */
export const flowOf = (page: Pick<VDTPage, 'flow'> | undefined): { flow?: true } => (page?.flow ? { flow: true } : {});
/** `chain` with the elements a frame sets flagged as in the flow frame;
 *  its groups and the template (no box of their own) left as they are. */
export const inFlowFrame = (page: Pick<VDTPage, 'flow'>, chain: SourceElement[]): SourceElement[] =>
  page.flow ? chain.map((e) => (e.level === 'group' || e.level === 'template' ? e : { ...e, flow: true as const })) : chain;

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

/** A segment of a line where the renderers paint it (as the Sandbox's
 *  `placeLineSegments` reads the canvas painter): `x` and its advance, and
 *  the plain characters it stands for (`plainStart` relative to the line). */
interface PlacedSegment {
  seg: VDTLineSegment;
  index: number;
  x: number;
  width: number;
  plainStart: number;
  plainLen: number;
}

/** The plain characters a segment stands for: none for what the layout
 *  added (a book title's brackets, a tab leader, the hyphen of a break),
 *  one for a reference, a swatch, a chip, a formula. */
function segmentPlainLength(seg: VDTLineSegment, dropTrailingHyphen: boolean, dropLeadingHyphen: boolean): number {
  if (seg.refContinues || seg.inserted || seg.leader !== undefined) return 0;
  if (seg.refResourceId !== undefined || seg.kind === 'swatch') return 1;
  let len = seg.text.length - (seg.kashida?.length ?? 0);
  if (dropLeadingHyphen && seg.text.startsWith('-')) len--;
  if (dropTrailingHyphen && seg.text.endsWith('-') && len > 0) len--;
  return Math.max(0, len);
}

function placeSegments(block: VDTBlock, line: VDTLine): PlacedSegment[] {
  const segs = line.segments ?? [];
  if (segs.length === 0) return [];
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const effectiveWidth = span ? span.width : block.bbox.x + block.bbox.width - lineX;
  let natural = 0;
  let words = 0;
  let spaces = 0;
  for (const s of segs) {
    natural += s.width;
    if (s.kind === 'space') spaces++;
    else words += s.width;
  }
  const justify = block.textAlign === 'justify' && spaces > 0 && !line.tabbed
    && ((line.isLastLine === false && !line.ragged) || natural > effectiveWidth);
  const spaceWidth = justify ? (effectiveWidth - words) / spaces : undefined;
  const align = lineTextAlign(line, block.textAlign);
  const slack = Math.max(0, effectiveWidth - natural);
  const start = lineX + (justify ? 0 : align === 'center' ? slack / 2 : align === 'right' ? slack : 0);
  const widths = segs.map((s) => (s.kind === 'space' && spaceWidth !== undefined ? spaceWidth : s.width));
  const order = line.order && line.order.length === segs.length ? line.order : segs.map((_, i) => i);
  const xs = new Array<number>(segs.length).fill(start);
  let x = start;
  for (const i of order) {
    xs[i] = x;
    x += widths[i]!;
  }
  const out: PlacedSegment[] = [];
  const dropTrailing = line.hyphenated === true && line.hardHyphen !== true;
  let cum = 0;
  segs.forEach((seg, i) => {
    const plainLen = segmentPlainLength(seg, i === segs.length - 1 && dropTrailing, i === 0 && line.repeatedHyphen === true);
    out.push({ seg, index: i, x: xs[i]!, width: widths[i]!, plainStart: cum, plainLen });
    cum += plainLen;
  });
  return out;
}

/** The source offset of plain character `plain` (block-relative, its
 *  number prefix counted) of `block`. */
function sourceOfPlain(block: VDTBlock, plain: number): number | undefined {
  const map = block.sourceMap;
  if (!map || map.length === 0) return undefined;
  const k = plain - (block.plainPrefixLen ?? 0);
  if (k < 0) return map[0];
  return map[Math.min(k, map.length - 1)];
}

/** The source range of the glyph of `block`'s line under `x` (flow
 *  frame), with the plain offset it stands at; undefined off the text. */
export function glyphAt(block: VDTBlock, line: VDTLine, x: number): { start: number; end: number; plain: number } | undefined {
  if (line.plainStart === undefined || line.plainEnd === undefined) return undefined;
  const placed = placeSegments(block, line).filter((p) => p.plainLen > 0);
  if (placed.length === 0) return undefined;
  let hit = placed[0]!;
  let best = Infinity;
  for (const p of placed) {
    const d = x < p.x ? p.x - x : x > p.x + p.width ? x - p.x - p.width : 0;
    if (d < best) { best = d; hit = p; }
    if (d === 0) break;
  }
  const seg = hit.seg;
  const along = Math.max(0, Math.min(hit.width, x - hit.x));
  const rtl = seg.rtl === true;
  const plainOf = (k: number) => line.plainStart! + hit.plainStart + k;
  // A chip: the character of its words under `x`, through its own map.
  if (seg.chip) {
    const chipAt = sourceOfPlain(block, plainOf(0));
    if (chipAt === undefined) return undefined;
    const chip = seg.chip;
    const offsets = chip.sourceOffsets;
    const nextAt = sourceOfPlain(block, plainOf(1));
    const whole = { start: chipAt, end: nextAt !== undefined && nextAt > chipAt ? nextAt : chipAt + 1, plain: plainOf(0) };
    if (!offsets) return whole;
    let rx = hit.x + chip.marginLeft + chip.paddingX + chip.borderWidth;
    let k = 0;
    const order = chip.order ?? chip.runs.map((_, i) => i);
    const logicalStart: number[] = [];
    let acc = 0;
    for (const r of chip.runs) { logicalStart.push(acc); acc += r.text.length; }
    for (const ri of order) {
      const run = chip.runs[ri]!;
      if (x <= rx + run.width || ri === order[order.length - 1]) {
        const n = run.text.length;
        const frac = run.width > 0 ? Math.max(0, Math.min(0.9999, (x - rx) / run.width)) : 0;
        const at = Math.floor((run.rtl ? 1 - frac : frac) * n);
        k = logicalStart[ri]! + Math.max(0, Math.min(n - 1, at));
        break;
      }
      rx += run.width;
    }
    const off = offsets[k];
    return off === undefined ? whole : { start: chipAt + off, end: chipAt + off + 1, plain: plainOf(0) };
  }
  // A placeholder (reference, swatch, formula): the whole construct, up to
  // the next character's source.
  if (hit.plainLen === 1 && (seg.refResourceId !== undefined || seg.kind === 'swatch' || seg.kind === 'math' || seg.kind === 'score' || seg.text.length !== 1)) {
    const at = sourceOfPlain(block, plainOf(0));
    if (at === undefined) return undefined;
    const next = sourceOfPlain(block, plainOf(1));
    return { start: at, end: next !== undefined && next > at ? next : at + 1, plain: plainOf(0) };
  }
  const frac = hit.width > 0 ? Math.max(0, Math.min(0.9999, along / hit.width)) : 0;
  const k = Math.min(hit.plainLen - 1, Math.floor((rtl ? 1 - frac : frac) * hit.plainLen));
  const at = sourceOfPlain(block, plainOf(k));
  if (at === undefined) return undefined;
  return { start: at, end: at + 1, plain: plainOf(k) };
}

/** The line of `block` under `y` (the nearest one in a gap). */
export function lineAt(block: VDTBlock, y: number): { line: VDTLine; index: number } | undefined {
  let best: { line: VDTLine; index: number } | undefined;
  let bestDy = Infinity;
  block.lines.forEach((line, index) => {
    const top = line.bbox.y;
    const bot = top + line.bbox.height;
    const dy = y < top ? top - y : y > bot ? y - bot : 0;
    if (dy < bestDy) { bestDy = dy; best = { line, index }; }
  });
  return best;
}

/** The source range a line covers. */
export function lineRange(block: VDTBlock, line: VDTLine): { start: number; end: number } | undefined {
  if (line.plainStart !== undefined && line.plainEnd !== undefined && line.plainEnd > line.plainStart) {
    const a = sourceOfPlain(block, line.plainStart);
    const b = sourceOfPlain(block, line.plainEnd - 1);
    if (a !== undefined && b !== undefined) return { start: Math.min(a, b), end: Math.max(a, b) + 1 };
  }
  if (line.sourceStart !== undefined && line.sourceEnd !== undefined) return { start: line.sourceStart, end: line.sourceEnd };
  return undefined;
}
