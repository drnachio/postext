import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { preloadResourceImages } from '../pdf-backend/blocks/renderResourceBlock.js';
import { parseFontString } from '../fontString.js';

// A picture in a composed page's decoration (a ground drawn to the bleed,
// #878) is embedded like a running head's: the PDF used to paint the grey
// placeholder for it and report it as a missing image.

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

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#1d659c"/></svg>',
);
const mm = (value: number) => ({ value, unit: 'mm' as const });
const resources: Resource[] = [{
  id: 'sky', typeId: 'figure', kind: 'svg', caption: '', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'sky.svg', width: 200, height: 100 },
} as Resource];
const config: PostextConfig = {
  locale: 'en-us',
  page: { dpi: 72 },
  header: { elements: [] },
  footer: { elements: [] },
  pageTemplates: [{
    id: 'cover',
    decoration: { elements: [{ kind: 'image', id: 'sky', resourceId: 'sky', decorative: true,
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(80) } } }] },
    frames: [{ name: 'title', takes: 'h1', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(90) } } }],
  }],
} as PostextConfig;
const markdown = '::::page{template="cover"}\n# Water on the move\n::::\n';

describe('pictures of a composed page decoration in the PDF (#878)', () => {
  it('are preloaded with the page design slots', async () => {
    const doc = buildDocument({ markdown, resources }, config);
    expect(doc.pages[0]!.composed?.decoration?.blocks.some((b) => b.kind === 'image')).toBe(true);
    const images = await preloadResourceImages(await PDFDocument.create(), doc, (id) => (id === 'sky.svg' ? SVG : undefined));
    expect(images.get('sky.svg')?.kind).toBe('vector');
  });

  it('are painted, not reported as missing', async () => {
    const doc = buildDocument({ markdown, resources }, config);
    const warnings: string[] = [];
    await renderToPdf(doc, {
      fontProvider: async () => new Uint8Array(fontBytes),
      resourceBytes: (id) => (id === 'sky.svg' ? SVG : undefined),
      onWarning: (w) => warnings.push(w.kind),
    });
    expect(warnings).not.toContain('missingImage');
  });

  it('a cover crop (#923) is drawn whole over its uncropped box, clipped to the element', async () => {
    const square = { ...config, pageTemplates: [{ ...config.pageTemplates![0]!, decoration: { elements: [{ kind: 'image', id: 'sky', resourceId: 'sky', decorative: true, fit: 'cover',
      placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: mm(80), height: mm(80) } } }] } }] } as PostextConfig;
    const doc = buildDocument({ markdown, resources }, square);
    const block = doc.pages[0]!.composed!.decoration!.blocks.find((b) => b.kind === 'image')!;
    expect(block.kind === 'image' && block.crop).toMatchObject({ width: 0.5, height: 1 });
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), resourceBytes: (id) => (id === 'sky.svg' ? SVG : undefined) }));
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    const text = streams.map((st) => (st instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(st).decode()).toString('latin1') : '')).join('\n');
    // The clip is the 80 mm square at the top-left of the page (72 dpi:
    // 1 px = 1 pt).
    const side = (80 / 25.4) * 72;
    const clips = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\nW\nn/g)].map((m) => m.slice(1, 5).map(Number));
    expect(clips.some((c) => Math.abs(c[0]!) < 0.01 && Math.abs(c[2]! - side) < 0.01 && Math.abs(c[3]! - side) < 0.01)).toBe(true);
  });

  it('an upright picture of a vertical flow (#946) is clipped inside its turned frame', async () => {
    const vertical = {
      locale: 'ja',
      page: { dpi: 72 },
      header: { elements: [] },
      footer: { elements: [] },
      layout: { writingMode: 'vertical-rl', layoutType: 'single' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
      headingStyles: [{ id: 'opener', advancedDesign: { enabled: true, slot: { elements: [{ kind: 'image', id: 'sky', resourceId: 'sky', decorative: true, fit: 'cover',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(40), height: mm(40) } } }] } } }],
    } as unknown as PostextConfig;
    const doc = buildDocument({ markdown: '# Opening {style="opener"}\n\nText.\n', resources }, vertical);
    const block = doc.blocks.flatMap((b) => b.designOverlay?.blocks ?? []).find((b) => b.kind === 'image')!;
    expect(block.kind === 'image' && block.upright && block.crop).toMatchObject({ width: 0.5, height: 1 });
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), resourceBytes: (id) => (id === 'sky.svg' ? SVG : undefined) }));
    const contents = pdf.getPage(0).node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    const text = streams.map((st) => (st instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(st).decode()).toString('latin1') : '')).join('\n');
    // The 40 mm square, turned back upright: a clip of its own size after
    // the quarter turn, the whole picture (twice as wide) drawn in it.
    const side = (40 / 25.4) * 72;
    const clip = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\nW\nn/g)].find((m) => Math.abs(Number(m[3]) - side) < 0.01 && Math.abs(Number(m[4]) - side) < 0.01);
    expect(clip).toBeDefined();
    const turn = text.lastIndexOf(' cm', clip!.index);
    expect(turn).toBeGreaterThan(-1);
    // The vector picture's own box, after the clip: twice the side across.
    const whole = [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\nW\nn/g)].find((m) => m.index! > clip!.index! && Math.abs(Number(m[3]) - 2 * side) < 0.01);
    expect(whole).toBeDefined();
  });
});
