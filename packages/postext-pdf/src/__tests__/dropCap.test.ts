import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, PDFHexString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

// #623: a drop cap in a body paragraph. The initial is drawn in its own face
// (embedded), as part of the paragraph's `P`; with the rest of its word it is
// a `Span` whose `/ActualText` is the word, and the text extraction reads the
// word once, whole, where the first line is.

const lora = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fraunces = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Fraunces-Bold.ttf', import.meta.url));
const fontProvider = async (family: string) => new Uint8Array(family === 'Fraunces' ? fraunces : lora);
const faces = { lora: fontkit.create(lora), fraunces: fontkit.create(fraunces) };

class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const face = /Fraunces/.test(this.font) ? faces.fraunces : faces.lora;
    const run = face.layout(s);
    return {
      width: (run.advanceWidth / face.unitsPerEm) * sizePx,
      actualBoundingBoxAscent: (face.capHeight / face.unitsPerEm) * sizePx,
      actualBoundingBoxDescent: 0,
    };
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
  bodyText: { fontFamily: 'Lora', textAlign: 'justify' },
  headings: { levels: [{ level: 1, fontFamily: 'Lora', dropCap: { lines: 3, fontFamily: 'Fraunces', fontWeight: 700 } }] },
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

/** The structure elements of the tree, depth first: type and ActualText. */
function structElems(pdf: PDFDocument): { type: string; actualText?: string; parent?: string }[] {
  const out: { type: string; actualText?: string; parent?: string }[] = [];
  const visit = (ref: unknown, parent?: string): void => {
    const dict = ref instanceof PDFRef ? pdf.context.lookup(ref) : ref;
    if (dict instanceof PDFArray) {
      for (const kid of dict.asArray()) visit(kid, parent);
      return;
    }
    if (!(dict instanceof PDFDict)) return;
    const s = dict.get(PDFName.of('S'));
    const type = s instanceof PDFName ? s.decodeText() : undefined;
    if (type) {
      const at = dict.get(PDFName.of('ActualText'));
      out.push({ type, ...(at instanceof PDFString || at instanceof PDFHexString ? { actualText: at.decodeText() } : {}), ...(parent ? { parent } : {}) });
    }
    const k = dict.get(PDFName.of('K'));
    for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) visit(kid, type ?? parent);
  };
  const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  visit(root.get(PDFName.of('K')));
  return out;
}

const TEXT = 'Long before there were title pages there were readers of the scrolls who kept their place with a finger and a lamp, and the first letter of a chapter was painted large so the eye could find it again.';

describe('drop caps in the PDF (#623)', () => {
  const doc = buildDocument({ markdown: `# The scrolls\n\n${TEXT}`, metadata: { title: 'Scrolls' } }, config);
  const p = doc.blocks.find((b) => b.type === 'paragraph')!;

  it('the paragraph opens with the initial in its own face', () => {
    expect(p.dropCap).toMatchObject({ text: 'L', word: 'Long', wordRest: 3 });
    expect(p.dropCap!.fontString).toContain('Fraunces');
  });

  it('draws the initial in its face, embedded, inside the paragraph’s P, a Span reading the whole word', async () => {
    const bytes = await renderToPdf(doc, { fontProvider });
    const pdf = await PDFDocument.load(bytes);
    const fonts = new Set<string>();
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font')) {
        const base = obj.get(PDFName.of('BaseFont'));
        if (base instanceof PDFName) fonts.add(base.decodeText());
      }
    });
    expect([...fonts].some((f) => /Fraunces/.test(f))).toBe(true);
    const span = structElems(pdf).find((e) => e.type === 'Span' && e.actualText === 'Long');
    expect(span).toBeDefined();
    expect(span!.parent).toBe('P');
  });

  it.skipIf(!hasPdftotext)('reads the first word whole in the extracted text', async () => {
    const file = path.join(os.tmpdir(), `postext-dropcap-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(text).toMatch(/Long before there/);
    expect(text).not.toMatch(/\bL\s+ong\b/);
    expect(text.match(/Long/g)).toHaveLength(1);
  });

  it.skipIf(!hasVerapdf)('passes veraPDF (PDF/UA-1)', async () => {
    const file = path.join(os.tmpdir(), `postext-dropcap-ua-${process.pid}.pdf`);
    fs.writeFileSync(file, await renderToPdf(doc, { fontProvider }));
    const out = spawnSync('verapdf', ['--flavour', 'ua1', '--format', 'text', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    expect(out.stdout).toMatch(/^PASS /m);
  }, 120_000);
});
