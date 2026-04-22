import type { PDFDocument, PDFFont } from 'pdf-lib';
import { fontKey, parseFontString } from './fontString';

/** True when `bytes` starts with the `OTTO` magic identifying a CFF-flavored
 *  OpenType font. These are the ones whose subsetting is pathologically
 *  slow in pdf-lib, so we embed them whole instead. */
function isCffOpenType(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && // O
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x4f    // O
  );
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
          // pdf-lib subsets CFF OpenType (.otf, signature `OTTO`) by walking
          // every glyph at save time, which can take minutes for larger
          // families. Disable subsetting for CFF — the full face embeds in
          // seconds, at the cost of a somewhat larger PDF. TrueType fonts
          // subset normally.
          const subset = !isCffOpenType(bytes);
          const font = await this.pdfDoc.embedFont(bytes, { subset });
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
