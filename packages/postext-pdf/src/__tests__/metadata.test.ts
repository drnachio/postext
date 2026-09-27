import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { DocumentMetadata, PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(220), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

// EF-11: YAML frontmatter is typed — `title: 1984` is a number. The PDF
// title and author must still be set (and the render must not throw).
describe('PDF metadata from typed frontmatter', () => {
  it('sets the title and author of numeric frontmatter values', async () => {
    const doc = buildDocument({ markdown: '---\ntitle: 1984\nauthor: 2001\n---\n\n# One\n\nText.' }, config);
    for (const accessible of [true, false]) {
      const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
      expect(pdf.getTitle()).toBe('1984');
      expect(pdf.getAuthor()).toBe('2001');
    }
  });

  it('coerces a non-string title handed straight to the renderer', async () => {
    const doc = buildDocument({ markdown: '# One\n\nText.' }, config);
    const raw: VDTDocument = { ...doc, metadata: { title: 1984, author: ['Ana', 'Luis'] } as unknown as DocumentMetadata };
    const pdf = await PDFDocument.load(await renderToPdf(raw, { fontProvider }));
    expect(pdf.getTitle()).toBe('1984');
    expect(pdf.getAuthor()).toBe('Ana, Luis');
    // An object has no text form: the first heading titles the PDF instead.
    const odd: VDTDocument = { ...doc, metadata: { title: { a: 1 } } as unknown as DocumentMetadata };
    expect((await PDFDocument.load(await renderToPdf(odd, { fontProvider }))).getTitle()).toBe('One');
  });
});
