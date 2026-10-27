import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, frameMatrix } from 'postext';
import type { PostextConfig, Resource, VDTDocument, VDTFrame } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { sheetMatrixToPdf } from '../pdf-backend/page/comic.js';
import { parseFontString } from '../fontString.js';

// #910: the tagged PDF's `BBox` of a figure in a composed frame whose text
// is scaled (#858) or that is turned is the box the figure is painted in on
// the sheet, not its box in the frame's own coordinates; for a frame turned
// by any angle, the box its four corners cover.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(fontBytes);
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
));
const picture = (id: string): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Caption ${id}.`, altText: `Alt ${id}`, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
});
const config: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: 72, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
  header: { elements: [] },
  footer: { elements: [] },
  pageTemplates: [{
    id: 't',
    frames: [
      { name: 'turned', width: mm(60), rotate: 12, placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(10), y: mm(20) } } },
      { name: 'small', width: mm(60), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(90), y: mm(120) } } },
    ],
  }],
} as PostextConfig;
const markdown = ['::::page{template="t"}', '::resource{id="a" slot="turned"}', '', '::resource{id="b" slot="small"}', '::::'].join('\n');

/** The `BBox` of each figure, by alternative text. */
async function boxes(doc: VDTDocument): Promise<Record<string, number[]>> {
  const bytes = await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), accessible: true, resourceBytes: () => PNG });
  const pdf = await PDFDocument.load(bytes);
  const out: Record<string, number[]> = {};
  const visit = (ref: unknown): void => {
    const obj = ref instanceof PDFRef ? pdf.context.lookup(ref) : ref;
    if (obj instanceof PDFArray) { for (const k of obj.asArray()) visit(k); return; }
    if (!(obj instanceof PDFDict)) return;
    if ((obj.get(PDFName.of('S')) as PDFName | undefined)?.decodeText() === 'Figure') {
      const alt = (obj.get(PDFName.of('Alt')) as unknown as { decodeText(): string }).decodeText();
      const a = pdf.context.lookup(obj.get(PDFName.of('A'))) as PDFDict;
      out[alt] = (a.get(PDFName.of('BBox')) as PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    }
    visit(obj.get(PDFName.of('K')));
  };
  visit(pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict).get(PDFName.of('K')));
  return out;
}

/** `box` (pt, `[x1 y1 x2 y2]`) of the upright frame put through the
 *  frame's matrix on the sheet: the box its four corners cover. */
function through(frame: VDTFrame, doc: VDTDocument, box: number[]): number[] {
  const scale = 72 / doc.config.page.dpi;
  const [a, b, c, d, e, f] = sheetMatrixToPdf(frameMatrix(frame)!, scale, doc.pages[0]!.height * scale);
  const pts = [[box[0]!, box[1]!], [box[2]!, box[1]!], [box[0]!, box[3]!], [box[2]!, box[3]!]].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f]);
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

describe('figure boxes of scaled and turned frames in the tagged PDF (#910)', () => {
  it('gives each figure the box it is painted in', async () => {
    const doc = buildDocument({ markdown, resources: [picture('a'), picture('b')] }, config);
    const frames = doc.pages[0]!.composed!.frames;
    const turned = frames.find((f) => f.name === 'turned')!;
    const small = frames.find((f) => f.name === 'small')!;
    expect(turned.blockIds.length).toBeGreaterThan(0);
    expect(small.blockIds.length).toBeGreaterThan(0);
    // Upright at full size: the boxes in the frames' own coordinates.
    turned.rotate = 0;
    const upright = await boxes(doc);
    // Turned 12°, and scaled to one half as the reflow ladder leaves a
    // frame (its blocks laid out where they were).
    turned.rotate = 12;
    small.scale = 0.5;
    const painted = await boxes(doc);
    const close = (got: number[], want: number[]) => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 1));
    close(painted['Alt a']!, through(turned, doc, upright['Alt a']!));
    close(painted['Alt b']!, through(small, doc, upright['Alt b']!));
    // Half as wide and as tall as upright.
    expect(painted['Alt b']![2]! - painted['Alt b']![0]!).toBeCloseTo((upright['Alt b']![2]! - upright['Alt b']![0]!) / 2, 1);
  }, 60_000);
});
