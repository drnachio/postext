import type { VDTDocument, VDTBlock } from 'postext';

/** Collect every fontString referenced anywhere in the VDT. */
export function collectFontStrings(doc: VDTDocument): string[] {
  const out = new Set<string>();
  for (const block of doc.blocks) {
    if (block.fontString) out.add(block.fontString);
    if (block.boldFontString) out.add(block.boldFontString);
    if (block.italicFontString) out.add(block.italicFontString);
    if (block.boldItalicFontString) out.add(block.boldItalicFontString);
    if (block.bulletFontString) out.add(block.bulletFontString);
    // Resource caption + table cell fonts (issue #49).
    const rb = block.resourceBlock;
    if (rb) {
      out.add(rb.captionFontString);
      out.add(rb.captionBoldFontString);
      out.add(rb.captionItalicFontString);
      out.add(rb.captionBoldItalicFontString);
      if (rb.table) {
        out.add(rb.table.fontString);
        out.add(rb.table.boldFontString);
        out.add(rb.table.italicFontString);
        out.add(rb.table.boldItalicFontString);
      }
    }
  }
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand]) {
      if (!slot) continue;
      for (const b of slot.blocks) {
        if (b.kind === 'text') out.add(b.fontString);
      }
    }
  }
  return [...out];
}

export function pickSegmentFont(
  bold: boolean,
  italic: boolean,
  block: VDTBlock,
): string {
  if (bold && italic && block.boldItalicFontString) return block.boldItalicFontString;
  if (bold && block.boldFontString) return block.boldFontString;
  if (italic && block.italicFontString) return block.italicFontString;
  return block.fontString;
}

export function pickSegmentColor(
  bold: boolean,
  italic: boolean,
  block: VDTBlock,
): string {
  if (bold && block.boldColor) return block.boldColor;
  if (italic && block.italicColor) return block.italicColor;
  return block.color;
}
