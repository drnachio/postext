import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, TableCell, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #634: an inline table cut across columns and pages. Its slices share one
// `Table` element in the tagged PDF (the repeated header rows and the
// suffixed caption of a continuation are artifacts), as a floated table's.

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
const resources: Resource[] = [{
  id: 'sowing', typeId: 'table', kind: 'table', caption: 'Sowing dates.', note: 'Dates for a mild winter.', altText: 'Sowing dates by crop',
  createdAt: 0, updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Crop', { isHeader: true }), cell('Sow', { isHeader: true })],
        ...Array.from({ length: 50 }, (_, i) => [cell(`Crop ${i + 1}`), cell(`Week ${(i % 52) + 1}`)]),
      ],
    },
  },
  placement: { position: 'here' },
}];
const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const markdown = ['# Sowing', '', `${words(80, 'before')}.`, '', '::resource{id="sowing"}', '', `${words(60, 'after')}.`].join('\n');

const config: PostextConfig = {
  page: { width: pt(360), height: pt(420), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  layout: { layoutType: 'double', gutterWidth: pt(12) },
  locale: 'en-us',
  header: { elements: [] },
  footer: { elements: [] },
};

interface Elem { type: string; kids: Elem[] }
function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [] };
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
  }
  return elem;
}
const count = (e: Elem, type: string): number => (e.type === type ? 1 : 0) + e.kids.reduce((n, k) => n + count(k, type), 0);

const hasVerapdf = process.env.VERAPDF === '1' && spawnSync('verapdf', ['--version'], { encoding: 'utf8' }).status === 0;

let doc: VDTDocument;
let bytes: Uint8Array;

beforeAll(async () => {
  doc = buildDocument({ markdown, resources, metadata: { title: 'Sowing' } }, config);
  bytes = await renderToPdf(doc, { fontProvider });
}, 60_000);

describe('a split inline table in the PDF (#634)', () => {
  it('is cut into several slices in the flow', () => {
    const slices = doc.blocks.filter((b) => b.type === 'resource' && b.resourceBlock?.resource.id === 'sowing');
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.every((b) => b.resourceBlock!.slice !== undefined)).toBe(true);
  });

  it('tags one Table with one header row and every body row once', async () => {
    const pdf = await PDFDocument.load(bytes);
    const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
    const root = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
    expect(count(root, 'Table')).toBe(1);
    expect(count(root, 'TR')).toBe(51);
    expect(count(root, 'TH')).toBe(2);
    expect(count(root, 'Caption')).toBe(1);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', () => {
    const file = path.join(os.tmpdir(), `postext-inline-table-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
