import type { VDTDocument, VDTBlock, VDTDesignSlot, VDTLine } from 'postext';

/** The four faces a run of rich text picks from by its bold / italic flags. */
interface FaceSet {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/**
 * Collect the fontString of every face the pages paint, walking them the
 * way the renderer does: a block's base face when it sets any line, the
 * face each text segment picks (bold / italic / its own), chip runs,
 * bullets, design-slot text, resource captions, notes and table cells.
 * Faces a block merely could use — the italic cut of a heading nobody
 * slants, the bold note face of a figure without a note — are left out, so
 * the font provider is never asked for them (EF-20). Hidden blocks, and the
 * lines of a block drawn through its design overlay, paint nothing.
 */
export function collectFontStrings(doc: VDTDocument): string[] {
  const out = new Set<string>();
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const block of col.blocks) addBlockFonts(block, out);
    }
    // Floated resources live on their page's float band, not in a column.
    for (const block of page.floats ?? []) addBlockFonts(block, out);
    for (const slot of [page.header, page.footer, page.openerBand]) addSlotFonts(slot, out);
  }
  return [...out];
}

function addBlockFonts(block: VDTBlock, out: Set<string>): void {
  if (block.hidden) return;
  // Design overlays (advanced heading designs, callout frames) replace the
  // block's own lines.
  if (block.designOverlay) {
    addSlotFonts(block.designOverlay, out);
    return;
  }
  const rb = block.resourceBlock;
  if (block.type === 'resource') {
    if (!rb) return;
    const caption: FaceSet = {
      normal: rb.captionFontString,
      bold: rb.captionBoldFontString,
      italic: rb.captionItalicFontString,
      boldItalic: rb.captionBoldItalicFontString,
    };
    const note: FaceSet = {
      normal: rb.noteFontString,
      bold: rb.noteBoldFontString,
      italic: rb.noteItalicFontString,
      boldItalic: rb.noteBoldItalicFontString,
    };
    addLinesFonts(rb.captionLines, caption, out);
    addLinesFonts(rb.noteLines, note, out);
    addLinesFonts(rb.continuesLines, note, out);
    const t = rb.table;
    if (t) {
      const body: FaceSet = { normal: t.fontString, bold: t.boldFontString, italic: t.italicFontString, boldItalic: t.boldItalicFontString };
      const header: FaceSet = {
        normal: t.headerFontString,
        bold: t.headerBoldFontString,
        italic: t.headerItalicFontString,
        boldItalic: t.headerBoldItalicFontString,
      };
      for (const cell of t.cells) addLinesFonts(cell.lines, cell.isHeader ? header : body, out);
    }
    return;
  }
  if (block.type === 'listItem' && block.bulletText && block.bulletFontString && block.bulletOffsetX !== undefined && block.lines[0]) {
    out.add(block.bulletFontString);
    if (block.separatorText && block.separatorX !== undefined) out.add(block.separatorFontString ?? block.bulletFontString);
  }
  addLinesFonts(block.lines, {
    normal: block.fontString,
    bold: block.boldFontString ?? block.fontString,
    italic: block.italicFontString ?? block.fontString,
    boldItalic: block.boldItalicFontString ?? block.boldFontString ?? block.italicFontString ?? block.fontString,
  }, out);
}

/** The faces a run of lines paints: the base face (spaces, plain lines)
 *  once any line sets something, then each text segment's pick. */
function addLinesFonts(lines: readonly VDTLine[] | undefined, faces: FaceSet, out: Set<string>): void {
  for (const line of lines ?? []) {
    const segments = line.segments ?? [];
    if (line.text.length === 0 && segments.length === 0) continue;
    out.add(faces.normal);
    for (const seg of segments) {
      if (seg.kind === 'space' || seg.kind === 'math' || seg.kind === 'swatch') continue;
      // A chip may set its own family; its runs carry their faces.
      if (seg.chip) {
        for (const run of seg.chip.runs) if (run.text) out.add(run.fontString);
        continue;
      }
      if (!seg.text) continue;
      out.add(seg.fontString ?? pickFace(!!seg.bold, !!seg.italic, faces));
    }
  }
}

function addSlotFonts(slot: VDTDesignSlot | undefined, out: Set<string>): void {
  for (const b of slot?.blocks ?? []) {
    if (b.kind !== 'text' || !b.lines.some((l) => l.text.length > 0)) continue;
    out.add(b.fontString);
    // Inline-mark runs: bold, italic, a script at the reduced size.
    for (const line of b.lines) {
      for (const run of line.runs ?? []) if (run.text) out.add(run.fontString);
    }
  }
}

function pickFace(bold: boolean, italic: boolean, faces: FaceSet): string {
  if (bold && italic) return faces.boldItalic;
  if (bold) return faces.bold;
  if (italic) return faces.italic;
  return faces.normal;
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
