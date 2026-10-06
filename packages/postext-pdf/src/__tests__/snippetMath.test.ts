import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, initMathEngine } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #541: inline maths in a table cell and a caption is set as vector paths,
// as in the text.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

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
const config: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
};
const table: Resource = {
  id: 't', typeId: 'table', kind: 'table', caption: 'Fits of $\\chi^2$.', createdAt: 0, updatedAt: 0,
  placement: { position: 'here' },
  table: { model: { rows: [[{ content: 'Mass' }, { content: '$36^{+5}_{-4}\\,M_\\odot$', align: 'right' }]] } },
};

const pageStream = (pdf: PDFDocument): string => {
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
};

const fills = async (math: boolean): Promise<number> => {
  const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="t"}\n', resources: [table] }, { ...config, math: { enabled: math } });
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
  return (pageStream(pdf).match(/\bf\n/g) ?? []).length;
};

beforeAll(async () => {
  await initMathEngine();
}, 60_000);

describe('maths in captions and cells in the PDF (#541)', () => {
  it('fills the formulas\' glyph paths', async () => {
    const withMaths = await fills(true);
    const asText = await fills(false);
    // χ, 2 in the caption; 3, 6, +, 5, −, 4, M, ⊙ in the cell: one fill each.
    expect(withMaths - asText).toBeGreaterThanOrEqual(10);
  }, 60_000);
});
