import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
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

// Issue #124: word banks, keys and tags in a narrow column — body text, a
// list, a callout and a table cell.
const config: PostextConfig = {
  page: { width: pt(220), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  locale: 'es',
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  bodyText: { textAlign: 'justify' },
  chipStyles: [
    { id: 'chip' },
    { id: 'key', background: hex('#fff4d6'), borderColor: hex('#8a6d1f'), borderRadius: pt(2), bold: true },
  ],
};

const resources: Resource[] = [{
  id: 'bank',
  typeId: 'table',
  kind: 'table',
  caption: 'Banco de palabras.',
  createdAt: 0,
  updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[{ content: 'Palabras', isHeader: true }], [{ content: ':chip[bombilla] :chip[motor]' }]] } },
  placement: { position: 'here' },
}];

const markdown = [
  'Clasifica: :chip[pila] :chip[cable] :chip[interruptor] y pulsa :chip[Ctrl]{style="key"} + :chip[C]{style="key"} para copiar el texto de la actividad.',
  '',
  '- Material: :chip[madera] :chip[vidrio]',
  '',
  ':::callout',
  'Recuerda: :chip[conductor] frente a :chip[aislante].',
  ':::',
  '',
  '::resource{id="bank"}',
].join('\n');

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
  const doc = buildDocument({ markdown, resources, metadata: { title: 'Chips' } }, config);
  bytes = await renderToPdf(doc, { fontProvider });
  // POSTEXT_PDF_OUT=/path/out.pdf keeps the file for a visual check.
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

describe('inline chips in the PDF', () => {
  it('paints the boxes as layout artifacts with balanced graphics state', () => {
    const content = pageContent(0);
    expect(content).toMatch(/\/Artifact <<\n\/Type \/Layout\n>> BDC/);
    // Rounded fills (`f`) and outlines (`S`) built from Bézier corners.
    expect(/ c\n/.test(content)).toBe(true);
    expect(/\bf\n/.test(content)).toBe(true);
    expect((content.match(/\bq\b/g) ?? []).length).toBe((content.match(/\bQ\b/g) ?? []).length);
    const opens = (content.match(/\b(BDC|BMC)\n/g) ?? []).length;
    const closes = (content.match(/\bEMC\n/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it.skipIf(!hasPdftotext)('keeps the chip words as extractable text in reading order', () => {
    const file = path.join(os.tmpdir(), `postext-chips-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
    fs.unlinkSync(file);
    for (const word of ['pila', 'cable', 'interruptor', 'Ctrl', 'madera', 'vidrio', 'conductor', 'aislante', 'bombilla', 'motor']) {
      expect(text).toContain(word);
    }
    expect(text).toMatch(/pila cable interruptor/);
  });
});
