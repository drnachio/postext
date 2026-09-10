import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { coverAllGlyphWidths } from '../fontCache';

// A TrueType face from the demo app's static fonts (OFL). The width fix is
// applied to CFF faces in production, but the mechanics are format-agnostic.
const FONT_PATH = new URL('../../../../apps/web/public/fonts/Fraunces-Regular.ttf', import.meta.url);

/** The `/W` array of the first CID font in `bytes`, as numbers. */
function widthsArray(bytes: Uint8Array): number[] {
  const text = new TextDecoder('latin1').decode(bytes);
  const match = /\/W \[([\s\S]*?)\]\s*\]/.exec(text);
  if (!match) return [];
  return (match[1] + ']').replace(/[[\]]/g, ' ').trim().split(/\s+/).map(Number);
}

describe('coverAllGlyphWidths', () => {
  it('lists an advance for every glyph in the face, not only the cmap-reachable ones', async () => {
    const bytes = readFileSync(FONT_PATH);
    const face = fontkit.create(bytes);

    const plainDoc = await PDFDocument.create();
    plainDoc.registerFontkit(fontkit);
    const plain = await plainDoc.embedFont(bytes, { subset: false });
    plainDoc.addPage().drawText('fi fl', { font: plain, size: 12 });
    const plainWidths = widthsArray(await plainDoc.save({ useObjectStreams: false }));

    const fixedDoc = await PDFDocument.create();
    fixedDoc.registerFontkit(fontkit);
    const fixed = await fixedDoc.embedFont(bytes, { subset: false });
    coverAllGlyphWidths(fixed);
    fixedDoc.addPage().drawText('fi fl', { font: fixed, size: 12 });
    const fixedWidths = widthsArray(await fixedDoc.save({ useObjectStreams: false }));

    // `[0 [w0 w1 … w(n-1)]]`: the leading CID plus one width per glyph.
    expect(fixedWidths[0]).toBe(0);
    expect(fixedWidths.length).toBe(face.numGlyphs + 1);
    // pdf-lib's own table stops at the glyphs the cmap can reach.
    expect(plainWidths.length).toBeLessThan(fixedWidths.length);
    // Widths are in 1000-unit glyph space.
    const space = face.glyphForCodePoint(0x20);
    expect(fixedWidths[1 + space.id]).toBeCloseTo(space.advanceWidth * 1000 / face.unitsPerEm, 6);
  });
});
