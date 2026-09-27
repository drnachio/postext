import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// EF-80: a subscript and a superscript that touch (`*T*~0~^2^`) are set one
// over the other at the same x, the subscript 0.25 em down and the
// superscript a third of an em up; a lone subscript drops 0.15 em.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// Widths follow the font size: every character is half the size wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 px = 1 pt, so the text matrix reads in px.
const config: PostextConfig = {
  page: { width: pt(300), height: pt(200), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(20), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false } },
};

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

/** Every text object's font size and origin (`Tf`, `Tm`), in order. */
const origins = (content: string): { size: number; x: number; y: number }[] =>
  [...content.matchAll(/\/\S+ ([\d.]+) Tf[\s\S]*?1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)]
    .map((m) => ({ size: Number(m[1]), x: Number(m[2]), y: Number(m[3]) }));

describe('stacked scripts in the PDF (EF-80)', () => {
  it('paints a subscript and the superscript over it at one x', async () => {
    const doc = buildDocument({ markdown: 'Then *T*~0~^2^ grows.' }, config);
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    const baselineY = 200 - block.lines[0]!.baseline;
    const scripts = origins(await contentOf(doc)).filter((o) => o.size < 19);
    expect(scripts.length).toBe(2);
    const [sub, sup] = scripts;
    expect(sup!.x).toBeCloseTo(sub!.x, 3);
    expect(baselineY - sub!.y).toBeCloseTo(20 * 0.25, 3);
    expect(sup!.y - baselineY).toBeCloseTo(20 * 0.333, 3);
  }, 60_000);

  it('drops a lone subscript 0.15 em', async () => {
    const doc = buildDocument({ markdown: 'Water is H~2~O.' }, config);
    const baselineY = 200 - doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!.baseline;
    const [sub] = origins(await contentOf(doc)).filter((o) => o.size < 19);
    expect(baselineY - sub!.y).toBeCloseTo(20 * 0.15, 3);
  }, 60_000);
});
