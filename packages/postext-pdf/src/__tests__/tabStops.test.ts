import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #622: tab stops with leaders. The leader (dots, or a rule) is painted as
// a layout artifact under an empty `/ActualText`: text extraction reads the
// words on either side of the tab, never the dots.

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
  page: { width: pt(300), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  locale: 'en-us',
  bodyText: { textAlign: 'justify', tabStops: [{ position: 'end', align: 'end', leader: '.' }] },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
};

const has = (cmd: string, arg: string) => spawnSync(cmd, [arg], { encoding: 'utf8' }).status === 0;
const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const hasVerapdf = process.env.VERAPDF === '1' && has('verapdf', '--version');

/** The structure types of the tree, depth first. */
function structTypes(pdf: PDFDocument): string[] {
  const out: string[] = [];
  const visit = (ref: unknown): void => {
    const dict = ref instanceof PDFRef ? pdf.context.lookup(ref) : ref;
    if (dict instanceof PDFArray) {
      for (const kid of dict.asArray()) visit(kid);
      return;
    }
    if (!(dict instanceof PDFDict)) return;
    const s = dict.get(PDFName.of('S'));
    if (s instanceof PDFName) out.push(s.decodeText());
    const k = dict.get(PDFName.of('K'));
    for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) visit(kid);
  };
  const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  visit(root.get(PDFName.of('K')));
  return out;
}

const TEXT = [
  'Soup of the day\t8.50',
  '',
  'Roast lamb\t21.00',
  '',
  'Name: :tab{at=end leader=rule}',
].join('\n');

describe('tab stops and leaders in the PDF (#622)', () => {
  const doc = buildDocument({ markdown: TEXT, metadata: { title: 'A menu' } }, config);
  const lines = doc.blocks.filter((b) => b.type === 'paragraph').map((b) => b.lines[0]!);

  it('sets the leaders as segments of their own, one paragraph each', async () => {
    expect(lines.map((l) => l.segments!.find((s) => s.leader)?.leader)).toEqual(['text', 'text', 'rule']);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(structTypes(pdf).filter((t) => t === 'P')).toHaveLength(3);
  });

  it.skipIf(!hasPdftotext)('reads the words and not the dots in the extracted text', async () => {
    const file = path.join(os.tmpdir(), `postext-tabs-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(text).toMatch(/Soup of the day\s+8\.50/);
    expect(text).toMatch(/Roast lamb\s+21\.00/);
    expect(text).not.toMatch(/\.\.\./);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-tabs-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
