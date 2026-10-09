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

// #624: code listings in the PDF. Each listing is a `P` holding one `Code`
// element; its spaces are real space glyphs, so a copy keeps the
// indentation; its line numbers and wrap markers are artifacts, out of the
// extracted text.

const lora = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const mono = fs.readFileSync(new URL('../../../../apps/web/public/fonts/JetBrainsMono-Regular.ttf', import.meta.url));
const monoBold = fs.readFileSync(new URL('../../../../apps/web/public/fonts/JetBrainsMono-Bold.ttf', import.meta.url));
const MONO = 'JetBrains Mono';
const fontProvider = async (family: string, weight: number) =>
  new Uint8Array(family === MONO ? (weight >= 600 ? monoBold : mono) : lora);
const faces = { text: fontkit.create(lora), mono: fontkit.create(mono) };

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const parsed = parseFontString(this.font);
    const face = this.font.includes(MONO) ? faces.mono : faces.text;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * (parsed?.sizePx ?? 16) };
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
  codeStyle: { fontFamily: MONO },
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
  'A listing:',
  '',
  '```py {lineNumbers title="f.py"}',
  'def f(x):',
  '    return x  # twice',
  '',
  'print(f(1))',
  '```',
  '',
  'After it.',
  '',
  '```js {highlight="1"}',
  `const s = "${'a'.repeat(70)}";`,
  '```',
].join('\n');

describe('code listings in the PDF (#624)', () => {
  const doc = buildDocument({ markdown: TEXT, metadata: { title: 'Code' } }, config);

  it('tags a listing as a paragraph holding Code, in its box', async () => {
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    const types = structTypes(pdf);
    const at = types.indexOf('Code');
    expect(at).toBeGreaterThan(0);
    expect(types[at - 1]).toBe('P');
    expect(types.filter((t) => t === 'Code')).toHaveLength(2);
  });

  it.skipIf(!hasPdftotext)('copies the code with its indentation, without its line numbers', async () => {
    const file = path.join(os.tmpdir(), `postext-code-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    // The indentation survives: `return` four columns in from `def`.
    const lines = text.split('\n');
    const def = lines.find((l) => l.includes('def f(x):'))!;
    const ret = lines.find((l) => l.includes('return x'))!;
    expect(ret.indexOf('return') - def.indexOf('def')).toBeGreaterThanOrEqual(4);
    expect(ret).toMatch(/return x {2,}# twice/);
    expect(text).not.toContain('\u00bb');
    expect(text).not.toMatch(/\b1\s+def f/);
    expect(text).not.toMatch(/\b2\s+return/);
  });

  it('embeds the code face', async () => {
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    const names = pdf.context.enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of('BaseFont')) : undefined))
      .filter((n): n is PDFName => n instanceof PDFName)
      .map((n) => n.decodeText());
    expect(names.some((n) => n.includes('JetBrainsMono-Regular'))).toBe(true);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-code-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
