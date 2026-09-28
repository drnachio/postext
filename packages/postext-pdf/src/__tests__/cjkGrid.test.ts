import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// The character grid (`cjk.grid.show`, #187) is a screen aid: a PDF draws
// it only when the render asks for it.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? 10.5 : 5.25;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'zh-Hans',
  page: { width: mm(140), height: mm(203), dpi: 72, margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10.5), lineHeight: pt(16.5), textAlign: 'justify', hyphenation: { enabled: false } },
  cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 28, show: true } },
};

async function contentOf(doc: VDTDocument, characterGrid?: boolean): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false, ...(characterGrid ? { characterGrid } : {}) }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

describe('character grid in the PDF', () => {
  it('is left out unless the render asks for it', async () => {
    const doc = buildDocument({ markdown: '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去。' }, config);
    const moves = (content: string): number => (content.match(/ m\n/g) ?? []).length;
    const plain = await contentOf(doc);
    const drawn = await contentOf(doc, true);
    // 28 rows of 2 edges and 29 cell walls.
    expect(moves(drawn) - moves(plain)).toBe(28 * 31);
  }, 60_000);
});
