import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { fontPx } from './fontPx.js';

// #907: a paragraph style's letterSpacing is painted as the character
// spacing of every line it sets, in the running text and in a box.

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
    const size = parseFloat(fontPx(this.font)?.[1] ?? '10');
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
  // +15/1000 em of a 20 pt title: 0.3 pt after every letter.
  paragraphStyles: [{ id: 'title', fontSize: pt(20), lineHeight: pt(24), textAlign: 'left', textTransform: 'uppercase', letterSpacing: { value: 0.015, unit: 'em' } }],
};
const TEXT = 'The money of every day and what we buy.';

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

describe('paragraph style letter spacing in the PDF (#907)', () => {
  it('sets the character spacing of every line of a tracked style', async () => {
    const doc = buildDocument({ markdown: `:::paragraphs{style="title"}\n${TEXT}\n:::\n\nPlain text after it.` }, CONFIG);
    const title = doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]?.text.startsWith('THE'))!;
    expect(title.letterSpacing).toBeCloseTo(0.3, 5);
    const set = spacings(await contentOf(doc)).filter((v) => v !== 0);
    expect(set).toHaveLength(title.lines.length);
    for (const v of set) expect(v).toBeCloseTo(0.3, 5);
  }, 60_000);

  it('does the same for a tracked style inside a box', async () => {
    const doc = buildDocument({ markdown: `:::callout{type="n"}\n:::paragraphs{style="title"}\n${TEXT}\n:::\n:::` }, CONFIG);
    const boxed = doc.blocks.find((b) => b.type === 'paragraph' && b.containerId !== undefined)!;
    expect(boxed.letterSpacing).toBeCloseTo(0.3, 5);
    const set = spacings(await contentOf(doc)).filter((v) => v !== 0);
    expect(set).toHaveLength(boxed.lines.length);
  }, 60_000);
});
