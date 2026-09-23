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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

// The activity-book looks of issue #123: a navy grid with a rounded frame,
// an outer-only option box and a split table with rounded ends.
const config: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  tableStyle: {
    borderColor: hex('#163a76'),
    borderWidth: pt(1.3),
    borderRadius: pt(10),
    headerBackground: hex('#dbe4f3'),
  },
  tableStyles: [
    { id: 'option', rules: 'outer', borderColor: hex('#7a9cc6'), borderWidth: pt(1), borderRadius: pt(8), headerBackgroundEnabled: false, bodyBackgroundEnabled: true, bodyBackground: hex('#eef3fa') },
    { id: 'rows', rules: 'horizontal', borderRadius: pt(6), bodyBackgroundEnabled: true, bodyBackground: hex('#f6efe2') },
  ],
};

const tableOf = (id: string, rows: number, styleId?: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: `Table ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Objective', { isHeader: true }), cell('Done', { isHeader: true })],
        ...Array.from({ length: rows }, (_, i) => [cell(`Objective ${i + 1}`), cell(i % 2 ? 'Yes' : 'No')]),
      ],
    },
    ...(styleId ? { styleId } : {}),
  },
  placement: { span: 'page' },
  ...extra,
});

const resources = [
  tableOf('checklist', 3),
  tableOf('option', 2, 'option'),
  tableOf('rows', 3, 'rows'),
  tableOf('long', 40),
  tableOf('turned', 3, 'option', { placement: { rotate: 'ccw' } }),
];
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances.`).join('\n\n');
const markdown = `See ${resources.map((r) => `:ref{id="${r.id}"}`).join(', ')}.\n\n${filler(30)}`;

let doc: ReturnType<typeof buildDocument>;
let pdf: PDFDocument;

const pageText = (index: number): string => {
  const contents = pdf.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
};

beforeAll(async () => {
  doc = buildDocument({ markdown, resources }, config);
  const bytes = await renderToPdf(doc, { fontProvider });
  // POSTEXT_PDF_OUT=/path/out.pdf keeps the file for a visual check.
  if (process.env.POSTEXT_PDF_OUT) fs.writeFileSync(process.env.POSTEXT_PDF_OUT, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('rounded table frames in the PDF', () => {
  it('clips to and strokes a curved outline, with balanced graphics state', () => {
    const pages = [...new Set(doc.pages.filter((p) => (p.floats ?? []).some((b) => b.resourceBlock?.table?.frameRadii)).map((p) => p.index))];
    expect(pages.length).toBeGreaterThan(0);
    for (const index of pages) {
      const text = pageText(index);
      // Bézier corners, a clip (`W n`) and a stroked path (`S`).
      expect(/ c\n/.test(text)).toBe(true);
      expect(/\bW\s+n\b/.test(text)).toBe(true);
      expect(/\bS\b/.test(text)).toBe(true);
      expect((text.match(/\bq\b/g) ?? []).length).toBe((text.match(/\bQ\b/g) ?? []).length);
    }
  });

  it('rounds only the outer ends of the split table', () => {
    const slices = doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === 'long'));
    expect(slices.length).toBeGreaterThan(1);
    const radii = slices.map((b) => b.resourceBlock!.table!.frameRadii);
    expect(radii[0]![0]).toBeGreaterThan(0);
    expect(radii[0]![2]).toBe(0);
    expect(radii[radii.length - 1]![0]).toBe(0);
    expect(radii[radii.length - 1]![2]).toBeGreaterThan(0);
  });
});
