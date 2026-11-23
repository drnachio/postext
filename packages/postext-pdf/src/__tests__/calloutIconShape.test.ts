import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { fontPx } from './fontPx.js';

// #1120: a ring drawn as a box's icon and a dot on its label tab are
// painted as vector fills in the PDF: the ring even-odd, the dot plain.

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const CONFIG: PostextConfig = {
  page: { width: pt(240), height: pt(300), dpi: 72, margins: { top: pt(30), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{
    id: 'n',
    title: '',
    icon: { kind: 'shape', shape: 'ring', size: pt(12), color: hex('#0099cc') },
    label: { fontFamily: 'Lora', fontSize: pt(9), height: pt(14), color: hex('#000000'), background: hex('#ffffff'), position: 'top-left', icon: { kind: 'shape', shape: 'dot', placement: 'inside', color: hex('#cc3300') } },
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

describe('drawn icons in the PDF (#1120)', () => {
  it('fills the ring even-odd in its colour and the dot plainly', async () => {
    const doc = buildDocument({ markdown: ':::callout{type="n" label="Key"}\nOne line.\n:::' }, CONFIG);
    const content = await contentOf(doc);
    // #0099cc and #cc3300 as rgb fills.
    expect(content).toMatch(/0 0\.6 0\.8 rg[\s\S]*?f\*/);
    expect(content).toMatch(/0\.8 0\.2 0 rg[\s\S]*?\bf\b/);
  }, 60_000);
});
