import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

const config: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  colorPalette: [{ id: 'ok', name: 'Compatible', value: { hex: '#c1dfd6', model: 'hex' } }],
};

const table: Resource = {
  id: 'tab',
  typeId: 'table',
  kind: 'table',
  caption: 'Services and benefits.',
  note: ':swatch{color="ok"} compatible; :swatch{color="#e04148"} incompatible. See :ref{id="fig"}.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Service', { isHeader: true }), cell('Grade I', { isHeader: true }), cell('Grade II', { isHeader: true })],
        [cell('Home care'), cell('Yes', { background: { hex: '#000000', model: 'hex', paletteId: 'ok' } }), cell('No', { background: { hex: '#e04148', model: 'hex' } })],
        [cell('Day centre'), cell('See :ref{id="fig"}'), cell('Yes')],
      ],
    },
  },
  placement: { rotate: 'ccw' },
};
const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A picture.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'missing', format: 'png', width: 200, height: 100 },
};

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances.`).join('\n\n');
const markdown = `Intro :ref{id="tab"} and :ref{id="fig"} text.\n\n${filler(12)}`;

let pdf: PDFDocument;
let doc: ReturnType<typeof buildDocument>;
let bytes: Uint8Array;

beforeAll(async () => {
  doc = buildDocument({ markdown, resources: [table, figure] }, config);
  bytes = await renderToPdf(doc, { fontProvider });
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('a rotated table in the PDF', () => {
  it('is placed turned on a page of its own', () => {
    const placed = doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === 'tab').map((b) => ({ page: p, block: b })));
    expect(placed).toHaveLength(1);
    expect(placed[0]!.block.resourceBlock!.rotation?.direction).toBe('ccw');
  });

  it('draws the block through a quarter-turn matrix', () => {
    const { page } = doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === 'tab').map(() => ({ page: p })))[0]!;
    const pdfPage = pdf.getPage(page.index);
    const contents = pdfPage.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((r) => pdf.context.lookup(r))
      : [contents];
    const text = streams
      .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
      .join('\n');
    // `0 1 -1 0 e f cm`: the counter-clockwise turn.
    expect(/(^|\s)0 1 -1 0 [-\d.]+ [-\d.]+ cm/.test(text)).toBe(true);
    // Balanced graphics state around it.
    expect((text.match(/\bq\b/g) ?? []).length).toBe((text.match(/\bQ\b/g) ?? []).length);
  });

  it('turns the link annotation of a ref inside a cell with the block', () => {
    const { page, block } = doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === 'tab').map((b) => ({ page: p, block: b })))[0]!;
    const pdfPage = pdf.getPage(page.index);
    const annots = (pdfPage.node.Annots()?.asArray() ?? []).map((r) => pdf.context.lookup(r, PDFDict));
    const links = annots.filter((a) => a.get(PDFName.of('Subtype')) === PDFName.of('Link'));
    expect(links.length).toBeGreaterThanOrEqual(2); // the cell ref and the note ref
    const scale = 72 / doc.config.page.dpi;
    const h = pdfPage.getHeight();
    for (const link of links) {
      const rect = link.lookup(PDFName.of('Rect'), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
      const [x1, y1, x2, y2] = rect as [number, number, number, number];
      // Inside the band the block takes, in page space.
      expect(x1).toBeGreaterThanOrEqual(block.bbox.x * scale - 0.5);
      expect(x2).toBeLessThanOrEqual((block.bbox.x + block.bbox.width) * scale + 0.5);
      expect(y1).toBeGreaterThanOrEqual(h - (block.bbox.y + block.bbox.height) * scale - 0.5);
      expect(y2).toBeLessThanOrEqual(h - block.bbox.y * scale + 0.5);
      // A turned label: taller than wide.
      expect(y2 - y1).toBeGreaterThan(x2 - x1);
    }
  });
});
