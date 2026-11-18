// Where the characters a face lacks are (#1460): the block of each page
// that sets them, apart for each family that draws them. Split out of
// glyphFallback.ts, which says which faces lack what.

import type { VDTDocument } from '../vdt.js';
import { fontStringFamilies, parseFontString, type FontFaceRequest } from '../measure/fontString.js';
import { faceRequestKey, GLYPH_PROBE_FAMILY, isGenericFamily } from './faces.js';
import { addLines, defaultSources, GLYPH_FALLBACK_LISTED, skippedChar, symbolFontHas, type Add, type GlyphFallbackOptions } from './glyphFallback.js';

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
export function glyphFallbackPlaces(doc: VDTDocument, options: Pick<GlyphFallbackOptions, 'hasGlyph' | 'skip' | 'symbolFont' | 'reading'> = {}): GlyphFallbackPlace[] {
  const sources = options.hasGlyph ? { hasGlyph: options.hasGlyph } : defaultSources();
  if (!sources) return [];
  const { hasGlyph } = sources;
  const symbols = options.symbolFont?.trim().toLowerCase();
  // Every text of the document comes through here, most of them many
  // times (#1606): a font shorthand is parsed once, and the characters a
  // face lacks in a text are found once, whichever blocks set it.
  interface Checked {
    face: FontFaceRequest; key: string; rest: string[]; lacks: Map<string, boolean>; texts: Map<string, readonly string[]>;
    /** The texts the caller's reading found in this shorthand, when the
     *  face has every character of them: none lacks anything (#1635). */
    whole?: ReadonlySet<string>;
  }
  const NONE: readonly string[] = [];
  const fonts = new Map<string, Checked | null>();
  const faces = new Map<string, Pick<Checked, 'lacks' | 'texts'>>();
  // The shorthand asked last: a block's words ask the same one (#1635).
  let lastFont: string | undefined;
  let lastChecked: Checked | null = null;
  const checked = (font: string): Checked | null => {
    if (font === lastFont) return lastChecked;
    lastFont = font;
    return (lastChecked = checkedOf(font));
  };
  const checkedOf = (font: string): Checked | null => {
    let c = fonts.get(font);
    if (c !== undefined) return c;
    const face = parseFontString(font);
    c = null;
    if (face && !isGenericFamily(face.family) && face.family !== GLYPH_PROBE_FAMILY) {
      const key = faceRequestKey(face);
      if (!options.skip?.has(key)) {
        let shared = faces.get(key);
        if (!shared) faces.set(key, (shared = { lacks: new Map(), texts: new Map() }));
        c = { face, key, rest: fontStringFamilies(font).slice(1).filter((f) => f.toLowerCase() !== face.family.toLowerCase()), ...shared };
        const chars = options.reading?.chars.get(font);
        const texts = options.reading?.texts.get(font);
        if (chars && texts && !lacksAny(c, chars)) c.whole = texts;
      }
    }
    fonts.set(font, c);
    return c;
  };
  /** Whether the face lacks one of `chars`. */
  const lacksAny = (c: Checked, chars: Iterable<string>): boolean => {
    for (const ch of chars) {
      let v = c.lacks.get(ch);
      if (v === undefined) c.lacks.set(ch, (v = !skippedChar(ch) && hasGlyph(c.face.family, c.face.weight, c.face.style, ch) === false));
      if (v) return true;
    }
    return false;
  };
  /** The characters of `text` its face lacks, each once, in its order. */
  const lackingIn = (c: Checked, text: string): readonly string[] => {
    let found = c.texts.get(text);
    if (found !== undefined) return found;
    let list: string[] | undefined;
    for (const ch of text) {
      let v = c.lacks.get(ch);
      if (v === undefined) c.lacks.set(ch, (v = !skippedChar(ch) && hasGlyph(c.face.family, c.face.weight, c.face.style, ch) === false));
      if (v && !list?.includes(ch)) (list ??= []).push(ch);
    }
    found = list ?? NONE;
    c.texts.set(text, found);
    return found;
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
        const c = checked(font);
        if (!c || c.whole?.has(text)) return;
        const lacking = lackingIn(c, text);
        if (lacking.length === 0) return;
        let e = found.get(c.key);
        if (!e) found.set(c.key, (e = { face: c.face, chars: [], rest: c.rest }));
        for (const ch of lacking) if (!e.chars.includes(ch)) e.chars.push(ch);
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
