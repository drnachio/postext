import type { PDFDocument, PDFFont } from 'pdf-lib';
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

/**
 * Per-document mapping from `family|weight|style` to an embedded pdf-lib
 * font. Entries are populated up-front by `preload()` so that block-level
 * rendering (`get()`) is a sync lookup. A fontString that fails to parse or
 * to load is mapped to `null` and reported back via `missing()`.
 */
export class FontCache {
  private map = new Map<string, PDFFont | null>();
  private failed = new Set<string>();

  constructor(
    private pdfDoc: PDFDocument,
    private provider: PdfFontProvider,
  ) {}

  async preloadFontStrings(fontStrings: Iterable<string | undefined>): Promise<void> {
    const jobs = new Map<string, { family: string; weight: number; style: 'normal' | 'italic' }>();
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
        try {
          const bytes = await this.provider(spec.family, spec.weight, spec.style);
          // pdf-lib's CFF subsetter emits a font stream some viewers cannot
          // parse (macOS Preview draws the text in a fallback face), so CFF
          // OpenType (.otf, signature `OTTO`) embeds whole — larger PDF, but
          // every viewer reads it. TrueType fonts subset normally.
          const subset = !isCffOpenType(bytes);
          const font = await this.pdfDoc.embedFont(bytes, { subset });
          if (!subset) {
            coverAllGlyphWidths(font);
            coverAllGlyphUnicode(font);
          }
          this.map.set(key, font);
        } catch {
          this.failed.add(`${spec.family} ${spec.weight}${spec.style === 'italic' ? ' italic' : ''}`);
          this.map.set(key, null);
        }
      }),
    );
  }

  get(fontString: string): PDFFont | null {
    const parsed = parseFontString(fontString);
    if (!parsed) return null;
    const key = fontKey(parsed.family, parsed.weight, parsed.style);
    return this.map.get(key) ?? null;
  }

  missing(): string[] {
    return [...this.failed];
  }
}
