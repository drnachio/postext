import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, frameMatrix } from 'postext';
import type { VDTDocument, VDTFrame, VDTPage } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { collectFontText } from '../pdf-backend/text/fontHelpers.js';
import { sheetMatrixToPdf } from '../pdf-backend/page/comic.js';
import { parseFontString } from '../fontString.js';

// #855: the PDF paints a composed page's frames in layer order (the
// decoration at layer 0), each turned by its matrix (`cm`) and clipped to
// its box when its content overflows (`W n`), embeds the decoration's
// face, and reads the frames in Markdown order, not in paint order.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(fontBytes);
const asked: string[] = [];
const fontProvider = async (family: string) => {
  asked.push(family);
  return new Uint8Array(fontBytes);
};

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

const markdown = [
  'Intro paragraph.',
  '',
  ':::callout{placement="top"}',
  'Alpha one.',
  ':::',
  '',
  ':::callout{placement="top"}',
  'Bravo one.',
  '',
  'Bravo two.',
  ':::',
  '',
  ':::callout{placement="bottom"}',
  'Charlie one.',
  '',
  'Charlie two.',
  '',
  'Charlie three.',
  ':::',
  '',
  'Outro.',
].join('\n');

/** A laid-out page whose three floated boxes are made the frames of a
 *  composed page by hand: alpha (one paragraph) turned 15° at layer 2,
 *  bravo (two) clipped at layer 1, charlie (three) at layer −1, under a
 *  decoration set in Decofont (the page's running head, moved). */
function composedDoc(): { doc: VDTDocument; page: VDTPage; frames: Record<'alpha' | 'bravo' | 'charlie', VDTFrame> } {
  const doc = buildDocument({ markdown }, {
    locale: 'en-us',
    header: { elements: [{ kind: 'text', id: 'deco', content: 'DECO', fontFamily: 'Decofont', fontSize: { value: 10, unit: 'pt' }, placement: { anchor: { to: 'container', edge: 'top-left' } } }] },
    footer: { elements: [] },
  });
  const page = doc.pages[0]!;
  const floats = page.floats ?? [];
  const boxes = floats.filter((f) => f.type === 'callout');
  const frame = (name: string, i: number, layer: number, rotate: number, overflowPx: number): VDTFrame => {
    const box = boxes[i]!;
    return {
      id: `cp0:${name}`,
      name,
      rect: { ...box.bbox },
      rotate,
      layer,
      scale: 1,
      overflowPx,
      blockIds: floats.filter((f) => f.containerId === box.containerId).map((f) => f.id),
      configPath: `/pageTemplates/0/frames/${i}`,
    };
  };
  const frames = {
    alpha: frame('alpha', 0, 2, 15, 0),
    bravo: frame('bravo', 1, 1, 0, 24),
    charlie: frame('charlie', 2, -1, 0, 0),
  };
  page.composed = {
    template: 't',
    fenceIndex: 0,
    role: 'composed',
    attrs: {},
    attrSources: {},
    frames: [frames.alpha, frames.bravo, frames.charlie],
    decoration: page.header!,
    log: [],
    configPath: '/pageTemplates/0',
    sourceStart: 0,
    sourceEnd: 0,
  };
  delete page.header;
  return { doc, page, frames };
}

interface Elem { type: string; kids: Elem[] }

function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [] };
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
  }
  return elem;
}

function pageText(pdf: PDFDocument, index: number): string {
  const contents = pdf.getPage(index).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  return streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
}

let fixture: ReturnType<typeof composedDoc>;
let pdf: PDFDocument;
let root: Elem;

beforeAll(async () => {
  fixture = composedDoc();
  const bytes = await renderToPdf(fixture.doc, { fontProvider, accessible: true });
  pdf = await PDFDocument.load(bytes);
  const treeRoot = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  root = readElem(pdf, (treeRoot.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
}, 60_000);

describe('a composed page in the PDF (#855)', () => {
  it('turns the rotated frame through its matrix', () => {
    const text = pageText(pdf, 0);
    const m = sheetMatrixToPdf(frameMatrix(fixture.frames.alpha)!, 72 / fixture.doc.config.page.dpi, fixture.page.height * (72 / fixture.doc.config.page.dpi));
    // cos 15° and sin 15° (a clockwise turn on the sheet is −15° in PDF space).
    expect(m[0]).toBeCloseTo(0.9659, 4);
    expect(m[1]).toBeCloseTo(-0.2588, 4);
    expect(/(^|\s)0\.9659\d* -0\.2588\d* 0\.2588\d* 0\.9659\d* [-\d.]+ [-\d.]+ cm/.test(text)).toBe(true);
  });

  it('clips the overflowing frame to its box', () => {
    const text = pageText(pdf, 0);
    const s = 72 / fixture.doc.config.page.dpi;
    const r = fixture.frames.bravo.rect;
    const H = fixture.page.height * s;
    const re = [r.x * s, H - (r.y + r.height) * s, r.width * s, r.height * s];
    const ops = text.split(/\s+/);
    // `x y w h re W n` with the frame's box.
    const found = ops.some((op, i) => op === 're' && ops[i + 1] === 'W' && ops[i + 2] === 'n'
      && ops.slice(i - 4, i).every((v, j) => Math.abs(Number(v) - re[j]!) < 0.01));
    expect(found).toBe(true);
  });

  it('balances its graphics states', () => {
    const text = pageText(pdf, 0);
    const ops = text.split(/\s+/);
    expect(ops.filter((o) => o === 'q').length).toBe(ops.filter((o) => o === 'Q').length);
  });

  it('collects and embeds the decoration face', () => {
    const fonts = collectFontText(fixture.doc);
    expect([...fonts.keys()].some((k) => k.includes('Decofont'))).toBe(true);
    expect(asked).toContain('Decofont');
  });

  it('reads the frames in Markdown order, whatever order the layers paint them in', () => {
    const top = root.kids.map((k) => (k.type === 'Div' ? `Div(${k.kids.filter((c) => c.type === 'P').length})` : k.type));
    // Intro, then alpha (one paragraph), bravo (two), charlie (three), outro.
    expect(top).toEqual(['P', 'Div(1)', 'Div(2)', 'Div(3)', 'P']);
  });
});
