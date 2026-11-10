// The characters the text's face has no glyph for, marked on the page:
// a band behind each one the build reported on this page
// (`glyphFallbackAt`), screen only. Red where no family of the font list
// has it (the PDF prints an empty box), violet where the `symbolFont`
// draws it. Each warning marks its own block only (#1460): its lines, or
// the caption, note and cells of the resource it holds, the places
// `glyphFallbackPlaces` reads. A character set elsewhere on the page in a
// face that has it is not marked.

import { resourceBlockRectToPage, type VDTBlock, type VDTDocument, type VDTLine } from 'postext';
import { placeLineSegments, xInPlaced, type PlacedSegment } from './geometry/placement.js';

/** A character no family has: the PDF prints an empty box. */
export const MISSING_GLYPH_FILL = 'rgba(220, 38, 38, 0.32)';
/** A character the symbol font draws. */
export const SUPPLIED_GLYPH_FILL = 'rgba(124, 58, 237, 0.24)';

export interface GlyphMark {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  block: VDTBlock;
}

/** The segments of a resource's line (a caption's, a note's, a cell's),
 *  painted one after another from the line's start, as the canvas paints
 *  them (`renderResourceBlock/text.ts`). */
function placeResourceLine(line: VDTLine): PlacedSegment[] {
  const out: PlacedSegment[] = [];
  let x = line.bbox.x;
  let at = 0;
  for (const seg of line.segments ?? []) {
    const plainLen = seg.kind === 'text' ? seg.text.length : 0;
    out.push({ seg, x, width: seg.width, plainStart: at, plainLen, reversed: seg.rtl === true });
    x += seg.width;
    at += plainLen;
  }
  return out;
}

/** The bands behind the characters of `chars` in `placed`, one line. */
function bandsIn(placed: readonly PlacedSegment[], line: VDTLine, chars: ReadonlySet<string>): Array<{ x: number; y: number; width: number; height: number }> {
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const p of placed) {
    if (p.seg.kind !== 'text') continue;
    const text = p.seg.text;
    for (let i = 0; i < text.length && i < p.plainLen;) {
      const ch = String.fromCodePoint(text.codePointAt(i)!);
      if (chars.has(ch)) {
        const a = xInPlaced(p, i);
        const b = xInPlaced(p, Math.min(p.plainLen, i + ch.length));
        out.push({ x: Math.min(a, b), y: line.bbox.y, width: Math.max(1, Math.abs(b - a)), height: line.bbox.height });
      }
      i += ch.length;
    }
  }
  return out;
}

/** The bands behind `chars` in `block`: its own lines, then its resource's
 *  caption, note and cells (turned with a rotated resource). */
function blockBands(block: VDTBlock, chars: ReadonlySet<string>, mirrored: boolean): Array<{ x: number; y: number; width: number; height: number }> {
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const line of block.lines ?? []) {
    const placed = placeLineSegments(block, line, mirrored, false);
    if (placed) out.push(...bandsIn(placed, line, chars));
  }
  const rb = block.resourceBlock;
  if (rb) {
    const lines = [...rb.captionLines, ...rb.noteLines, ...(rb.table?.cells.flatMap((c) => c.lines) ?? [])];
    for (const line of lines) {
      for (const band of bandsIn(placeResourceLine(line), line, chars)) out.push(resourceBlockRectToPage(rb, band));
    }
  }
  return out;
}

/** The bands to draw on page `pageIndex` of `doc`, in its flow frame. */
export function glyphMarks(doc: VDTDocument, pageIndex: number, mirrored: boolean): GlyphMark[] {
  const page = doc.pages[pageIndex];
  if (!page) return [];
  let byId: Map<string, VDTBlock> | undefined;
  const out: GlyphMark[] = [];
  for (const w of doc.contentWarnings ?? []) {
    if (w.kind !== 'glyphFallbackAt' || w.pageIndex !== pageIndex) continue;
    byId ??= new Map([...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...(page.marginNotes ?? [])].map((b) => [b.id, b]));
    const block = byId.get(w.blockId);
    if (!block) continue;
    const fill = w.supplier !== undefined ? SUPPLIED_GLYPH_FILL : MISSING_GLYPH_FILL;
    for (const band of blockBands(block, new Set(w.characters), mirrored)) out.push({ ...band, fill, block });
  }
  return out;
}
