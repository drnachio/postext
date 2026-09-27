import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
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

// EF-13: a CSS font stack in a `fontFamily` sets the text in its first
// family — the PDF asks the provider for that family, the same one canvas
// and HTML measure and paint with.
describe('font stack in fontFamily', () => {
  it('asks the font provider for the first family of the stack only', async () => {
    const asked = new Set<string>();
    const fontProvider = async (family: string) => {
      asked.add(family);
      if (family.includes(',')) throw new Error(`no font ${family}`);
      return new Uint8Array(fontBytes);
    };
    const config: PostextConfig = {
      page: { width: pt(220), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      bodyText: { fontFamily: "'Lora', Georgia, serif" },
      headings: { fontFamily: 'Lora, serif', levels: [{ level: 1, breakBefore: { enabled: false } }] },
      orderedLists: { fontFamily: 'Lora,serif' },
    };
    const doc = buildDocument({ markdown: '# Title\n\nSome **bold** and *italic* text.\n\n1. one' }, config);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(pdf.getPageCount()).toBe(1);
    expect([...asked].filter((f) => f.includes('Lora'))).toEqual(['Lora']);
  });
});
