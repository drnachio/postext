import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTLine } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #620: a poem set line by line in the PDF. Each stanza is a paragraph
// (`P`) of the structure tree, and the extracted text keeps a line end
// after every line of verse.

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
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
};

const POEM = [
  'Before the poem.',
  '',
  ':::verse',
  'Whose woods these are I think I know.',
  '  His house is in the village though;',
  '',
  'He will not see me stopping here, nor watch the long road run on past the trees',
  '  To watch his woods fill up with snow.',
  ':::',
  '',
  'After the poem.',
].join('\n');

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

describe('verse line by line in the PDF (#620)', () => {
  const doc = buildDocument({ markdown: POEM, metadata: { title: 'A poem' } }, config);
  const lines = doc.blocks.flatMap((b) => b.lines as VDTLine[]).filter((l) => l.verseLine);

  it('tags each stanza as a paragraph', async () => {
    expect(lines.some((l) => l.verseLine!.turnover)).toBe(true);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    // Before, two stanzas, after.
    expect(structTypes(pdf).filter((t) => t === 'P')).toHaveLength(4);
  });

  it.skipIf(!hasPdftotext)('keeps a line end after every line of verse in the extracted text', async () => {
    const file = path.join(os.tmpdir(), `postext-verse-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    const rows = text.split('\n').map((r) => r.trim());
    for (const l of lines) expect(rows, l.text).toContain(l.text.trim());
    expect(text).toMatch(/I think I know\.\s*\n\s*His house is in the village though;\s*\n/);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-verse-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
