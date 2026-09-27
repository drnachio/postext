import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { ChipStyleConfig, PostextConfig, VDTDocument } from 'postext';
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

// EF-172: a chip padded apart at the top and the bottom. At 72 dpi a
// pixel is a point, so the PDF box is the VDT box.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
const config = (chip: Partial<ChipStyleConfig>): PostextConfig => ({
  page: { width: pt(220), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false } },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left' },
  // A square box in a colour of its own, with no outline.
  chipStyles: [{ id: 'b', background: { hex: '#336699', model: 'hex' }, borderWidth: pt(0), borderRadius: pt(0), ...chip }],
});

function pageContent(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = doc.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The top and bottom (PDF y) of the first path filled in #336699. */
function boxYs(content: string): { top: number; bottom: number } {
  const at = content.indexOf('0.2 0.4 0.6 rg');
  expect(at).toBeGreaterThanOrEqual(0);
  const path = content.slice(at, content.indexOf('\nf\n', at));
  const ys = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n/g)].map((m) => Number(m[2]));
  return { top: Math.max(...ys), bottom: Math.min(...ys) };
}

const chipOf = (doc: VDTDocument) =>
  doc.blocks.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).map((s) => ({ s, l })))).find(({ s }) => s.kind === 'chip')!;

describe('chip paddingTop / paddingBottom in the PDF (EF-172)', () => {
  it('paints the box the layout gives it, taller above the baseline than below', async () => {
    const doc = buildDocument({ markdown: 'Answer :chip[A]{style="b"} here.' }, config({ paddingTop: em(0.2), paddingBottom: em(0.02) }));
    const { s, l } = chipOf(doc);
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    const { top, bottom } = boxYs(pageContent(pdf));
    const pageH = 200;
    // PDF y grows upwards: the baseline sits at pageH − baseline.
    const baseline = pageH - l.baseline;
    expect(top - baseline).toBeCloseTo(s.chip!.ascent, 2);
    expect(baseline - bottom).toBeCloseTo(s.chip!.descent, 2);
    // 1 em of text: 0.8 + 0.2 above, 0.25 + 0.02 below.
    expect(top - baseline).toBeCloseTo(10, 2);
    expect(baseline - bottom).toBeCloseTo(2.7, 2);
  });
});
