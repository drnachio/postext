import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// EF-111: a box paragraph set one line shorter with negative tracking (the
// runt fix, `bodyText.maxRuntTracking`) is painted with that tracking, as a
// paragraph of the running text is.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// Widths that vary by character, so the breaks fall in many places.
const W = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('il.,;:!|\'()'.includes(ch)) return 0.28;
  if ('mwMW'.includes(ch)) return 0.8;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.5;
};
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    let w = 0;
    for (const ch of s) w += W(ch) * size;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  page: { width: pt(160), height: pt(300), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false } },
  calloutStyles: [{ id: 'n', padding: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } }],
};
const TEXT = 'and within a is its within lets left its osmosis a left and within a is its within lets left its.';

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

const spacings = (content: string): number[] => [...content.matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1]));

describe('runt tracking inside a box in the PDF (EF-111)', () => {
  it('sets the character spacing of every line of the box paragraph', async () => {
    const doc = buildDocument({ markdown: `:::callout{type="n"}\n${TEXT}\n:::` }, CONFIG);
    const boxed = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(boxed.containerId).toBeDefined();
    expect(boxed.letterSpacing).toBeCloseTo(-0.1, 5);
    const set = spacings(await contentOf(doc)).filter((v) => v !== 0);
    expect(set).toHaveLength(boxed.lines.length);
    for (const v of set) expect(v).toBeCloseTo(-0.1, 5);
  }, 60_000);
});
