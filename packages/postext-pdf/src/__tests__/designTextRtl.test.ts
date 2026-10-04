import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';
import { complexShaperReady, shapeRun } from '../complexShaping';
import { firstStrongDirection } from '../bidiRuns';

// Issue #377: a running head and a chip of a right-to-left document are
// painted run by run in the order the engine gives (`order`, `rtl`), the
// Arabic runs shaped right to left by HarfBuzz.

const AMIRI = new Uint8Array(fs.readFileSync(new URL('./fixtures/arabic/amiri-subset.ttf', import.meta.url)));
const fontProvider = async () => AMIRI;

/** Measures with HarfBuzz once it is loaded, a rough em before. */
class HarfBuzzCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = complexShaperReady() ? shapeRun(AMIRI, s, { direction: firstStrongDirection(s) ?? 'ltr' }) : undefined;
    if (!run) return { width: s.length * sizePx * 0.5 };
    return { width: (run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) / run.upem) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): HarfBuzzCtx {
    return new HarfBuzzCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const TITLE = 'السلام عليكم Latin';

function config(): PostextConfig {
  return {
    direction: 'rtl',
    locale: 'ar',
    page: { width: pt(420), height: pt(260), dpi: 72, margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Amiri', fontSize: pt(14), lineHeight: pt(28), firstLineIndent: pt(0), hyphenation: { enabled: false } },
    headings: { levels: [{ level: 1, fontFamily: 'Amiri' }] },
    header: {
      elements: [{
        kind: 'text', id: 'rh', content: '{chapterTitle}', fontFamily: 'Amiri', fontSize: pt(12), overflow: 'wrap', align: 'start',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
      }],
    },
    footer: { elements: [] },
  };
}

function pageContent(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

const hasPdftotext = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('design text right to left in the PDF', () => {
  it('paints the running head run by run, left to right on the sheet', async () => {
    // Load HarfBuzz for the measurement too: one render first.
    await renderToPdf(buildDocument({ markdown: `# ${TITLE}` }, config()), { fontProvider });
    const doc = buildDocument({ markdown: `# ${TITLE}\n\nكلمة كلمة.` }, config());
    const header = doc.pages[0]!.header!.blocks[0]!;
    if (header.kind !== 'text') throw new Error('no header text');
    const line = header.lines[0]!;
    expect(header.direction).toBe('rtl');
    expect(line.runs!.map((r) => [r.text, r.rtl ?? false])).toEqual([['السلام عليكم ', true], ['Latin', false]]);
    expect(line.order).toEqual([1, 0]);
    const bytes = await renderToPdf(doc, { fontProvider });
    const content = pageContent(await PDFDocument.load(bytes));
    // The header's baseline: two text objects, Latin first (at the left).
    const pageHeightPt = 260;
    const y = Math.round(pageHeightPt - line.baselineY);
    const xs = [...content.matchAll(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm$/gm)]
      .filter((m) => Math.round(Number(m[2])) === y)
      .map((m) => Number(m[1]));
    expect(xs.length).toBe(2);
    expect(xs[0]!).toBeLessThan(xs[1]!);
    // The Latin run starts at the header's left edge plus the slack: its
    // start is the box's right edge minus the line width.
    expect(xs[0]!).toBeCloseTo((header.bbox.x + line.xOffset) * 1, 0);
    if (hasPdftotext) {
      const file = path.join(os.tmpdir(), `postext-design-rtl-${process.pid}.pdf`);
      fs.writeFileSync(file, bytes);
      const text = execFileSync('pdftotext', ['-enc', 'UTF-8', '-l', '1', file, '-'], { encoding: 'utf8' });
      fs.unlinkSync(file);
      const rows = text.split('\n').map((t) => t.replace(/[\s\f‪-‮]/g, '')).filter(Boolean);
      expect(rows[0]).toBe('السلامعليكمLatin');
    }
  });

  it.skipIf(!hasPdftotext)('places body runs shaped on a mirrored page in their own boxes', async () => {
    const doc = buildDocument({ markdown: 'كلمة السلام عليكم كلمة Latin 2024 كلمة' }, { ...config(), header: { elements: [] } });
    const bytes = await renderToPdf(doc, { fontProvider });
    const file = path.join(os.tmpdir(), `postext-design-rtl-body-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const xml = execFileSync('pdftotext', ['-bbox', '-l', '1', file, '-'], { encoding: 'utf8' });
    fs.unlinkSync(file);
    const words = [...xml.matchAll(/xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(words.length).toBeGreaterThanOrEqual(6);
    // Up to postext 1.14 each run of a mirrored page was turned back about
    // its left edge and landed one advance off, over its neighbour.
    for (let i = 1; i < words.length; i++) expect(words[i]![0]).toBeGreaterThanOrEqual(words[i - 1]![1] - 0.5);
  });
});
