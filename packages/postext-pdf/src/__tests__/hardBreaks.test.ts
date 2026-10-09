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

// #620: a forced line break inside a paragraph (a backslash ending a line
// of the source). The paragraph stays one `P` of the structure tree, the
// line before the break is not stretched to the measure, and the extracted
// text breaks there.

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
  bodyText: { textAlign: 'justify' },
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
  'To the keeper of the lighthouse,\\',
  'at the end of the northern pier, who climbs the stairs every evening and lights the lamp before the boats come home.',
  '',
  'After the letter.',
].join('\n');

describe('forced line breaks in the PDF (#620)', () => {
  const doc = buildDocument({ markdown: TEXT, metadata: { title: 'A letter' } }, config);
  const paragraph = doc.blocks.find((b) => b.type === 'paragraph')!;
  const lines = paragraph.lines as VDTLine[];

  it('ends the line at the break, set at its natural width, in one paragraph', async () => {
    expect(lines[0]!.text.trim()).toBe('To the keeper of the lighthouse,');
    expect(lines[0]!.hardBreak).toBe(true);
    expect(lines[0]!.justifiedSpaceRatio).toBeUndefined();
    expect(lines.length).toBeGreaterThan(2);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    expect(structTypes(pdf).filter((t) => t === 'P')).toHaveLength(2);
  });

  it.skipIf(!hasPdftotext)('breaks the extracted text there, its words spaced as written', async () => {
    const file = path.join(os.tmpdir(), `postext-hardbreak-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(text).toMatch(/To the keeper of the lighthouse,\s*\n\s*at the end/);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-hardbreak-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
