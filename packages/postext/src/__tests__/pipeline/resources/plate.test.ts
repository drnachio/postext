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

  describe('to the trim or the bleed', () => {
    const withHead: PostextConfig = {
      ...config,
      header: { elements: [{ kind: 'text', id: 'head', content: 'Running head', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } } }] } as never,
    };
    const edge = (area: 'trim' | 'bleed', cfg: PostextConfig = config) =>
      buildDocument({ markdown: MD, resources: [bitmap(400, 200, { plate: area })] }, cfg, createMeasurementCache());

    it('covers the trim, cropping the picture about its centre', () => {
      const { page, block } = plateOf(edge('trim'));
      const rb = block.resourceBlock!;
      const body = { x: block.bbox.x + rb.bodyRect.x, y: block.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height };
      expect(body.x).toBeCloseTo(0, 3);
      expect(body.y).toBeCloseTo(0, 3);
      expect(body.width).toBeCloseTo(page.width, 3);
      expect(body.height).toBeCloseTo(page.height, 3);
      // A wide picture on a tall page: its sides are cropped, all its height shown.
      expect(rb.bodySource!.height).toBeCloseTo(1, 5);
      expect(rb.bodySource!.width).toBeLessThan(1);
      expect(rb.bodySource!.x).toBeCloseTo((1 - rb.bodySource!.width) / 2, 5);
      expect(page.edgePlate).toBe('trim');
    });

    it('puts the caption at the foot of the content area, on the paper', () => {
      const { page, block } = plateOf(edge('trim'));
      const rb = block.resourceBlock!;
      const foot = page.contentArea.y + page.contentArea.height;
      const last = rb.captionLines[rb.captionLines.length - 1]!;
      expect(last.bbox.y + last.bbox.height).toBeCloseTo(foot, 3);
      expect(rb.captionBar?.background).toBe('#ffffff');
      expect(rb.captionBar!.rect.y).toBeLessThan(rb.captionLines[0]!.bbox.y);
    });

    it('drops the running heads on its page only', () => {
      const doc = edge('trim', withHead);
      const { page } = plateOf(doc);
      expect(page.header?.blocks.length ?? 0).toBe(0);
      expect(doc.pages[page.index - 1]!.header?.blocks.length ?? 0).toBeGreaterThan(0);
      const plain = plateOf(buildDocument({ markdown: MD, resources: [bitmap(400, 200)] }, withHead, createMeasurementCache()));
      expect(plain.page.edgePlate).toBeUndefined();
      expect(plain.page.header?.blocks.length ?? 0).toBeGreaterThan(0);
    });

    it('reaches the bleed with cut lines, and the trim without them', () => {
      const cut: PostextConfig = { ...config, page: { ...config.page, cutLines: { enabled: true, bleed: mm(3) } } };
      const { page, block } = plateOf(edge('bleed', cut));
      const rb = block.resourceBlock!;
      const bleedPx = (3 / 25.4) * 72;
      const trimLeft = (page.width - (170 / 25.4) * 72) / 2;
      expect(block.bbox.x + rb.bodyRect.x).toBeCloseTo(trimLeft - bleedPx, 3);
      expect(rb.bodyRect.width).toBeCloseTo((170 / 25.4) * 72 + bleedPx * 2, 3);
      const flat = plateOf(edge('bleed'));
      expect(flat.block.resourceBlock!.bodyRect.width).toBeCloseTo(flat.page.width, 3);
    });
  });
});

