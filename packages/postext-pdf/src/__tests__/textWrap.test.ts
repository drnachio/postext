import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #627: text wrapped round a picture and a box. The lines beside them are
// painted at their own measure; a tagged PDF reads the picture and the box
// where they stand in the text, before the paragraph that runs beside them.

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
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
));
const resources: Resource[] = [{
  id: 'bed', typeId: 'figure', kind: 'bitmap', caption: 'The planting bed.', altText: 'A raised bed', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'x.png', format: 'png', width: 400, height: 300 },
  placement: { position: 'here', wrap: 'right', width: 0.4 },
}];
const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const markdown = [
  '# Beds',
  '',
  `${words(30, 'opening')}.`,
  '',
  '::resource{id="bed"}',
  '',
  `${words(120, 'beside')}.`,
  '',
  ':::callout{wrap="left" width=0.4}',
  'Sow thinly.',
  ':::',
  '',
  `${words(120, 'after')}.`,
].join('\n');

const config: PostextConfig = {
  page: { width: pt(360), height: pt(560), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  layout: { layoutType: 'single' },
  locale: 'en-us',
  header: { elements: [] },
  footer: { elements: [] },
};

interface Elem { type: string; kids: Elem[]; alt?: string }
function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const alt = dict.get(PDFName.of('Alt'));
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [], ...(alt ? { alt: (alt as unknown as { decodeText(): string }).decodeText() } : {}) };
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
  }
  return elem;
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const hasVerapdf = process.env.VERAPDF === '1' && spawnSync('verapdf', ['--version'], { encoding: 'utf8' }).status === 0;

let doc: VDTDocument;
let bytes: Uint8Array;

beforeAll(async () => {
  doc = buildDocument({ markdown, resources, metadata: { title: 'Beds' } }, config);
  bytes = await renderToPdf(doc, { fontProvider, resourceBytes: () => PNG });
}, 60_000);

describe('text wrap in the PDF (#627)', () => {
  it('lays the sample out with both wraps on the first page', () => {
    const col = doc.pages[0]!.columns[0]!;
    expect(col.exclusions?.map((e) => e.side)).toEqual(['right', 'left']);
  });

  it('reads the picture and the box before the paragraphs that run beside them', async () => {
    const pdf = await PDFDocument.load(bytes);
    const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const root = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
    const types = root.kids.map((k) => (k.type === 'Figure' ? `Figure:${k.alt}` : k.type));
    expect(types).toEqual(['H1', 'P', 'Figure:A raised bed', 'P', 'Div', 'P']);
  });

  it.skipIf(!hasPdftotext)('extracts the lines beside the picture in order', () => {
    const file = path.join(os.tmpdir(), `postext-wrap-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    const found = text.match(/beside\d+/g)!.map((w) => Number(w.slice(6)));
    expect(found).toEqual(found.slice().sort((a, b) => a - b));
    expect(found).toHaveLength(120);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', () => {
    const file = path.join(os.tmpdir(), `postext-wrap-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
