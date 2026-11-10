// The characters the text's face has no glyph for, marked on the page:
// a band behind each one the build reported on this page
// (`glyphFallbackAt`), screen only. Red where no family of the font list
// has it (the PDF prints an empty box), violet where the `symbolFont`
// draws it.

import type { VDTBlock, VDTDocument } from 'postext';
import { placeLineSegments, xInPlaced } from './geometry/placement.js';

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

/** The bands to draw on page `pageIndex` of `doc`, in its flow frame. */
export function glyphMarks(doc: VDTDocument, pageIndex: number, mirrored: boolean): GlyphMark[] {
  // Each character, and whether some family draws it.
  const supplied = new Map<string, boolean>();
  for (const w of doc.contentWarnings ?? []) {
    if (w.kind !== 'glyphFallbackAt' || w.pageIndex !== pageIndex) continue;
    for (const ch of w.characters) supplied.set(ch, (supplied.get(ch) ?? true) && w.supplier !== undefined);
  }
  if (supplied.size === 0) return [];
  const page = doc.pages[pageIndex];
  if (!page) return [];
  const out: GlyphMark[] = [];
  for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
    for (const line of block.lines ?? []) {
      const placed = placeLineSegments(block, line, mirrored, false);
      if (!placed) continue;
      for (const p of placed) {
        if (p.seg.kind !== 'text') continue;
        const text = p.seg.text;
        for (let i = 0; i < text.length && i < p.plainLen;) {
          const ch = String.fromCodePoint(text.codePointAt(i)!);
          const has = supplied.get(ch);
          if (has !== undefined) {
            const a = xInPlaced(p, i);
            const b = xInPlaced(p, Math.min(p.plainLen, i + ch.length));
            out.push({ x: Math.min(a, b), y: line.bbox.y, width: Math.max(1, Math.abs(b - a)), height: line.bbox.height, fill: has ? SUPPLIED_GLYPH_FILL : MISSING_GLYPH_FILL, block });
          }
          i += ch.length;
        }
      }
    }
  }
  return out;
}
