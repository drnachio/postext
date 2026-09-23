import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, columnClipRect } from 'postext';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument } from 'postext';
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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

// The reported case (#121): an H6 inside a callout whose design draws a tab
// 15pt left of the callout edge, with a triangle-like marker hanging below it.
const config: PostextConfig = {
  page: {
    width: pt(360), height: pt(400),
    margins: { top: pt(36), bottom: pt(36), left: pt(60), right: pt(36) },
  },
  layout: { layoutType: 'single' },
  locale: 'en-us',
  headings: {
    levels: [{
      level: 6,
      advancedDesign: {
        enabled: true,
        slot: {
          elements: [
            {
              kind: 'text',
              id: 'tab',
              placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(-15) }, size: { width: pt(40) } },
              content: '{titleText}',
              fontSize: pt(9),
              overflow: 'clip',
              box: { backgroundColor: hex('#9bcdbf'), padding: { top: pt(2), bottom: pt(2), left: pt(3), right: pt(3) } },
            },
            {
              kind: 'box',
              id: 'marker',
              placement: { anchor: { to: '#tab', edge: 'below' }, size: { width: pt(6), height: pt(6) } },
              style: { backgroundColor: hex('#5a8f81') },
            },
          ],
        },
      },
    }],
  },
};

const markdown = `:::callout{title="Activity"}
###### Tab

Some text inside the callout, long enough to wrap onto a couple of lines of the box.
:::
`;

/** The page's content stream operators, inflated. */
function pageContent(page: PDFPage): string {
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const stream = page.doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      const filter = stream.dict.get(PDFName.of('Filter'));
      const bytes = filter ? inflateSync(stream.contents) : stream.contents;
      return new TextDecoder('latin1').decode(bytes);
    })
    .join('\n');
}

/** Clip rectangles (`x y w h re W n`) of a content stream, in PDF points. */
function clipRects(content: string): { x: number; width: number }[] {
  const re = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s+W\s+n/g;
  return [...content.matchAll(re)].map((m) => ({ x: Number(m[1]), width: Number(m[3]) }));
}

let doc: VDTDocument;
let content: string;
let column: VDTColumn;
let heading: VDTBlock;

beforeAll(async () => {
  doc = buildDocument({ markdown }, config);
  column = doc.pages[0]!.columns[0]!;
  heading = column.blocks.find((b) => b.type === 'heading' && b.designOverlay)!;
  const bytes = await renderToPdf(doc, { fontProvider, accessible: false, outlines: false });
  const out = process.env.POSTEXT_OVERLAY_PDF_OUT;
  if (out) fs.writeFileSync(out, bytes);
  const pdf = await PDFDocument.load(bytes);
  content = pageContent(pdf.getPage(0));
}, 60_000);

describe('column clip in the PDF backend (#121)', () => {
  it('lays the tab out to the left of the column (the VDT geometry)', () => {
    expect(heading).toBeDefined();
    const left = Math.min(...heading.designOverlay!.blocks.map((b) => b.bbox.x));
    expect(left).toBeLessThan(column.bbox.x - 10);
  });

  it('widens the column clip to take in a design overlay with a negative x offset', () => {
    const scale = 72 / doc.config.page.dpi;
    const overlayLeft = Math.min(...heading.designOverlay!.blocks.map((b) => b.bbox.x)) * scale;
    const overlayRight = Math.max(...heading.designOverlay!.blocks.map((b) => b.bbox.x + b.bbox.width)) * scale;
    const columnLeft = column.bbox.x * scale;
    const rects = clipRects(content);
    expect(rects.length).toBeGreaterThan(0);
    // The column clip starts at (or left of) the tab, not 2pt left of the column.
    const colClip = rects.find((r) => r.x < columnLeft && r.x + r.width > columnLeft);
    expect(colClip).toBeDefined();
    expect(colClip!.x).toBeLessThanOrEqual(overlayLeft + 0.01);
    expect(colClip!.x + colClip!.width).toBeGreaterThanOrEqual(overlayRight - 0.01);
  });

  it('clips to the same rectangle the canvas backend uses', () => {
    const scale = 72 / doc.config.page.dpi;
    const expected = columnClipRect(column, doc.config.page.dpi);
    const found = clipRects(content).some(
      (r) => Math.abs(r.x - expected.x * scale) < 0.01 && Math.abs(r.width - expected.width * scale) < 0.01,
    );
    expect(found).toBe(true);
  });
});
