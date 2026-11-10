import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';

// Character styles (`[…]|id|`) in the PDF: the highlighter band behind the
// text, translucent in a digital PDF, a tint with no transparency in a
// print one.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const yellow: ColorValue = { hex: '#ffe14d', model: 'hex' };

function config(color: ColorValue): PostextConfig {
  return {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora' },
    header: { elements: [] },
    footer: { elements: [] },
    characterStyles: [{ id: 'm', highlight: { enabled: true, color, opacity: 50 } }],
  };
}

function streamText(pdf: PDFDocument, obj: PDFObject | undefined): string {
  const s = obj instanceof PDFStream ? obj : obj ? pdf.context.lookup(obj) : undefined;
  return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
}

async function render(color: ColorValue, print?: PrintConfig) {
  const doc = buildDocument({ markdown: 'Un [texto marcado]|m| en la página.' }, config(color));
  const bytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    ...(print ? { print } : {}),
  });
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs.map((r) => streamText(pdf, r)).join('\n');
  const states = page.node.Resources()?.lookup(PDFName.of('ExtGState'));
  const alphas = states instanceof PDFDict
    ? [...states.entries()].map(([, ref]) => (pdf.context.lookup(ref) as PDFDict).lookup(PDFName.of('ca'))?.toString()).filter(Boolean)
    : [];
  return { pdf, page, content, alphas };
}

describe('character styles in the PDF', () => {
  it('paints the band before the text, translucent in a digital PDF', async () => {
    const { content, alphas } = await render(yellow);
    // The band's translucent fill (the page's background comes first).
    const fill = content.search(/\/GS\S+ gs\n[\d. ]+ rg\n/);
    const text = content.indexOf('BT');
    expect(fill).toBeGreaterThan(0);
    expect(fill).toBeLessThan(text);
    // The opacity travels as the colour's alpha byte: 128/255.
    expect(alphas.map(Number).some((a) => Math.abs(a - 0.5) < 0.01)).toBe(true);
  });

  it('sets the band as a tint with no transparency in a print PDF', async () => {
    const { alphas } = await render(yellow, { standard: 'pdfx4' });
    expect(alphas.filter((a) => a !== '1')).toEqual([]);
  });
});
