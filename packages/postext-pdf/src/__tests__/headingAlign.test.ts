import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, TextAlign, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

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

const config = (textAlign: TextAlign): PostextConfig => ({
  page: { width: pt(300), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { textAlign, levels: [{ level: 1, breakBefore: { enabled: false } }] },
});

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

/** The x (pt) of the first text object on the heading's baseline. */
async function headingX(doc: VDTDocument): Promise<number> {
  const heading = doc.blocks.find((b) => b.type === 'heading')!;
  const y = doc.pages[0]!.height - heading.lines[0]!.baseline; // 72 dpi: px = pt
  const content = await contentOf(doc);
  for (const m of content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
    if (Math.abs(Number(m[2]) - y) < 0.01) return Number(m[1]);
  }
  throw new Error('heading text not found');
}

describe('headings.textAlign in the PDF (EF-47)', () => {
  it('centres and right-aligns heading lines within the heading box', async () => {
    for (const [align, share] of [['left', 0], ['center', 0.5], ['right', 1]] as const) {
      const doc = buildDocument({ markdown: '# Title\n\nText.' }, config(align));
      const heading = doc.blocks.find((b) => b.type === 'heading')!;
      const slack = heading.bbox.width - heading.lines[0]!.bbox.width;
      expect(await headingX(doc)).toBeCloseTo(heading.bbox.x + slack * share, 1);
      // A line without segments takes the same position.
      for (const line of heading.lines) delete line.segments;
      expect(await headingX(doc)).toBeCloseTo(heading.bbox.x + slack * share, 1);
    }
  }, 60_000);
});
