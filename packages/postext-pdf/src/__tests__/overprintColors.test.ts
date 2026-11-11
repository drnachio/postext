import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';

// Colours that overprint (`ColorValue.overprint`): every style set in
// them overprints in a print render; the others knock out as before.

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

async function render(text: ColorValue, print: PrintConfig = { standard: 'pdfx4' }) {
  const config: PostextConfig = {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora', color: text },
    headings: { fontFamily: 'Lora', color: { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 60, y: 0, k: 0 } } },
    header: { elements: [] },
    footer: { elements: [] },
  };
  const doc = buildDocument({ markdown: '# A heading\n\nOverprinted text.' }, config);
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), outputProfile: fogra39, accessible: false, print }));
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
  return { content, states };
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

describe('colours that overprint', () => {
  it('set a CMYK colour as it is, overprinting, and leave the others knocked out', async () => {
    const { content, states } = await render({ hex: '#c00020', model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 10 }, overprint: true });
    expect(overprinted(content, states, '0 1 0.8 0.1', )).toBe(true);
    expect(overprinted(content, states, '1 0.6 0 0')).toBe(false);
  });

  it('overprint a screen colour through the output profile', async () => {
    const { content, states } = await render({ hex: '#2a6f3c', model: 'hex', overprint: true });
    const operands = [...content.matchAll(/^(\S+ \S+ \S+ \S+) k$/gm)].map((m) => m[1]!).find((o) => o !== '1 0.6 0 0' && o !== '0 0 0 0')!;
    expect(overprinted(content, states, operands)).toBe(true);
  });

  it('make a spot colour\'s ink overprint', async () => {
    const { content, states } = await render({ hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } }, overprint: true });
    // The ink's paint is preceded by an overprinting state.
    expect(content).toMatch(/\/CSs\S+ cs\s+1 scn[\s\S]*?\/GSo\S+ gs\s+\[[^\]]*\] TJ/);
    expect([...states.values()]).toContain(true);
  });

  it('leave a document without them as it was: every colour knocked out', async () => {
    const { content, states } = await render({ hex: '#c00020', model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 10 } });
    expect(overprinted(content, states, '0 1 0.8 0.1')).toBe(false);
    expect(overprinted(content, states, '1 0.6 0 0')).toBe(false);
  });

  it('do nothing in an RGB PDF', async () => {
    const { states } = await render({ hex: '#c00020', model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 10 }, overprint: true }, { standard: 'none' });
    expect([...states.values()].some(Boolean)).toBe(false);
  });
});
