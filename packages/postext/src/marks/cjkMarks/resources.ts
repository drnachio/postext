// Text groups of resources (#1278: split out of cjkMarks.ts).
import type { VDTLine, VDTBlock, VDTDocument } from '../../vdt.js';
import type { BlockLike } from './geometry.js';

/** Lines measured as one text: a paragraph, a table cell, a caption, a
 *  resource's note. */
export interface TextGroup {
  lines: VDTLine[];
  /** Where its lines are painted from (fonts, alignment, tracking). */
  like: BlockLike;
  /** Its page, `-1` when unplaced. */
  pageIndex: number;
  /** Its column on the page (shared gaps are checked down a column). */
  columnKey?: string;
  /** Dedupes the warnings of one text. */
  where: string;
  /** Where a warning points. */
  at: { sourceStart?: number; sourceEnd?: number; pageIndex?: number };
}

/** A resource block's texts (#429): each table cell, the caption and the
 *  note, painted from their own fonts. Their lines carry their alignment
 *  (the measurer pushed a centred or right-aligned line over by its
 *  slack), so they are read flush from their start. The "continued"
 *  marker of a table slice holds no annotations. */
export function resourceTextGroups(block: VDTBlock, at: TextGroup['at']): TextGroup[] {
  const rb = block.resourceBlock;
  if (!rb) return [];
  const groups: TextGroup[] = [];
  const add = (lines: VDTLine[], fonts: { fontString: string; boldFontString: string; italicFontString: string; boldItalicFontString: string }, key: string): void => {
    const first = lines[0];
    if (!first || !lines.some((l) => l.segments?.some((s) => s.cjkMarks || s.ruby))) return;
    groups.push({
      lines,
      like: { bbox: first.bbox, textAlign: 'left', ...fonts },
      pageIndex: block.pageIndex,
      where: `${block.id}:${key}`,
      at,
    });
  };
  const t = rb.table;
  if (t) {
    t.cells.forEach((cell, i) => add(cell.lines, cell.isHeader
      ? { fontString: t.headerFontString, boldFontString: t.headerBoldFontString, italicFontString: t.headerItalicFontString, boldItalicFontString: t.headerBoldItalicFontString }
      : { fontString: t.fontString, boldFontString: t.boldFontString, italicFontString: t.italicFontString, boldItalicFontString: t.boldItalicFontString }, `c${i}`));
  }
  add(rb.captionLines, { fontString: rb.captionFontString, boldFontString: rb.captionBoldFontString, italicFontString: rb.captionItalicFontString, boldItalicFontString: rb.captionBoldItalicFontString }, 'caption');
  add(rb.noteLines, { fontString: rb.noteFontString, boldFontString: rb.noteBoldFontString, italicFontString: rb.noteItalicFontString, boldItalicFontString: rb.noteBoldItalicFontString }, 'note');
  return groups;
}

/** The blocks of a document that hold a resource: in the flow and floated
 *  (`VDTPage.floats`), each once. */
export function resourceBlocksOf(doc: VDTDocument): VDTBlock[] {
  const seen = new Set<VDTBlock>();
  for (const block of doc.blocks) if (block.resourceBlock) seen.add(block);
  for (const page of doc.pages) for (const block of page.floats ?? []) if (block.resourceBlock) seen.add(block);
  return [...seen];
}
