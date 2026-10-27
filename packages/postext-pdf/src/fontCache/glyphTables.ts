// Widths and ToUnicode entries for every glyph of an embedded font, and
// the space glyph (#1276: split out of fontCache.ts).
import type { PDFFont } from 'pdf-lib';

/** True when `bytes` starts with the `OTTO` magic identifying a CFF-flavored
 *  OpenType font — the ones pdf-lib cannot subset reliably, so they embed
 *  whole (see `preloadFontStrings`). */
export function isCffOpenType(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && // O
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x4f    // O
  );
}

/** The fontkit face behind a pdf-lib custom font — the subset of its API
 *  the width fix below needs. */
interface FontkitFace {
  numGlyphs: number;
  unitsPerEm: number;
  getGlyph(id: number): { advanceWidth: number };
}

/** pdf-lib builds a CID font's `W` (advance widths) array from the glyphs
 *  reachable through the cmap, so a face embedded whole leaves every
 *  GSUB-only glyph — the fi/fl ligatures, contextual alternates — at the
 *  default 1000-unit advance, and viewers draw "refl eja" with a gap after
 *  the ligature (or the next glyph overlapping it). Replace the width
 *  computation with one that covers every glyph in the face. */
export function coverAllGlyphWidths(font: PDFFont): void {
  const embedder = (font as unknown as {
    embedder: { font: FontkitFace; computeWidths: () => unknown[] };
  }).embedder;
  const face = embedder.font;
  const toPdfUnits = 1000 / face.unitsPerEm;
  embedder.computeWidths = () => {
    const widths: number[] = [];
    for (let gid = 0; gid < face.numGlyphs; gid++) {
      widths.push(face.getGlyph(gid).advanceWidth * toPdfUnits);
    }
    return [0, widths];
  };
}

/** UTF-16BE hex of a code point sequence, for a CMap `bfchar` destination. */
function utf16Hex(codePoints: number[]): string {
  let out = '';
  for (const cp of codePoints) {
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      out += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      out += cp.toString(16).padStart(4, '0');
    }
  }
  return out;
}

/** A ToUnicode CMap (Identity-H codes = glyph ids) for the given glyphs. */
export function toUnicodeCmap(glyphs: Array<{ id: number; codePoints: number[] }>): string {
  const entries = glyphs
    .filter((g) => g.codePoints.length > 0)
    .sort((a, b) => a.id - b.id)
    .map((g) => `<${g.id.toString(16).padStart(4, '0')}> <${utf16Hex(g.codePoints)}>`);
  let blocks = '';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    blocks += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
  }
  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo <<\n  /Registry (Adobe)\n  /Ordering (UCS)\n  /Supplement 0\n>> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000><ffff>\nendcodespacerange\n' +
    blocks +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  );
}

/**
 * A fully embedded face gets a ToUnicode map covering only the glyphs its
 * cmap reaches, so a ligature the shaper substitutes (`fi`, `fl`, `ffi`)
 * has no Unicode value: text extraction drops the letters and PDF/UA
 * validators reject the font (ISO 14289-1 §7.21.7). Record every glyph the
 * layout engine produces for the text actually set — its `codePoints` are
 * the characters it stands for, ligatures included — and write the map
 * from the cmap glyphs plus those.
 */
export function coverAllGlyphUnicode(font: PDFFont): void {
  interface Glyph { id: number; codePoints: number[] }
  const embedder = (font as unknown as {
    embedder: {
      font: FontkitFace & { layout: (text: string, features?: unknown, ...rest: unknown[]) => { glyphs: Glyph[] } };
      glyphCache: { access: () => Glyph[] };
      embedUnicodeCmap: (context: { flateStream: (s: string) => unknown; register: (o: unknown) => unknown }) => unknown;
    };
  }).embedder;
  const face = embedder.font;
  const shaped = new Map<number, number[]>();
  const layout = face.layout.bind(face);
  face.layout = (text, features, ...rest) => {
    const run = layout(text, features, ...rest);
    for (const g of run.glyphs) {
      if (g.codePoints.length > 0 && !shaped.has(g.id)) shaped.set(g.id, g.codePoints);
    }
    return run;
  };
  embedder.embedUnicodeCmap = (context) => {
    const glyphs: Glyph[] = [...embedder.glyphCache.access()];
    const known = new Set(glyphs.map((g) => g.id));
    for (const [id, codePoints] of shaped) if (!known.has(id)) glyphs.push({ id, codePoints });
    return context.register(context.flateStream(toUnicodeCmap(glyphs)));
  };
}

/**
 * Make the face's space glyph for the space (#755). fontkit makes a glyph
 * once, with the characters of the text that first shows it, and the
 * font's `/ToUnicode` map is written from them: in a face that draws the
 * no-break space with the space glyph, a title set before any space
 * (`Nº 12`) would have every space of the document read as a no-break
 * space, or take a span each to read right (`glyphReads` in
 * `pdf-backend/primitives/shapedRuns.ts`).
 */
export function spaceGlyphForSpace(font: PDFFont): void {
  const face = (font as unknown as {
    embedder?: { font?: { hasGlyphForCodePoint?(codePoint: number): boolean; glyphForCodePoint?(codePoint: number): unknown } };
  }).embedder?.font;
  if (face?.hasGlyphForCodePoint?.(0x20)) face.glyphForCodePoint?.(0x20);
}
