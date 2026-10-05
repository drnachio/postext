/**
 * Vertical twins of embedded fonts (issue #191).
 *
 * pdf-lib writes every custom font as a Type0 font with `Encoding
 * /Identity-H`. Characters that stand upright in vertical text are shown
 * with a second Type0 dictionary over the same CIDFont — the same font
 * file, the same widths and the same ToUnicode map — whose encoding is
 * `/Identity-V` (WMode 1): the glyphs of one run then advance down the
 * column by themselves (`DW2 [880 −1000]`, one em each), pdf.js and Poppler
 * read the run as one vertical text item, and nothing of the font is
 * embedded twice.
 *
 * The glyphs are shaped with OpenType `vert` into the same subset as the
 * horizontal text (the ids a subset font gives, or the face's own ids for a
 * font embedded whole), so brackets, quotes and the mainland pause marks
 * take the font's vertical forms. fontkit keeps each substituted glyph's
 * source characters, so the shared ToUnicode map reads them back; where one
 * vertical glyph stands for two characters (Noto Serif SC sets “ and 『
 * with one glyph), the line's `/ActualText` gives the text as written.
 *
 * The glyphs are shaped in the language in force (`shapingLanguage.ts`):
 * a Japanese line takes the Japanese forms of a pan-CJK face.
 *
 * fontkit misreads the `vhea` table of Noto CJK fonts (it reports no
 * vertical metrics), so nothing here reads vertical advances or origins
 * from it: every upright character is one em down the column, as the
 * layout measured it, and the painter places the pen itself.
 */
import { PDFArray, PDFDict, PDFName, PDFRef, type PDFFont } from 'pdf-lib';
import { shapingKey } from './shapingLanguage';

/** The vertical origin (`DW2`'s first number) every twin is written with,
 *  in thousandths of the em: the ideographic em box's top above the
 *  baseline in Noto and Source Han, and what viewers assume when a font
 *  says nothing. The painter places each run's pen from it and the
 *  document's measured central axis, so any face lines up. */
export const VERTICAL_ORIGIN = 880;

interface ShapedGlyph {
  id: number;
  advanceWidth: number;
  codePoints: number[];
}

interface Embedder {
  font: {
    unitsPerEm: number;
    layout(text: string, features?: unknown): { glyphs: ShapedGlyph[] };
    glyphForCodePoint?(cp: number): ShapedGlyph;
  };
  fontFeatures?: unknown;
  subset?: { includeGlyph(glyph: ShapedGlyph): number };
  glyphs?: ShapedGlyph[];
  glyphIdMap?: Map<number, number>;
  glyphCache?: { invalidate(): void };
  embedFontDict(context: unknown, ref?: PDFRef): Promise<PDFRef>;
}

/** A font's vertical twin: its dictionary's reference and the encoder of
 *  upright text into the shared glyph ids. */
export interface VerticalTwin {
  ref: PDFRef;
  /** The hex glyph codes of `text` and the shaped glyphs (their ids in the
   *  face): in the font's vertical forms (OpenType `vert` with `fwid`, as
   *  the canvas's twin face sets them: Noto CJK keys the vertical form of
   *  its dashes to both, and the marks are full-width already), or as it
   *  is when `vertical` is false. With `cells` (the graphemes of `text`,
   *  each set in a cell of its own), one glyph per cell: the text is shaped
   *  whole when that gives as many glyphs as cells, else cell by cell, so a
   *  ligature (f + i in `:upright[fi]`) never takes two cells' places. */
  encode(text: string, vertical?: boolean, cells?: readonly string[]): { hex: string; glyphs: ShapedGlyph[] };
  /** Whether the font has a vertical form for `ch`: a glyph `vert` gives
   *  on top of what `fwid` alone gives. */
  hasVerticalForm(ch: string): boolean;
  /** How many glyphs `text` (one grapheme) shapes to, as {@link encode}
   *  would shape it, without adding them to the subset. In WMode 1 every
   *  glyph of a show advances one em, so a cluster of more than one (a
   *  combining mark the font does not compose, an emoji sequence it does
   *  not ligate) cannot be shown in one cell of a run. */
  glyphCount(text: string, vertical?: boolean): number;
}

const twins = new WeakMap<PDFFont, VerticalTwin>();
const twinRefs = new WeakMap<PDFFont, string>();

function embedderOf(font: PDFFont): Embedder | undefined {
  const e = (font as unknown as { embedder?: Embedder }).embedder;
  return e && e.font && typeof e.font.layout === 'function' && typeof e.embedFontDict === 'function' ? e : undefined;
}

/** The features `vert` shaping runs with: the font's own plus `vert`. */
function verticalFeatures(features: unknown): unknown {
  if (Array.isArray(features)) return [...new Set([...features, 'vert'])];
  if (features && typeof features === 'object') return { ...(features as Record<string, boolean>), vert: true };
  return ['vert'];
}

/**
 * The vertical twin of an embedded custom font, made on first use:
 * undefined for a font pdf-lib does not embed through fontkit (a standard
 * font). The twin's dictionary is written with the font (pdf-lib builds the
 * horizontal one on save; the twin is filled in right after it).
 */
export function verticalTwinOf(font: PDFFont): VerticalTwin | undefined {
  const known = twins.get(font);
  if (known) return known;
  const embedder = embedderOf(font);
  if (!embedder) return undefined;
  const context = font.doc.context;
  const ref = context.nextRef();
  const embedFontDict = embedder.embedFontDict.bind(embedder);
  embedder.embedFontDict = async (ctx: unknown, hRef?: PDFRef): Promise<PDFRef> => {
    const written = await embedFontDict(ctx, hRef);
    const h = context.lookup(written, PDFDict);
    const descendants = h.lookup(PDFName.of('DescendantFonts'), PDFArray);
    const cid = descendants.lookup(0, PDFDict);
    cid.set(PDFName.of('DW2'), context.obj([VERTICAL_ORIGIN, -1000]));
    context.assign(ref, context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: h.get(PDFName.of('BaseFont'))!,
      Encoding: 'Identity-V',
      DescendantFonts: h.get(PDFName.of('DescendantFonts'))!,
      ToUnicode: h.get(PDFName.of('ToUnicode'))!,
    }));
    return written;
  };
  const plain = embedder.fontFeatures;
  const withFwid = (f: unknown): unknown => (Array.isArray(f) ? [...new Set([...f, 'fwid'])] : { ...((f as Record<string, boolean> | undefined) ?? {}), fwid: true });
  const vertical = withFwid(verticalFeatures(plain));
  const fullWidth = withFwid(plain);
  const idsOf = (ch: string, features: unknown): string => embedder.font.layout(ch, features).glyphs.map((g) => g.id).join(',');
  const formCache = new Map<string, boolean>();
  const countCache = new Map<string, number>();
  const twin: VerticalTwin = {
    ref,
    encode(text, upright = true, cells) {
      const features = upright ? vertical : plain;
      let glyphs = embedder.font.layout(text, features).glyphs;
      if (cells && cells.length > 1 && glyphs.length !== cells.length) glyphs = cells.flatMap((c) => embedder.font.layout(c, features).glyphs);
      let hex = '';
      for (const g of glyphs) {
        let id = g.id;
        if (embedder.subset && embedder.glyphs && embedder.glyphIdMap) {
          id = embedder.subset.includeGlyph(g);
          embedder.glyphs[id - 1] = g;
          embedder.glyphIdMap.set(g.id, id);
        }
        hex += id.toString(16).padStart(4, '0');
      }
      embedder.glyphCache?.invalidate();
      // pdf-lib writes a font only once text was encoded with it.
      (font as unknown as { modified: boolean }).modified = true;
      return { hex, glyphs };
    },
    glyphCount(text, upright = true) {
      const key = `${upright ? 'v' : 'h'}${shapingKey(text)}`;
      let n = countCache.get(key);
      if (n === undefined) {
        n = embedder.font.layout(text, upright ? vertical : plain).glyphs.length;
        countCache.set(key, n);
      }
      return n;
    },
    hasVerticalForm(ch) {
      const key = shapingKey(ch);
      const hit = formCache.get(key);
      if (hit !== undefined) return hit;
      const v = idsOf(ch, vertical);
      const has = v !== idsOf(ch, plain) && v !== idsOf(ch, fullWidth);
      formCache.set(key, has);
      return has;
    },
  };
  twins.set(font, twin);
  twinRefs.set(font, ref.toString());
  return twin;
}

/** The reference of `font`'s vertical twin, when one was made: a page that
 *  shows text through the twin uses the font. */
export function verticalTwinRefOf(font: PDFFont): string | undefined {
  return twinRefs.get(font);
}
