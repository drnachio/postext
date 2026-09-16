import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { coverAllGlyphUnicode, toUnicodeCmap } from '../fontCache';

// Cormorant Garamond shapes fi / fl / Th into glyphs its cmap never reaches
// (GSUB-only), like the CFF body faces of print presets.
const cormorant = fs.readFileSync(new URL('../../../../apps/web/public/fonts/CormorantGaramond.ttf', import.meta.url));

/** The ToUnicode CMap text of the first font of the first page. */
async function toUnicodeOf(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const fonts = pdf.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  const [, ref] = fonts.entries()[0]!;
  const font = pdf.context.lookup(ref, PDFDict);
  const cmap = pdf.context.lookup(font.get(PDFName.of('ToUnicode')));
  if (!(cmap instanceof PDFRawStream)) throw new Error('no ToUnicode stream');
  return new TextDecoder('latin1').decode(decodePDFRawStream(cmap).decode());
}

describe('ToUnicode coverage of fully embedded faces', () => {
  it('maps the ligature glyphs the shaper produces (fi, fl) to their letters', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    // The whole-font path (CFF faces go this way; see fontCache.ts).
    const font = await pdfDoc.embedFont(cormorant, { subset: false });
    coverAllGlyphUnicode(font);
    pdfDoc.addPage([200, 100]).drawText('fi fl Th', { font, size: 12, x: 10, y: 50 });
    const cmap = await toUnicodeOf(await pdfDoc.save());
    // Cormorant Garamond: glyph 1272 = fi, 1273 = fl, 613 = Th.
    expect(cmap).toContain('<04f8> <00660069>');
    expect(cmap).toContain('<04f9> <0066006c>');
    expect(cmap).toContain('<0265> <00540068>');
    // The cmap-reachable glyphs stay mapped too (the space, U+0020).
    expect(cmap).toMatch(/<[0-9a-f]{4}> <0020>/);
  });

  it('leaves the ligatures unmapped without the fix (the reason it exists)', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(cormorant, { subset: false });
    pdfDoc.addPage([200, 100]).drawText('fi fl Th', { font, size: 12, x: 10, y: 50 });
    const cmap = await toUnicodeOf(await pdfDoc.save());
    expect(cmap).not.toContain('<04f8>');
    expect(cmap).not.toContain('<0265>');
  });

  it('writes bfchar blocks of at most 100 entries with UTF-16 surrogates', () => {
    const glyphs = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, codePoints: [0x41 + (i % 26)] }));
    glyphs.push({ id: 500, codePoints: [0x1f600] });
    glyphs.push({ id: 501, codePoints: [] });
    const cmap = toUnicodeCmap(glyphs);
    expect(cmap.match(/beginbfchar/g)).toHaveLength(2);
    expect(cmap).toContain('100 beginbfchar');
    expect(cmap).toContain('51 beginbfchar');
    expect(cmap).toContain('<01f4> <d83dde00>');
    expect(cmap).not.toContain('<01f5>');
  });
});
