import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A right-bound book (#189) tells PDF viewers to lay its spreads out right
// to left, page 1 alone; a vertical page (#188) paints its flow through the
// page's quarter-turn frame.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const HLM = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。';
const config = (extra: PostextConfig = {}): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30), mirror: true } },
  bodyText: { fontFamily: 'Lora', fontSize: pt(16), lineHeight: pt(24), hyphenation: { enabled: false } },
  ...extra,
});

async function catalogOf(doc: ReturnType<typeof buildDocument>, accessible: boolean) {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible }));
  return pdf.catalog;
}

describe('right-bound books in the PDF', () => {
  it('writes /Direction /R2L and /PageLayout /TwoPageRight, tagged or not', async () => {
    const doc = buildDocument({ markdown: HLM }, config({ page: { ...config().page, binding: 'right' } }));
    expect(doc.binding).toBe('right');
    for (const accessible of [false, true]) {
      const catalog = await catalogOf(doc, accessible);
      const prefs = catalog.lookup(PDFName.of('ViewerPreferences'), PDFDict);
      expect(prefs.get(PDFName.of('Direction'))).toBe(PDFName.of('R2L'));
      expect(catalog.get(PDFName.of('PageLayout'))).toBe(PDFName.of('TwoPageRight'));
    }
  });

  it('leaves a left-bound book without either', async () => {
    const doc = buildDocument({ markdown: HLM }, config());
    const catalog = await catalogOf(doc, false);
    expect(catalog.get(PDFName.of('ViewerPreferences'))).toBeUndefined();
    expect(catalog.get(PDFName.of('PageLayout'))).toBeUndefined();
  });
});

describe('vertical pages in the PDF', () => {
  it('renders a vertical chapter with a figure, the flow drawn through the quarter-turn frame', async () => {
    const doc = buildDocument(
      {
        markdown: `# 第一回\n\n${HLM}見圖:ref{id="f1"}。\n\n${HLM}\n\n${HLM}`,
        resources: [{ id: 'f1', typeId: 'figure', kind: 'bitmap', caption: '石頭', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 } }],
      },
      config({ layout: { writingMode: 'vertical-rl' } }),
    );
    expect(doc.binding).toBe('right');
    const bytes = await renderToPdf(doc, { fontProvider, accessible: true });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(doc.pages.length);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(300);
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const ops = refs
      .map((ref) => {
        const s = pdf.context.lookup(ref);
        return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
      })
      .join('\n');
    // cm 0 -1 1 0 (W − H) H: the flow frame.
    expect(ops).toMatch(/0 -1 1 0 -120 420 cm/);
  });
});
