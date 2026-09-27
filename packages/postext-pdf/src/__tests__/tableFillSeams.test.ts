import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, TableCell } from 'postext';
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

const HEADER = '#dbe4f3';
const BODY = '#eef3fa';

// EF-64. A viewer anti-aliases each fill on its own, so two filled cells
// meeting on a fraction of a device pixel leave a faint seam. Each opaque
// fill runs across the edges it shares with the cells painted after it, in
// the same fill operation (the strips: `tableCellFillRects` in postext).
describe('table cell fills in a rendered PDF (EF-64)', () => {
  const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const hex = (h: string) => ({ hex: h, model: 'hex' as const });
  const config: PostextConfig = {
    page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
    tableStyle: { borderWidth: pt(0), headerBackground: hex(HEADER), bodyBackgroundEnabled: true, bodyBackground: hex(BODY) },
  };
  const resource: Resource = {
    id: 't', typeId: 'table', kind: 'table', caption: 'Fills.', createdAt: 0, updatedAt: 0,
    table: {
      model: {
        headerRowCount: 1,
        rows: [
          [cell('Name', { isHeader: true }), cell('Value', { isHeader: true }), cell('Unit', { isHeader: true })],
          ...Array.from({ length: 5 }, (_, i) => [cell(`Row ${i + 1}`), cell(String(i * 3.7)), cell('m')]),
        ],
      },
    },
    placement: { position: 'here' },
  };
  let content = '';
  beforeAll(async () => {
    const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [resource] }, config);
    const bytes = await renderToPdf(doc, { fontProvider });
    const pdf = await PDFDocument.load(bytes);
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    content = streams
      .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
      .join('\n');
  }, 60_000);

  it('fills each cell once, with its strips in the same fill', () => {
    const fills = [...content.matchAll(/((?:-?[\d.]+ ){4}re\s+)+f\b/g)].map((m) => (m[0].match(/\bre\b/g) ?? []).length);
    // 18 filled cells; all but the last have a neighbour painted after them.
    const multi = fills.filter((n) => n > 1);
    expect(multi).toHaveLength(17);
    expect(content).toMatch(/\bq\b/);
    expect((content.match(/\bq\b/g) ?? []).length).toBe((content.match(/\bQ\b/g) ?? []).length);
  });
});
