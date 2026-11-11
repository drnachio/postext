import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { SpotInkRegistry, type SpotPaint } from '../print/spot.js';

// Colours that overprint (#1471): K-only black keeps its rich black, one
// ink can carry a colour that overprints and one that does not, a part's
// colour of an entry that overprints overprints too, and tints of a CMYK
// entry print their inks.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

function streamText(pdf: PDFDocument, obj: PDFObject | undefined): string {
  const s = obj instanceof PDFStream ? obj : obj ? pdf.context.lookup(obj) : undefined;
  return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
}

async function render(text: ColorValue, print: PrintConfig = { standard: 'pdfx4' }, extra: PostextConfig = {}, markdown = '# A heading\n\nOverprinted text.') {
  const config: PostextConfig = {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora', color: text },
    headings: { fontFamily: 'Lora', color: { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 60, y: 0, k: 0 } } },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
  const doc = buildDocument({ markdown }, config);
  const warnings: string[] = [];
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), outputProfile: fogra39, accessible: false, print, onWarning: (w) => warnings.push(w.kind) }));
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs.map((r) => streamText(pdf, r)).join('\n');
  // The overprint state names, and what each sets.
  const states = new Map<string, boolean>();
  const gs = page.node.Resources()?.lookup(PDFName.of('ExtGState'));
  if (gs instanceof PDFDict) for (const [n, ref] of gs.entries()) {
    const d = pdf.context.lookup(ref);
    if (d instanceof PDFDict && d.get(PDFName.of('op'))) states.set(n.asString(), d.get(PDFName.of('op'))!.toString() === 'true');
  }
  return { content, states, warnings };
}

/** Whether the fill set with `color` (the `k` operands) is painted while
 *  the fill overprint is on. */
function overprinted(content: string, states: Map<string, boolean>, operands: string): boolean {
  let on = false;
  let current = '';
  for (const line of content.split('\n')) {
    const g = /^(\/\S+) gs$/.exec(line.trim());
    if (g && states.has(g[1]!)) on = states.get(g[1]!)!;
    const k = /^(\S+ \S+ \S+ \S+) k$/.exec(line.trim());
    if (k) current = k[1]!;
    if (/\bTJ$|\bTj$/.test(line.trim()) && current === operands) return on;
  }
  throw new Error(`no text set in ${operands}`);
}


describe('colours that overprint, past the basics', () => {
  it('a 100 K black that overprints is written as K-only black, overprinting', async () => {
    const { content, states } = await render({ hex: '#000000', model: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 100 }, overprint: true }, { standard: 'pdfx4', black: { overprint: false } });
    expect(overprinted(content, states, '0 0 0 1')).toBe(true);
  });

  it('one ink, one colour that overprints and one that does not', () => {
    const registry = new SpotInkRegistry();
    const ink = { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 100, overprint: false };
    const plain = registry.standIn(ink, 1) as unknown as { cyan: number; magenta: number; yellow: number; key: number };
    const over = registry.standIn({ ...ink, overprint: true }, 1) as unknown as { cyan: number; magenta: number; yellow: number; key: number };
    const a = registry.paintOf(plain.cyan, plain.magenta, plain.yellow, plain.key) as SpotPaint;
    const b = registry.paintOf(over.cyan, over.magenta, over.yellow, over.key) as SpotPaint;
    expect(a.plate).toBe(b.plate);
    expect([a.overprint, b.overprint]).toEqual([false, true]);
  });

  it('counts the process colours that overprint past the codes', () => {
    const registry = new SpotInkRegistry(1);
    registry.overprintStandIn(0, 1, 0.8, 0.1);
    const second = registry.overprintStandIn(0.5, 0, 0, 0) as unknown as { cyan: number; key: number };
    expect([second.cyan, second.key]).toEqual([0.5, 0]);
    expect(registry.overprintsExhausted()).toBe(1);
  });

  it('a section\'s colour for an entry that overprints overprints', async () => {
    const title: ColorValue = { hex: '#2d6a7d', model: 'hex', paletteId: 'title' };
    const { content, states } = await render({ hex: '#222222', model: 'hex' }, { standard: 'pdfx4' }, {
      colorPalette: [{ id: 'title', name: 'Title', value: { hex: '#2d6a7d', model: 'hex', overprint: true } }],
      headings: { fontFamily: 'Lora', color: title, levels: [{ level: 1, breakBefore: { enabled: false, parity: 'any' } }] },
      headingStyles: [{ id: 'guide', palette: { title: '#9a5a2e' } }],
    }, '# Guided {style="guide"}\n\n## Crosshead\n\nText.');
    // Text runs by fill and overprint: the headings overprint (two
    // colours: the section's and, past it, none), the body text does not.
    const runs = new Map<string, boolean>();
    let on = false;
    let current = '';
    const stack: [boolean, string][] = [];
    for (const line of content.split('\n').map((l) => l.trim())) {
      if (line === 'q') stack.push([on, current]);
      if (line === 'Q') [on, current] = stack.pop() ?? [false, ''];
      const g = /^(\/\S+) gs$/.exec(line);
      if (g && states.has(g[1]!)) on = states.get(g[1]!)!;
      const k = /^(\S+ \S+ \S+ \S+) k$/.exec(line);
      if (k) current = k[1]!;
      if (/\bTJ$|\bTj$/.test(line)) runs.set(current, on);
    }
    expect([...runs.values()].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect([...runs.values()].some((v) => !v)).toBe(true);
  });

  it('a tint of a CMYK entry prints that entry\'s inks scaled', async () => {
    const { content } = await render({ hex: '#222222', model: 'hex', paletteId: 'brand', tint: 50 }, { standard: 'pdfx4' }, {
      colorPalette: [{ id: 'brand', name: 'Brand', value: { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 60, y: 0, k: 10 } } }],
    });
    expect(content).toMatch(/^0\.5 0\.3 0 0\.05 k$/m);
  });
});
