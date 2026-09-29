import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';

// A picture a design draws in the flow of a vertical page (a chapter's plate
// in the 紅樓夢 showcase, #200) stands upright on the sheet, as the canvas and
// the HTML draw it: the layout sizes its box with the picture's width and
// height swapped (`VDTDesignImageBlock.upright`), and the PDF turns it back.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

// A 2 × 1 PNG: twice as wide as it is tall.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAC0lEQVR4nGNgAAMAAAcAAbKGrPQAAAAASUVORK5CYII=', 'base64'));
const resources: Resource[] = [
  { id: 'plate', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'plate.png', format: 'png', width: 200, height: 100 } },
];
const described: Resource[] = [{ ...resources[0]!, altText: '石頭與美玉' }];

const config = (writingMode: 'vertical-rl' | 'horizontal-tb'): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(420), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single', writingMode },
  locale: 'zh-Hant',
  header: { elements: [] },
  footer: { elements: [] },
  headings: {
    levels: [{
      level: 1,
      span: 'page',
      breakBefore: { enabled: true, parity: 'any' },
      advancedDesign: {
        enabled: true,
        slot: { elements: [{ kind: 'image', id: 'plate', resourceId: 'plate', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(20), y: pt(10) }, size: { width: pt(60), height: 'auto' } } }] },
      },
    }],
  },
});

function pageContent(pdf: PDFDocument, index: number): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = '';
  for (const ref of refs) {
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) throw new Error('page content is not a raw stream');
    out += new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
  }
  return out;
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

/** The transformation matrix in force at each image `Do` of a content
 *  stream (`q` / `Q` / `cm` followed; text objects skipped). */
function imageMatrices(content: string): M[] {
  const out: M[] = [];
  const stack: M[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const tokens = content.replace(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>/g, ' ').split(/\s+/).filter(Boolean);
  const nums: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^-?[\d.]+$/.test(t)) { nums.push(parseFloat(t)); continue; }
    if (t === 'q') stack.push(ctm);
    else if (t === 'Q') ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (t === 'cm') ctm = mul(nums.slice(-6) as M, ctm);
    else if (t === 'Do' && /^\/Image/.test(tokens[i - 1] ?? '')) out.push(ctm);
    nums.length = 0;
  }
  return out;
}

async function plateMatrix(writingMode: 'vertical-rl' | 'horizontal-tb'): Promise<M> {
  const doc = buildDocument({ markdown: '# 甄士隱\n\n此開卷第一回也。', resources }, config(writingMode));
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false, resourceBytes: (id) => (id === 'plate.png' ? PNG : undefined) }));
  const found = imageMatrices(pageContent(pdf, 0));
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('a design picture in the flow of a vertical page (#200)', () => {
  it('stands upright on the sheet, as wide as it is drawn on the canvas', async () => {
    const [a, b, c, d] = await plateMatrix('vertical-rl');
    // The unit square of the image onto the sheet: no turn, no mirror.
    expect(Math.abs(b)).toBeLessThan(1e-6);
    expect(Math.abs(c)).toBeLessThan(1e-6);
    expect(a).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(0);
    // 60 pt down the sheet, twice that across: the picture's own proportions.
    expect(d).toBeCloseTo(60, 3);
    expect(a).toBeCloseTo(120, 3);
  });

  it('leaves a horizontal page as it was', async () => {
    const [a, b, c, d] = await plateMatrix('horizontal-tb');
    expect([Math.abs(b), Math.abs(c)]).toEqual([0, 0]);
    expect(a).toBeCloseTo(60, 3);
    expect(d).toBeCloseTo(30, 3);
  });
});

/** The marked-content sequence open at each image `Do` of a content
 *  stream (its tag, `/Figure` or `/Artifact`), or `null` outside any. */
function imageTags(content: string): (string | null)[] {
  const out: (string | null)[] = [];
  const open: string[] = [];
  const tokens = content.replace(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>/g, ' ').replace(/<<[^>]*>>/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === 'BDC' || t === 'BMC') {
      // The tag is the last name before the operator (and its properties).
      const name = tokens.slice(0, i).reverse().find((x) => x.startsWith('/'));
      open.push(name ?? '?');
    } else if (t === 'EMC') open.pop();
    else if (t === 'Do' && /^\/Image/.test(tokens[i - 1] ?? '')) out.push(open[open.length - 1] ?? null);
  }
  return out;
}

describe('a design picture on a vertical page in a tagged PDF (#200, #213)', () => {
  const render = async (writingMode: 'vertical-rl' | 'horizontal-tb', res: Resource[]) => {
    const doc = buildDocument({ markdown: '# 甄士隱\n\n此開卷第一回也。', resources: res }, config(writingMode));
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, resourceBytes: (id) => (id === 'plate.png' ? PNG : undefined) }));
    return imageTags(pageContent(pdf, 0));
  };

  it('paints a picture with alternative text inside its Figure', async () => {
    expect(await render('vertical-rl', described)).toEqual(['/Figure']);
    expect(await render('horizontal-tb', described)).toEqual(['/Figure']);
  });

  it('paints a picture without alternative text inside an artifact', async () => {
    expect(await render('vertical-rl', resources)).toEqual(['/Artifact']);
    expect(await render('horizontal-tb', resources)).toEqual(['/Artifact']);
  });
});
