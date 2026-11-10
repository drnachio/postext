import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTPage } from '../../../index.js';

// A full-page plate (`placement.plate`): the picture alone on a
// page of its own, as large as the content area holds with its caption,
// enlarged or reduced, the text running on before and after it.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config: PostextConfig = {
  page: { dpi: 72, width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(20), left: mm(12), right: mm(12) } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', firstLineIndent: mm(0), hyphenation: { enabled: false } },
};

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
const para = (n: number) => Array.from({ length: n }, () => sentence).join(' ');

const bitmap = (width: number, height: number, placement: Resource['placement'] = { plate: true }): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'A plate of the whole bed.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width, height },
  placement,
});
const svg = (width: number, height: number): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A plate of the whole bed.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'fig.svg', width, height },
  placement: { plate: true },
});

const MD = `${para(6)} See :ref{id="fig"}. ${para(40)}`;
const build = (r: Resource, md = MD): VDTDocument => buildDocument({ markdown: md, resources: [r] }, config, createMeasurementCache());

const plateOf = (doc: VDTDocument): { page: VDTPage; block: VDTBlock } => {
  for (const page of doc.pages) {
    const block = (page.floats ?? []).find((b) => b.resourceBlock);
    if (block) return { page, block };
  }
  throw new Error('no plate');
};
const textOn = (page: VDTPage): number => page.columns.reduce((n, c) => n + c.blocks.filter((b) => b.type === 'paragraph').length, 0);

describe('a full-page plate', () => {
  it('enlarges a small picture to the content area, on a page of its own', () => {
    const doc = build(bitmap(100, 140));
    const { page, block } = plateOf(doc);
    const rb = block.resourceBlock!;
    expect(rb.plateScale).toBeGreaterThan(1);
    // As tall as the room leaves with its caption, or as wide as the page.
    const area = page.contentArea;
    const fillsWidth = Math.abs(rb.bodyRect.width - area.width) < 1;
    const fillsHeight = rb.bodyRect.height + rb.captionLines.length * 10 > area.height * 0.8;
    expect(fillsWidth || fillsHeight).toBe(true);
    expect(rb.bodyRect.width).toBeLessThanOrEqual(area.width + 0.5);
    // No text on the plate's page; the text runs on before and after.
    expect(textOn(page)).toBe(0);
    expect(page.index).toBeGreaterThan(0);
    expect(textOn(doc.pages[page.index - 1]!)).toBeGreaterThan(0);
    expect(textOn(doc.pages[page.index + 1]!)).toBeGreaterThan(0);
  });

  it('reduces a picture larger than the content area', () => {
    const { page, block } = plateOf(build(bitmap(4000, 6000)));
    const rb = block.resourceBlock!;
    expect(rb.plateScale).toBeLessThan(1);
    expect(rb.bodyRect.height).toBeLessThanOrEqual(page.contentArea.height);
  });

  it('fills the width with a wide picture and centres it by default', () => {
    const { page, block } = plateOf(build(svg(400, 200)));
    const rb = block.resourceBlock!;
    expect(rb.bodyRect.width).toBeCloseTo(page.contentArea.width, 0);
    const tall = plateOf(build(svg(200, 600)));
    const t = tall.block.resourceBlock!;
    // The picture's rectangle is the block's own, the block as wide as the page.
    expect(tall.block.bbox.width).toBeCloseTo(tall.page.contentArea.width, 0);
    const left = t.bodyRect.x;
    const right = tall.block.bbox.width - (t.bodyRect.x + t.bodyRect.width);
    expect(left).toBeGreaterThan(5);
    expect(Math.abs(left - right)).toBeLessThan(1);
  });

  it('leaves a picture set in the text as it is', () => {
    const md = `${para(2)}\n\n::resource{id="fig"}\n\n${para(4)}`;
    const here = build(bitmap(100, 140, { position: 'here', plate: true }), md);
    const plain = build(bitmap(100, 140, { position: 'here' }), md);
    const body = (d: VDTDocument) => d.pages[0]!.columns.flatMap((c) => c.blocks).find((b) => b.resourceBlock)!.resourceBlock!.bodyRect;
    expect(body(here)).toEqual(body(plain));
  });

  it('reports a bitmap enlarged under 300 ppi', () => {
    const doc = build(bitmap(100, 140));
    const w = (doc.contentWarnings ?? []).find((x) => x.kind === 'plateLowResolution');
    expect(w).toBeDefined();
    const hi = build(bitmap(4000, 6000));
    expect((hi.contentWarnings ?? []).some((x) => x.kind === 'plateLowResolution')).toBe(false);
  });
});
