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
  }
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer]) {
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
