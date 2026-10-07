import type { VDTDocument, VDTBlock, VDTDesignSlot, VDTLine } from 'postext';

/** The four faces a run of rich text picks from by its bold / italic flags. */
interface FaceSet {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** Font strings and the characters set in each (see {@link collectFontText}). */
export type FontText = Map<string, Set<number>>;

/** Record that `text` is set in `fontString`; an empty text still records
 *  the face. */
function add(out: FontText, fontString: string, text = ''): void {
  let cps = out.get(fontString);
  if (!cps) {
    cps = new Set();
    out.set(fontString, cps);
  }
  for (const ch of text) cps.add(ch.codePointAt(0)!);
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
  return [...collectFontText(doc).keys()];
}

/**
 * {@link collectFontStrings} with the characters set in each face, for a
 * font provider that serves a family as several files (issue #196). A
 * block's base face is credited with the whole text of its lines (it paints
 * the spaces and every plain line), so it may list characters a styled run
 * sets in another face: the provider may hand over a file that is never
 * drawn from, which is left out of the PDF. `into` gathers several
 * documents (the chapters of a book).
 */
export function collectFontText(doc: VDTDocument, into: FontText = new Map()): FontText {
  const out = into;
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const block of col.blocks) addBlockFonts(block, out);
    }
    // Floated resources live on their page's float band, not in a column.
    for (const block of page.floats ?? []) addBlockFonts(block, out);
    for (const slot of [page.header, page.footer, page.openerBand]) addSlotFonts(slot, out);
    // A comic page's lettering: design text in its balloons.
    for (const balloon of page.comic?.balloons ?? []) addSlotFonts({ blocks: balloon.text }, out);
  }
  return out;
}

function addBlockFonts(block: VDTBlock, out: FontText): void {
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
    add(out, block.bulletFontString, block.bulletText);
    if (block.separatorText && block.separatorX !== undefined) add(out, block.separatorFontString ?? block.bulletFontString, block.separatorText);
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
function addLinesFonts(lines: readonly VDTLine[] | undefined, faces: FaceSet, out: FontText): void {
  for (const line of lines ?? []) {
    const segments = line.segments ?? [];
    if (line.text.length === 0 && segments.length === 0) continue;
    add(out, faces.normal, line.text);
    for (const seg of segments) {
      if (seg.kind === 'space' || seg.kind === 'math' || seg.kind === 'swatch') {
        if (seg.kind === 'space') add(out, faces.normal, seg.text);
        continue;
      }
      // A chip may set its own family; its runs carry their faces.
      if (seg.chip) {
        for (const run of seg.chip.runs) if (run.text) add(out, run.fontString, run.text);
        continue;
      }
      // A warichu note paints its rows; a ruby base its reading too.
      if (seg.warichu) {
        for (const run of seg.warichu.runs) if (run.text) add(out, run.fontString, run.text);
        continue;
      }
      if (seg.ruby) for (const run of seg.ruby.runs) if (run.text) add(out, run.fontString, run.text);
      // Kanbun marks (#430).
      if (seg.kunten) for (const run of seg.kunten.runs) if (run.text) add(out, run.fontString, run.text);
      // A footnote marker in the line gap paints its run, not its text.
      if (seg.sideMarker) {
        for (const run of seg.sideMarker.runs) if (run.text) add(out, run.fontString, run.text);
        continue;
      }
      if (!seg.text) continue;
      add(out, seg.fontString ?? pickFace(!!seg.bold, !!seg.italic, faces), seg.text);
      // A word set in several styles is shaped whole in each face one of
      // its runs takes (`drawStyledWordPx`).
      for (const run of seg.runs ?? []) {
        if (!!run.bold !== !!seg.bold || !!run.italic !== !!seg.italic) add(out, pickFace(!!run.bold, !!run.italic, faces), seg.text);
      }
    }
  }
}

function addSlotFonts(slot: Pick<VDTDesignSlot, 'blocks'> | undefined, out: FontText): void {
  for (const b of slot?.blocks ?? []) {
    if (b.kind !== 'text' || !b.lines.some((l) => l.text.length > 0)) continue;
    add(out, b.fontString);
    for (const line of b.lines) {
      add(out, b.fontString, line.text);
      // Inline-mark runs: bold, italic, a script at the reduced size.
      for (const run of line.runs ?? []) if (run.text) add(out, run.fontString, run.text);
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
