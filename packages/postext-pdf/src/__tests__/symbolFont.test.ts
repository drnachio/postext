import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';

// The symbol font (`symbolFont`): a character the text face has
// no glyph for is drawn from the symbol font instead of as an empty box;
// one neither has is still reported missing.

const garamond = fs.readFileSync(new URL('../../../postext-cli/fonts/EBGaramond-400.ttf', import.meta.url));
const openSans = fs.readFileSync(new URL('../../../postext-cli/fonts/OpenSans-400.ttf', import.meta.url));
const asked: string[] = [];
const fontProvider = async (family: string) => {
  asked.push(family);
  if (family === 'EB Garamond') return new Uint8Array(garamond);
  if (family === 'Open Sans') return new Uint8Array(openSans);
  throw new Error(`no ${family}`);
};
const face = fontkit.create(garamond);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (symbolFont?: string): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(40), bottom: pt(30), left: pt(30), right: pt(30) } },
  locale: 'es',
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'EB Garamond', fontSize: pt(10), lineHeight: pt(14) },
  ...(symbolFont ? { symbolFont } : {}),
});

/** The base fonts the PDF embeds. */
function fontNames(pdf: PDFDocument): string[] {
  const out: string[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font') && obj.get(PDFName.of('Subtype')) === PDFName.of('Type0')) {
      out.push(String(obj.get(PDFName.of('BaseFont'))));
    }
  }
  return out;
}

async function render(symbolFont?: string): Promise<{ fonts: string[]; warnings: PdfWarning[] }> {
  const doc = buildDocument({ markdown: 'La alternativa incluye א; obsérvese que A ∪ א = U.' }, config(symbolFont));
  const warnings: PdfWarning[] = [];
  const bytes = await renderToPdf(doc, { fontProvider, onWarning: (w) => warnings.push(w) });
  return { fonts: fontNames(await PDFDocument.load(bytes)), warnings };
}

const missing = (warnings: PdfWarning[]) => warnings.flatMap((w) => (w.kind === 'missingGlyph' ? w.characters : []));

describe('the symbol font in the PDF', () => {
  it('prints what the text face lacks as missing without one', async () => {
    const { fonts, warnings } = await render();
    expect(fonts.some((f) => /OpenSans/.test(f))).toBe(false);
    expect(missing(warnings).sort()).toEqual(['א', '∪'].sort());
  });

  it('draws it from the symbol font, and reports only what neither has', async () => {
    const { fonts, warnings } = await render('Open Sans');
    expect(asked).toContain('Open Sans');
    expect(fonts.some((f) => /OpenSans/.test(f))).toBe(true);
    expect(fonts.some((f) => /EBGaramond/.test(f))).toBe(true);
    // Open Sans has the alef and no union sign.
    expect(missing(warnings)).toEqual(['∪']);
  });
});
