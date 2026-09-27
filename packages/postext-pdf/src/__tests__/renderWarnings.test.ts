import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, TableCell } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend';
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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const table: Resource = {
  id: 'parts',
  typeId: 'table',
  kind: 'table',
  caption: 'Parts.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Part', { isHeader: true }), cell('Qty', { isHeader: true })],
        ...Array.from({ length: 4 }, (_, i) => [cell(`Part ${i + 1}`), cell(String(i + 2))]),
      ],
    },
  },
  placement: { position: 'here' },
};

const photo: Resource = {
  id: 'photo',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A photo.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'file-photo', format: 'png', width: 400, height: 300 },
  placement: { position: 'here' },
};

async function pageText(bytes: Uint8Array, index = 0): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
}

/** Non-stroking RGB fills set on a page (`r g b rg`). */
const fills = (text: string): string[] => [...text.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].map((m) => m.slice(1, 4).map((v) => Number(v).toFixed(3)).join(' '));

describe('zebra rows in the PDF', () => {
  it('fills the alternate body rows, and only when enabled', async () => {
    const md = '::resource{id="parts"}\n';
    const zebra: PostextConfig = { ...PAGE, tableStyle: { bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: hex('#eef3fa') } };
    const stripe = [0xee, 0xf3, 0xfa].map((v) => (v / 255).toFixed(3)).join(' ');
    const on = fills(await pageText(await renderToPdf(buildDocument({ markdown: md, resources: [table] }, zebra), { fontProvider })));
    const off = fills(await pageText(await renderToPdf(buildDocument({ markdown: md, resources: [table] }, PAGE), { fontProvider })));
    // Body rows 2 and 4 × two columns.
    expect(on.filter((f) => f === stripe)).toHaveLength(4);
    expect(off).not.toContain(stripe);
  }, 60_000);
});

describe('render warnings in the PDF', () => {
  it('reports an image with no bytes once, with its document and page', async () => {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="photo"}\n\nMore :ref{id="photo"}.\n', resources: [photo] }, PAGE);
    const warnings: PdfWarning[] = [];
    await renderToPdf([doc, doc], { fontProvider, onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([{ kind: 'missingImage', fileId: 'file-photo', resourceId: 'photo', pageIndex: 0, documentIndex: 0 }]);
  }, 60_000);
});
