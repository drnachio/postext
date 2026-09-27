import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// EF-58: a contents entry's number is drawn on the title's baseline, not
// centred on the x-height like a list bullet.

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
  page: { dpi: 72, width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' }, numberingTemplate: '{1}' }] },
  headingStyles: [{ id: 'front', numbered: false, toc: false }],
  toc: { levels: [{ level: 1, fontFamily: 'Lora', numberFontFamily: 'Lora', numberFontSize: pt(15), fontSize: pt(11) }] },
};

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

describe('contents numbers in the PDF (EF-58)', () => {
  it('draws the number on the title line\'s baseline', async () => {
    const doc = buildDocument({ markdown: '# Contents {style="front"}\n\n:::toc\n\n# First\n\nText.' }, config);
    const entry = doc.blocks.find((b) => b.tocEntry !== undefined && b.bulletText === '1')!;
    expect(entry.bulletBaselineY).toBeCloseTo(entry.lines[0]!.baseline, 6);
    const content = await contentOf(doc);
    const baselineY = doc.pages[0]!.height - entry.lines[0]!.baseline; // 72 dpi: px = pt
    const xs = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)]
      .filter((m) => Math.abs(Number(m[1]) - entry.bulletOffsetX!) < 0.01)
      .map((m) => Number(m[2]));
    expect(xs.length).toBeGreaterThan(0);
    expect(xs[0]).toBeCloseTo(baselineY, 2);
  }, 60_000);

  it('a VDT without bulletBaselineY (a list bullet, an older engine) is centred on bulletY', async () => {
    const doc = buildDocument({ markdown: '# Contents {style="front"}\n\n:::toc\n\n# First\n\nText.' }, config);
    const entry = doc.blocks.find((b) => b.tocEntry !== undefined && b.bulletText === '1')!;
    delete entry.bulletBaselineY;
    const size = parseFontString(entry.bulletFontString!)!.sizePx;
    const content = await contentOf(doc);
    const ys = [...content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)]
      .filter((m) => Math.abs(Number(m[1]) - entry.bulletOffsetX!) < 0.01)
      .map((m) => Number(m[2]));
    expect(ys.length).toBeGreaterThan(0);
    expect(ys[0]).toBeCloseTo(doc.pages[0]!.height - (entry.bulletY! + size * 0.3), 2);
  }, 60_000);
});
