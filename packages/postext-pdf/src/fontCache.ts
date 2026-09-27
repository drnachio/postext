import { padTrueTypeGlyphs } from './trueTypePadding';
import { PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFFont } from 'pdf-lib';
import { fontKey, parseFontString } from './fontString';

/** True when `bytes` starts with the `OTTO` magic identifying a CFF-flavored
 *  OpenType font — the ones pdf-lib cannot subset reliably, so they embed
 *  whole (see `preloadFontStrings`). */
function isCffOpenType(bytes: Uint8Array): boolean {
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
      font: FontkitFace & { layout: (text: string, features?: unknown) => { glyphs: Glyph[] } };
      glyphCache: { access: () => Glyph[] };
      embedUnicodeCmap: (context: { flateStream: (s: string) => unknown; register: (o: unknown) => unknown }) => unknown;
    };
  }).embedder;
  const face = embedder.font;
  const shaped = new Map<number, number[]>();
  const layout = face.layout.bind(face);
  face.layout = (text, features) => {
    const run = layout(text, features);
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

export type PdfFontProvider = (
  family: string,
  weight: number,
  style: 'normal' | 'italic',
) => Promise<Uint8Array>;

/** A face the document asked for, and the face of the same family set in
 *  its place because the provider rejected it (see
 *  {@link FontCache.preloadFontStrings}). */
export interface FontFallback {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  fallback: { weight: number; style: 'normal' | 'italic' };
  /** The provider's error message for the requested face. */
  reason: string;
}

interface FaceSpec {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/** The nine standard weights: the cuts a font provider may have. */
const STANDARD_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** `weights` in the order CSS font matching tries them for `desired`
 *  (CSS Fonts 4 §5.2): from 400 to 500, the weights up to 500 ascending,
 *  then the lighter ones descending, then the heavier ones ascending; below
 *  400, lighter (or equal) descending, then heavier ascending; above 500,
 *  heavier (or equal) ascending, then lighter descending. The browser picks
 *  the same face, so the PDF matches the preview. */
export function cssWeightOrder(desired: number, weights: readonly number[]): number[] {
  const asc = [...new Set(weights)].sort((a, b) => a - b);
  if (desired >= 400 && desired <= 500) {
    return [
      ...asc.filter((w) => w >= desired && w <= 500),
      ...asc.filter((w) => w < desired).reverse(),
      ...asc.filter((w) => w > 500),
    ];
  }
  if (desired < 400) return [...asc.filter((w) => w <= desired).reverse(), ...asc.filter((w) => w > desired)];
  return [...asc.filter((w) => w >= desired), ...asc.filter((w) => w < desired).reverse()];
}

/** Faces of the same family to try, in order, when the provider rejects
 *  `spec`: every standard weight in the requested style, in CSS matching
 *  order ({@link cssWeightOrder}), then every weight in the other style
 *  the same way — italic falls back to upright, and upright to italic. A
 *  family with no italics (a display face) sets its italic runs upright; a
 *  family shipping only 400 and 700 takes a 600 as 700; one shipping a
 *  single cut sets everything in it. */
export function fallbackFaces(spec: FaceSpec): FaceSpec[] {
  const weights = cssWeightOrder(spec.weight, [...STANDARD_WEIGHTS, spec.weight]);
  const styles: Array<'normal' | 'italic'> = spec.style === 'italic' ? ['italic', 'normal'] : ['normal', 'italic'];
  const out: FaceSpec[] = [];
  for (const style of styles) {
    for (const weight of weights) {
      if (style === spec.style && weight === spec.weight) continue;
      out.push({ family: spec.family, weight, style });
    }
  }
  return out;
}

/**
 * Per-document mapping from `family|weight|style` to an embedded pdf-lib
 * font. Entries are populated up-front by `preload()` so that block-level
 * rendering (`get()`) is a sync lookup. A face the provider rejects falls
 * back to another face of its family ({@link fallbackFaces}), reported
 * through `onFallback`; a fontString that fails to parse, or whose family
 * the provider cannot supply at all (no standard weight in either style),
 * is mapped to `null` and reported back via `missing()`. Faces the
 * provider answers with the same file share one embedded font, and
 * `dropUnusedFonts()` keeps the fonts no page draws with out of the file.
 */
export class FontCache {
  private map = new Map<string, PDFFont | null>();
  private failed = new Set<string>();
  /** One load per actual face, shared by every key that falls back to it. */
  private loads = new Map<string, Promise<PDFFont | null>>();
  private errors = new Map<string, string>();
  /** Loaded faces by lower-cased family, for lookups nothing preloaded. */
  private byFamily = new Map<string, Array<FaceSpec & { font: PDFFont }>>();
  /** Embeds by the byte length of their file: a provider that answers
   *  several faces with one file (a stand-in for a cut the family lacks)
   *  gets it embedded once, whatever the faces. */
  private byLength = new Map<number, Array<{ bytes: Uint8Array; font: Promise<PDFFont> }>>();
  /** Every font this cache embedded. */
  private embedded = new Set<PDFFont>();

  constructor(
    private pdfDoc: PDFDocument,
    private provider: PdfFontProvider,
    private onFallback?: (fallback: FontFallback) => void,
  ) {}

  /** Embed a font file, once per distinct content. */
  private embedBytes(bytes: Uint8Array): Promise<PDFFont> {
    const same = this.byLength.get(bytes.length) ?? [];
    const known = same.find((entry) => sameBytes(entry.bytes, bytes));
    if (known) return known.font;
    const font = (async (): Promise<PDFFont> => {
      // pdf-lib's CFF subsetter emits a font stream some viewers cannot
      // parse (macOS Preview draws the text in a fallback face), so CFF
      // OpenType (.otf, signature `OTTO`) embeds whole — larger PDF, but
      // every viewer reads it. TrueType fonts subset normally.
      const subset = !isCffOpenType(bytes);
      // fontkit's TrueType subsetter mis-writes the offsets of fonts whose
      // glyph records are not 4-byte aligned (instanced variable fonts,
      // typically): pad them first so every glyph survives the subset.
      const embeddable = subset ? padTrueTypeGlyphs(bytes) : bytes;
      const embedded = await this.pdfDoc.embedFont(embeddable, { subset });
      if (!subset) {
        coverAllGlyphWidths(embedded);
        coverAllGlyphUnicode(embedded);
      }
      this.embedded.add(embedded);
      return embedded;
    })();
    same.push({ bytes, font });
    this.byLength.set(bytes.length, same);
    return font;
  }

  /** Fetch and embed one face, once. Null when the provider rejects it or
   *  its bytes do not embed. */
  private loadFace(spec: FaceSpec): Promise<PDFFont | null> {
    const key = fontKey(spec.family, spec.weight, spec.style);
    const pending = this.loads.get(key);
    if (pending) return pending;
    const load = (async (): Promise<PDFFont | null> => {
      try {
        const bytes = await this.provider(spec.family, spec.weight, spec.style);
        const font = await this.embedBytes(bytes);
        const family = spec.family.toLowerCase();
        const faces = this.byFamily.get(family) ?? [];
        faces.push({ ...spec, font });
        this.byFamily.set(family, faces);
        return font;
      } catch (err) {
        this.errors.set(key, err instanceof Error ? err.message : String(err));
        return null;
      }
    })();
    this.loads.set(key, load);
    return load;
  }

  async preloadFontStrings(fontStrings: Iterable<string | undefined>): Promise<void> {
    const jobs = new Map<string, FaceSpec>();
    for (const fs of fontStrings) {
      if (!fs) continue;
      const parsed = parseFontString(fs);
      if (!parsed) continue;
      const key = fontKey(parsed.family, parsed.weight, parsed.style);
      if (this.map.has(key) || jobs.has(key)) continue;
      jobs.set(key, { family: parsed.family, weight: parsed.weight, style: parsed.style });
    }

    await Promise.all(
      Array.from(jobs.entries()).map(async ([key, spec]) => {
        const font = await this.loadFace(spec);
        if (font) {
          this.map.set(key, font);
          return;
        }
        // One candidate at a time, so no face is fetched (and embedded)
        // that nothing is set in; a face asked once is never asked again.
        for (const alt of fallbackFaces(spec)) {
          const altFont = await this.loadFace(alt);
          if (!altFont) continue;
          this.map.set(key, altFont);
          this.onFallback?.({
            ...spec,
            fallback: { weight: alt.weight, style: alt.style },
            reason: this.errors.get(key) ?? 'rejected by the font provider',
          });
          return;
        }
        this.failed.add(`${spec.family} ${spec.weight}${spec.style === 'italic' ? ' italic' : ''}`);
        this.map.set(key, null);
      }),
    );
  }

  get(fontString: string): PDFFont | null {
    const parsed = parseFontString(fontString);
    if (!parsed) return null;
    const key = fontKey(parsed.family, parsed.weight, parsed.style);
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    // Never preloaded: the nearest loaded face of the family (same style
    // first), so a face the plan missed still paints its text.
    const faces = this.byFamily.get(parsed.family.toLowerCase());
    if (!faces || faces.length === 0) return null;
    const sameStyle = faces.filter((f) => f.style === parsed.style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    const weight = cssWeightOrder(parsed.weight, pool.map((f) => f.weight))[0];
    return pool.find((f) => f.weight === weight)!.font;
  }

  missing(): string[] {
    return [...this.failed];
  }

  /** Leave out of the file every font this cache embedded that no page
   *  draws with: a face asked for but never set (the text of a figure
   *  later drawn as a picture, say) would otherwise be written anyway,
   *  since pdf-lib writes every font it embedded. Call it once all pages
   *  are drawn, right before `save()`. */
  dropUnusedFonts(): void {
    // pdf-lib keeps its embedded fonts in a private list and writes each
    // one on save; a font taken out of it is never written.
    const fonts = (this.pdfDoc as unknown as { fonts?: PDFFont[] }).fonts;
    if (!Array.isArray(fonts)) return;
    const used = fontRefsInUse(this.pdfDoc);
    for (let i = fonts.length - 1; i >= 0; i--) {
      const font = fonts[i]!;
      if (this.embedded.has(font) && !used.has(font.ref.toString())) fonts.splice(i, 1);
    }
  }
}

/** Whether two files hold the same bytes. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The fonts the pages name in their resources, and in those of the form
 *  XObjects they draw, as reference strings. */
function fontRefsInUse(pdfDoc: PDFDocument): Set<string> {
  const used = new Set<string>();
  const seen = new Set<PDFDict>();
  const visit = (resources: PDFDict | undefined): void => {
    if (!resources || seen.has(resources)) return;
    seen.add(resources);
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [, value] of fonts?.entries() ?? []) used.add(value.toString());
    const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    for (const [, value] of xobjects?.entries() ?? []) {
      // Images and embedded pages are written on save, so a reference
      // may not resolve yet; only a form drawn here can name a font.
      const xobject = value instanceof PDFRef ? pdfDoc.context.lookup(value) : value;
      if (xobject instanceof PDFStream) visit(xobject.dict.lookupMaybe(PDFName.of('Resources'), PDFDict));
    }
  };
  for (const page of pdfDoc.getPages()) visit(page.node.Resources());
  return used;
}
