import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { fontPx } from './fontPx.js';

// #1098: a box title with negative tracking is painted with that tracking
// (the character spacing of its text object).

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(fontPx(this.font)?.[1] ?? '10');
    return { width: s.length * 0.5 * size };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  page: { width: pt(200), height: pt(300), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{
    id: 'n',
    titleStyle: { fontFamily: 'Lora', fontSize: pt(20), letterSpacing: { value: -0.02, unit: 'em' } },
  }],
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

describe('negative box title tracking in the PDF (#1098)', () => {
  it('sets the title with the negative character spacing it was measured with', async () => {
    const doc = buildDocument({ markdown: ':::callout{type="n" title="Tight"}\nOne line.\n:::' }, CONFIG);
    const set = [...(await contentOf(doc)).matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1])).filter((v) => v !== 0);
    expect(set.length).toBeGreaterThan(0);
    // -0.4 px at 72 dpi is -0.4 pt of character spacing.
    for (const v of set) expect(v).toBeCloseTo(-0.4, 3);
  }, 60_000);
});
