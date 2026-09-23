import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFArray, PDFDocument, PDFHexString, PDFNumber, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { showTextShaped } from '../pdf-backend/primitives';

// A kerned TrueType face from the demo app's static fonts (OFL).
const FONT_PATH = new URL('../../../../apps/web/public/fonts/Fraunces-Regular.ttf', import.meta.url);

/** Advance of `text` as a viewer paints the operator, in 1000-unit text
 *  space: the glyphs' `W` widths minus the TJ adjustments. */
function paintedWidth(font: PDFFont, text: string): number {
  const op = showTextShaped(font, text) as unknown as { args: unknown[] };
  const raw = font.widthOfTextAtSize(text, 1000);
  const arg = op.args[0];
  if (!(arg instanceof PDFArray)) return raw;
  let adjust = 0;
  for (const item of arg.asArray()) {
    if (item instanceof PDFNumber) adjust += item.asNumber();
    else expect(item).toBeInstanceOf(PDFHexString);
  }
  return raw - adjust;
}

/** The kerned advance fontkit shapes for `text`, in 1000-unit text space. */
function shapedWidth(text: string): number {
  const face = fontkit.create(readFileSync(FONT_PATH));
  const run = face.layout(text);
  return run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * 1000 / face.unitsPerEm;
}

describe('showTextShaped', () => {
  for (const subset of [true, false]) {
    it(`paints the kerned advance the canvas measured (subset: ${subset})`, async () => {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(readFileSync(FONT_PATH), { subset });
      // The face kerns these pairs, so glyph widths alone overshoot —
      // what drew "su referenciase prueban" in Geist captions.
      for (const text of ['AVATAR', 'Tv. Wo']) {
        expect(font.widthOfTextAtSize(text, 1000)).toBeGreaterThan(shapedWidth(text) + 1);
      }
      for (const text of ['AVATAR', 'Tv. Wo', 'su referencia se prueban']) {
        expect(paintedWidth(font, text)).toBeCloseTo(shapedWidth(text), 1);
      }
      // Output still saves.
      doc.addPage();
      await doc.save();
    });
  }

  it('keeps a plain Tj for text without position adjustments', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readFileSync(FONT_PATH), { subset: true });
    const op = showTextShaped(font, 'l') as unknown as { name: string };
    expect(op.name).toBe('Tj');
  });
});
