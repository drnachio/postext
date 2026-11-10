/**
 * The faces form fields show and take their values in (#1445). A field's
 * face is embedded whole: someone filling the form in types characters the
 * file was not written with, and a subset would have no glyph for them.
 * Each face is embedded once, whatever the number of fields set in it, and
 * named in the AcroForm's default resources (`/DR`) for the fields' default
 * appearance (`/DA`). Helvetica stands in when a face cannot be embedded
 * whole (a licence that forbids it, a file given in slices, a format
 * pdf-lib cannot write whole), with a warning.
 */
import { type PDFDocument, type PDFFont, PDFDict, PDFName, StandardFonts } from 'pdf-lib';
import type { FontCache } from '../fontCache.js';
import { parseFontString } from '../fontString.js';
import { isCffOpenType, coverAllGlyphWidths } from '../fontCache/glyphTables.js';
import { declareCffProgram } from '../fontCache/cffProgram.js';
import { decompressWoff2 } from '../woff2.js';

/** The face form fields use: the chip's own (the default), Helvetica, or a
 *  face of the document's fonts. */
export type PdfFormFont = 'chip' | 'helvetica' | { family: string; weight?: number; style?: 'normal' | 'italic' };

/** The OS/2 `fsType` bits that forbid embedding the outlines: a restricted
 *  licence (bit 1), or bitmaps only (bit 9). */
const NOT_EMBEDDABLE = 0x0002 | 0x0200;

/** Big-endian reads of a font file. */
const u16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!;
const u32 = (b: Uint8Array, at: number): number => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
const tag = (b: Uint8Array, at: number): string => String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);

/** The file's OS/2 `fsType`, 0 (installable) when it has no OS/2 table. */
export function embeddingFlags(bytes: Uint8Array): number {
  if (bytes.length < 12) return 0;
  const tables = u16(bytes, 4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16;
    if (at + 16 > bytes.length) break;
    if (tag(bytes, at) !== 'OS/2') continue;
    const offset = u32(bytes, at + 8);
    return offset + 10 <= bytes.length ? u16(bytes, offset + 8) : 0;
  }
  return 0;
}

/** A file pdf-lib writes whole as it is: TrueType or CFF OpenType. A WOFF2
 *  file is decompressed first; anything else (WOFF, a collection) is not. */
async function sfntOf(bytes: Uint8Array): Promise<Uint8Array | string> {
  const magic = bytes.length >= 4 ? tag(bytes, 0) : '';
  if (magic === 'wOF2') return decompressWoff2(bytes);
  if (magic === '\0\x01\0\0' || magic === 'true' || magic === 'OTTO') return bytes;
  if (magic === 'wOFF') return 'a WOFF file (give TrueType, OpenType or WOFF2)';
  if (magic === 'ttcf') return 'a font collection';
  return 'not a font file pdf-lib can embed';
}

/** A ToUnicode map over every character the face's cmap reaches, so text
 *  typed into a field reads back (pdf-lib maps only the glyphs it drew). */
function coverWholeCmap(font: PDFFont): void {
  interface Glyph { id: number; codePoints: number[] }
  const embedder = (font as unknown as {
    embedder?: {
      font: { characterSet: number[]; glyphForCodePoint(cp: number): { id: number } };
      glyphCache: { access: () => Glyph[] };
    };
  }).embedder;
  if (!embedder) return;
  const access = embedder.glyphCache.access.bind(embedder.glyphCache);
  embedder.glyphCache.access = () => {
    const glyphs = [...access()];
    const known = new Set(glyphs.map((g) => g.id));
    for (const cp of embedder.font.characterSet) {
      const id = embedder.font.glyphForCodePoint(cp).id;
      if (id === 0 || known.has(id)) continue;
      known.add(id);
      glyphs.push({ id, codePoints: [cp] });
    }
    return glyphs;
  };
}

export class FormFonts {
  /** One embed per face (font key), shared by every field set in it. */
  private faces = new Map<string, Promise<PDFFont>>();
  private helvetica?: Promise<PDFFont>;

  constructor(
    private pdfDoc: PDFDocument,
    private fontCache: FontCache | undefined,
    private option: PdfFormFont | undefined,
    private warn: (message: string) => void,
  ) {}

  /** The face for a field whose chip is set in `chipFont` (a font string). */
  fontFor(chipFont: string | undefined): Promise<PDFFont> {
    const option = this.option ?? 'chip';
    if (option === 'helvetica') return this.fallback();
    const fontString = option === 'chip'
      ? chipFont
      : `${option.style === 'italic' ? 'italic ' : ''}${option.weight ?? 400} 16px "${option.family}"`;
    const parsed = fontString ? parseFontString(fontString) : null;
    if (!parsed || !this.fontCache) return this.fallback();
    const key = `${parsed.family}|${parsed.weight}|${parsed.style}`;
    let face = this.faces.get(key);
    if (!face) {
      face = this.embedWhole(fontString!, `${parsed.family} ${parsed.weight}${parsed.style === 'italic' ? ' italic' : ''}`);
      this.faces.set(key, face);
    }
    return face;
  }

  /** Name every face fields use in the AcroForm's `/DR`, where a viewer
   *  finds the face a field's `/DA` names. */
  async register(): Promise<void> {
    const fonts = new Set<PDFFont>(await Promise.all([...this.faces.values(), ...(this.helvetica ? [this.helvetica] : [])]));
    if (fonts.size === 0) return;
    const context = this.pdfDoc.context;
    const acro = this.pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    let dr = acro.lookupMaybe(PDFName.of('DR'), PDFDict);
    if (!dr) { dr = context.obj({}); acro.set(PDFName.of('DR'), dr); }
    let named = dr.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!named) { named = context.obj({}); dr.set(PDFName.of('Font'), named); }
    for (const font of fonts) named.set(PDFName.of(font.name), font.ref);
  }

  private fallback(): Promise<PDFFont> {
    this.helvetica ??= this.pdfDoc.embedFont(StandardFonts.Helvetica);
    return this.helvetica;
  }

  private async embedWhole(fontString: string, label: string): Promise<PDFFont> {
    const insteadOf = (why: string): Promise<PDFFont> => {
      this.warn(`form fields are shown in Helvetica instead of ${label}: ${why}`);
      return this.fallback();
    };
    const file = await this.fontCache!.wholeFileOf(fontString);
    if (!file) return insteadOf('the font provider gives no file for it');
    if (file === 'sliced') return insteadOf('the font provider gives it in several files, and a field needs one whole face');
    const bytes = await sfntOf(file.bytes);
    if (typeof bytes === 'string') return insteadOf(bytes);
    if (embeddingFlags(bytes) & NOT_EMBEDDABLE) return insteadOf('its licence (OS/2 fsType) does not allow embedding it');
    try {
      const font = await this.pdfDoc.embedFont(bytes, { subset: false });
      if (isCffOpenType(bytes)) declareCffProgram(font, bytes);
      coverAllGlyphWidths(font);
      coverWholeCmap(font);
      return font;
    } catch (err) {
      return insteadOf(err instanceof Error ? err.message : String(err));
    }
  }
}
