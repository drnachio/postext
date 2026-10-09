import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, TableCell, VDTBlock } from 'postext';
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

// A journal table (#625): booktabs rules, a 0.4pt light rule, a head over
// two columns, and a long table split across pages.
const config: PostextConfig = {
  page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  tableStyle: { rules: 'booktabs', bodyFontSize: pt(10), heavyRuleWidth: pt(0.8), lightRuleWidth: pt(0.4), headerBackgroundEnabled: false },
};

const tableOf = (id: string, rows: number): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: `Table ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 2,
      rows: [
        [cell('Model', { isHeader: true, rowSpan: 2 }), cell('Accuracy', { isHeader: true, colSpan: 2 }), cell('', { hiddenBy: { row: 0, col: 1 } })],
        [cell('', { hiddenBy: { row: 0, col: 0 } }), cell('Train', { isHeader: true }), cell('Test', { isHeader: true })],
        ...Array.from({ length: rows }, (_, i) => [cell(`Model ${i + 1}`), cell(`${90 + (i % 9)}.1`), cell(`${80 + (i % 9)}.4`)]),
      ],
    },
  },
  placement: { span: 'page' },
});

const resources = [tableOf('short', 4), tableOf('long', 60)];
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances.`).join('\n\n');
const markdown = `See :ref{id="short"} and :ref{id="long"}.\n\n${filler(30)}`;

let doc: ReturnType<typeof buildDocument>;
let pdf: PDFDocument;

const pageText = (index: number): string => {
  const contents = pdf.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
};

const tableBlocks = (id: string): { page: number; block: VDTBlock }[] =>
  doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]
    .filter((b) => b.resourceBlock?.resource.id === id)
    .map((block) => ({ page: p.index, block })));

beforeAll(async () => {
  doc = buildDocument({ markdown, resources }, config);
  const bytes = await renderToPdf(doc, { fontProvider });
  // POSTEXT_PDF_OUT=/path/out.pdf keeps the file for a visual check.
  if (process.env.POSTEXT_PDF_OUT) fs.writeFileSync(process.env.POSTEXT_PDF_OUT, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

describe('booktabs tables in the PDF', () => {
  it('strokes every layout stroke at its own width, fractional ones included', () => {
    const [{ page, block }] = tableBlocks('short');
    const strokes = block!.resourceBlock!.table!.strokes!;
    // Top, span rule, header rule, bottom.
    expect(strokes).toHaveLength(4);
    const text = pageText(page!);
    const widths = [...text.matchAll(/([\d.]+) w\b/g)].map((m) => Number(m[1]));
    expect(widths).toContainEqual(0.8);
    expect(widths).toContainEqual(0.4);
    expect(widths).toContainEqual(0.3);
  });

  it('closes a part that continues with the light rule and the last part with the heavy one', () => {
    const parts = tableBlocks('long');
    expect(parts.length).toBeGreaterThan(1);
    // In px at the page dpi: compare against the short table's heavy rule.
    const heavy = tableBlocks('short')[0]!.block.resourceBlock!.table!.strokes![0]!.widthPx;
    const scale = 0.8 / heavy;
    for (const [i, { block }] of parts.entries()) {
      const s = block.resourceBlock!.table!.strokes!;
      const last = i === parts.length - 1;
      expect(s[0]!.widthPx * scale).toBeCloseTo(0.8, 6);
      expect(s[s.length - 1]!.widthPx * scale).toBeCloseTo(last ? 0.8 : 0.4, 6);
    }
  });
});
