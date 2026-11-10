// Where the characters a face lacks are (#1460): the block of each page
// that sets them, apart for each family that draws them. Split out of
// glyphFallback.ts, which says which faces lack what.

import type { VDTDocument } from '../vdt.js';
import { fontStringFamilies, parseFontString, type FontFaceRequest } from '../measure/fontString.js';
import { faceRequestKey, GLYPH_PROBE_FAMILY, isGenericFamily } from './faces.js';
import { addLines, defaultSources, GLYPH_FALLBACK_LISTED, SKIPPED, symbolFontHas, type Add, type GlyphFallbackOptions } from './glyphFallback.js';

/** Characters a face lacks, in one block of one page: where a
 *  `glyphFallback` names a face, this says which paragraph sets them. The
 *  characters one family draws come apart from those no family has. */
export interface GlyphFallbackPlace extends FontFaceRequest {
  /** The characters, each once, in the order the block sets them. */
  characters: string[];
  /** The family of the font list that draws them (the `symbolFont`,
   *  say); undefined for the characters no family of the list has. */
  supplier?: string;
  /** The block that sets them (`VDTBlock.id`): its lines, or the caption,
   *  the note and the cells of the resource it holds. */
  blockId: string;
  /** The source range of the block, when it has one. */
  sourceStart?: number;
  sourceEnd?: number;
  pageIndex: number;
}

/** How many places a document reports at most. */
export const GLYPH_FALLBACK_PLACES = 200;

/**
 * The blocks of `doc` that set characters their face lacks, one entry per
 * block, face, page and family that draws them, in page order, at most
 * {@link GLYPH_FALLBACK_PLACES}. Read from the same sources as
 * `glyphFallbacks`; empty when there is neither a probe nor registered
 * coverage. The `symbolFont` (`options.symbolFont`) draws a character in
 * its regular face too, the one every output loads.
 */
export function glyphFallbackPlaces(doc: VDTDocument, options: Pick<GlyphFallbackOptions, 'hasGlyph' | 'skip' | 'symbolFont'> = {}): GlyphFallbackPlace[] {
  const sources = options.hasGlyph ? { hasGlyph: options.hasGlyph } : defaultSources();
  if (!sources) return [];
  const { hasGlyph } = sources;
  const symbols = options.symbolFont?.trim().toLowerCase();
  const lacks = new Map<string, boolean>();
  const lacking = (face: FontFaceRequest, key: string, ch: string): boolean => {
    const k = `${key}|${ch}`;
    let v = lacks.get(k);
    if (v === undefined) lacks.set(k, (v = hasGlyph(face.family, face.weight, face.style, ch) === false));
    return v;
  };
  const draws = (family: string, face: FontFaceRequest, ch: string): boolean =>
    family.toLowerCase() === symbols
      ? symbolFontHas(hasGlyph, family, face.weight, face.style, ch)
      : hasGlyph(family, face.weight, face.style, ch) === true;
  const out: GlyphFallbackPlace[] = [];
  for (let pageIndex = 0; pageIndex < doc.pages.length && out.length < GLYPH_FALLBACK_PLACES; pageIndex++) {
    const page = doc.pages[pageIndex]!;
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...(page.marginNotes ?? [])];
    for (const block of blocks) {
      interface Found { face: FontFaceRequest; chars: string[]; rest: string[] }
      const found = new Map<string, Found>();
      const add: Add = (font, text) => {
        if (!font || !text) return;
        const face = parseFontString(font);
        if (!face || isGenericFamily(face.family) || face.family === GLYPH_PROBE_FAMILY) return;
        const key = faceRequestKey(face);
        if (options.skip?.has(key)) return;
        for (const ch of text) {
          if (SKIPPED.test(ch) || !lacking(face, key, ch)) continue;
          let e = found.get(key);
          if (!e) found.set(key, (e = { face, chars: [], rest: fontStringFamilies(font).slice(1).filter((f) => f.toLowerCase() !== face.family.toLowerCase()) }));
          if (!e.chars.includes(ch)) e.chars.push(ch);
        }
      };
      addLines(block.lines, block.fontString, block.boldFontString, block.italicFontString, block.boldItalicFontString, add);
      const rb = block.resourceBlock;
      if (rb) {
        addLines(rb.captionLines, rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString, add);
        addLines(rb.noteLines, rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString, add);
        const t = rb.table;
        if (t) {
          for (const cell of t.cells) {
            if (cell.isHeader) addLines(cell.lines, t.headerFontString, t.headerBoldFontString, t.headerItalicFontString, t.headerBoldItalicFontString, add);
            else addLines(cell.lines, t.fontString, t.boldFontString, t.italicFontString, t.boldItalicFontString, add);
          }
        }
      }
      for (const e of found.values()) {
        // The characters by the family that draws them: those no family of
        // the list has (the PDF's empty boxes) apart from the others.
        const bySupplier = new Map<string, string[]>();
        for (const ch of e.chars) {
          const supplier = e.rest.find((f) => draws(f, e.face, ch)) ?? '';
          const list = bySupplier.get(supplier) ?? [];
          list.push(ch);
          bySupplier.set(supplier, list);
        }
        for (const [supplier, chars] of bySupplier) {
          out.push({
            family: e.face.family,
            weight: e.face.weight,
            style: e.face.style,
            characters: chars.slice(0, GLYPH_FALLBACK_LISTED),
            ...(supplier ? { supplier } : {}),
            blockId: block.id,
            ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : {}),
            ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
            pageIndex,
          });
          if (out.length >= GLYPH_FALLBACK_PLACES) return out;
        }
      }
    }
  }
  return out;
}
