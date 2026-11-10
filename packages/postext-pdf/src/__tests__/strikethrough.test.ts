import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';

// Struck-through text (`~~…~~`) in the PDF: the line is drawn from the
// layout (`VDTLine.marks`, `VDTChip.strikes`) as a layout artifact, and the
// struck words stay real text, extracted and read as they are.

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
  page: { width: pt(260), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  bodyText: { textAlign: 'left' },
};

const resources: Resource[] = [{
  id: 'prices',
  typeId: 'table',
  kind: 'table',
  caption: 'Price list.',
  createdAt: 0,
  updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[{ content: 'Item', isHeader: true }, { content: 'Price', isHeader: true }], [{ content: 'Widget A' }, { content: '~~€ 165~~ € 129' }]] } },
  placement: { position: 'here' },
}];

const markdown = [
  'Widget A now costs € 129 instead of ~~€ 165,–~~ and :chip[~~Service fee~~] is included.',
  '',
  '::resource{id="prices"}',
].join('\n');

let doc: VDTDocument;
let pdf: PDFDocument;
let bytes: Uint8Array;

function pageContent(index: number): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

beforeAll(async () => {
  doc = buildDocument({ markdown, resources, metadata: { title: 'Strikethrough' } }, config);
  bytes = await renderToPdf(doc, { fontProvider, accessible: true });
  if (process.env.POSTEXT_PDF_OUT) fs.writeFileSync(process.env.POSTEXT_PDF_OUT, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('strikethrough in the PDF', () => {
  it('lays out a line through the body text, the table cell and the chip', () => {
    const lines = doc.blocks.flatMap((b) => b.lines);
    expect(lines.some((l) => l.marks?.some((m) => m.kind === 'line'))).toBe(true);
    const table = doc.blocks.find((b) => b.resourceBlock?.table)!.resourceBlock!.table!;
    expect(table.cells.flatMap((c) => c.lines).some((l) => l.marks?.some((m) => m.kind === 'line'))).toBe(true);
    expect(lines.flatMap((l) => l.segments ?? []).some((s) => s.chip?.strikes?.length === 1)).toBe(true);
  });

  it('draws the lines as layout artifacts, with balanced graphics state', () => {
    const content = pageContent(0);
    expect(content).toMatch(/\/Artifact <<\n\/Type \/Layout\n>> BDC/);
    // Straight strokes: a move and a line, stroked.
    expect(/ m\n[\d.\- ]+ l\nS\n/.test(content)).toBe(true);
    expect((content.match(/\bq\b/g) ?? []).length).toBe((content.match(/\bQ\b/g) ?? []).length);
    expect((content.match(/\b(BDC|BMC)\n/g) ?? []).length).toBe((content.match(/\bEMC\n/g) ?? []).length);
  });

  it.skipIf(!hasPdftotext)('keeps the struck words as extractable text', () => {
    const file = path.join(os.tmpdir(), `postext-strike-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
    fs.unlinkSync(file);
    expect(text).toContain('instead of € 165,– and');
    expect(text).toContain('Service fee');
    expect(text).not.toContain('~~');
  });
});
