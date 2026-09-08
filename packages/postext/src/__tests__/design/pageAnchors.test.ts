import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, pageMatchesRole, type DesignFrames } from '../../design/layout';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/headerFooter';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { resolveHeadingsConfig } from '../../defaults/headings';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, ElementAnchor } from '../../types';
import type { VDTPage } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });

const frames: DesignFrames = {
  page: { x: 20, y: 20, width: 400, height: 600 },
  bleed: { x: 10, y: 10, width: 420, height: 620 },
};
/** Header container: inside the page, inset by the margins. */
const container = { x: 60, y: 0, width: 320, height: 80 };

const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header',
  page: stubPage,
  allPages: [stubPage],
  metadata: {},
  chapterTitleByPageIndex: [],
};

const box = (id: string, anchor: ElementAnchor, size?: { width?: 'fill' | 'auto' | { value: number; unit: 'pt' }; height?: 'fill' | 'auto' | { value: number; unit: 'pt' } }): DesignElement => ({
  kind: 'box',
  id,
  placement: { anchor, size },
  style: { backgroundColor: { hex: '#ff0000', model: 'hex' } },
});

const layout = (elements: DesignElement[], withFrames = true) =>
  layoutDesignSlot(resolveDesignSlot({ elements }), { container, dpi: DPI, placeholders, frames: withFrames ? frames : undefined }, 0);

describe('page / bleed anchors', () => {
  it("anchor.to: 'page' uses the trim box as reference and fill bounds", () => {
    const { primitives, issues } = layout([box('band', { to: 'page', edge: 'top-left' }, { width: 'fill', height: pt(30) })]);
    expect(issues).toEqual([]);
    const band = primitives[0]!;
    expect(band.x).toBe(frames.page.x);
    expect(band.y).toBe(frames.page.y);
    expect(band.width).toBe(frames.page.width);
    expect(band.height).toBe(30);
  });

  it("anchor.to: 'bleed' runs edge to edge over the bleed box", () => {
    const { primitives } = layout([box('band', { to: 'bleed', edge: 'bottom-left' }, { width: 'fill', height: pt(40) })]);
    const band = primitives[0]!;
    expect(band.x).toBe(frames.bleed.x);
    expect(band.width).toBe(frames.bleed.width);
    expect(band.y + band.height).toBe(frames.bleed.y + frames.bleed.height);
  });

  it('page-anchored text clamps its auto width to the page frame, not the container', () => {
    const el: DesignElement = {
      kind: 'text',
      id: 't',
      content: 'x'.repeat(55), // 385px at 7px/char — wider than the container (320) but not the page (400)
      fontSize: pt(10),
      overflow: 'clip',
      placement: { anchor: { to: 'page', edge: 'top-left' } },
    };
    const { primitives } = layout([el]);
    const text = primitives[0]!;
    expect(text.x).toBe(frames.page.x);
    expect(text.width).toBe(385);
  });

  it('falls back to the container when no frames are supplied', () => {
    const { primitives, issues } = layout([box('band', { to: 'page', edge: 'top-left' }, { width: 'fill', height: pt(30) })], false);
    expect(issues).toEqual([]);
    expect(primitives[0]!.x).toBe(container.x);
    expect(primitives[0]!.width).toBe(container.width);
  });

  it('does not flag page/bleed anchors as dangling and still resolves #id chains off them', () => {
    const { primitives, issues } = layout([
      box('band', { to: 'bleed', edge: 'top-left' }, { width: 'fill', height: pt(30) }),
      box('under', { to: '#band', edge: 'below' }, { width: pt(50), height: pt(10) }),
    ]);
    expect(issues).toEqual([]);
    const band = primitives[0]!;
    const under = primitives[1]!;
    expect(under.y).toBe(band.y + band.height);
    expect(under.x).toBe(band.x);
  });
});

describe('page role filter', () => {
  it('pageMatchesRole admits everything for all/unknown and matches exact roles otherwise', () => {
    expect(pageMatchesRole('all', 'body')).toBe(true);
    expect(pageMatchesRole(undefined, 'opener')).toBe(true);
    expect(pageMatchesRole('body', undefined)).toBe(true);
    expect(pageMatchesRole('body', 'body')).toBe(true);
    expect(pageMatchesRole('body', 'opener')).toBe(false);
    expect(pageMatchesRole('opener', 'opener')).toBe(true);
  });

  it('layoutDesignSlot drops elements whose pages filter does not match the context role', () => {
    const elements: DesignElement[] = [
      { ...box('bodyOnly', { to: 'container', edge: 'top-left' }, { width: pt(10), height: pt(10) }), pages: 'body' },
      { ...box('openerOnly', { to: 'container', edge: 'top-left' }, { width: pt(10), height: pt(10) }), pages: 'opener' },
      box('always', { to: 'container', edge: 'top-left' }, { width: pt(10), height: pt(10) }),
    ];
    const onOpener = layoutDesignSlot(resolveDesignSlot({ elements }), { container, dpi: DPI, placeholders, pageRole: 'opener' }, 0);
    expect(onOpener.primitives.map((p) => p.id)).toEqual(['openerOnly', 'always']);
    const onBody = layoutDesignSlot(resolveDesignSlot({ elements }), { container, dpi: DPI, placeholders, pageRole: 'body' }, 0);
    expect(onBody.primitives.map((p) => p.id)).toEqual(['bodyOnly', 'always']);
  });
});

describe('measureHeadingAdvancedDesignHeight with frames', () => {
  const level = (elements: DesignElement[], minHeight?: { value: number; unit: 'pt' }) =>
    resolveHeadingsConfig({
      levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements }, ...(minHeight ? { minHeight } : {}) } }],
    }).levels.find((l) => l.level === 1)!;
  const heading = { titleText: 'T', formattedNumber: '', chapterNumber: '' };
  // Heading container sits at the content-area top: 60px below the page top.
  const origin = { x: 60, y: frames.page.y + 60 };

  it('a page-anchored band entirely above the heading does not grow the reserved height', () => {
    const lvl = level([box('band', { to: 'page', edge: 'top-left' }, { width: 'fill', height: pt(40) })]);
    const h = measureHeadingAdvancedDesignHeight(lvl, heading, 320, DPI, {}, 0, frames, origin);
    // Band spans page y 20..60, heading top is at 80 → nothing below the heading top.
    expect(h).toBe(0);
  });

  it('a page-anchored band extending below the heading top grows the reserved height', () => {
    const lvl = level([box('band', { to: 'page', edge: 'top-left' }, { width: 'fill', height: pt(100) })]);
    const h = measureHeadingAdvancedDesignHeight(lvl, heading, 320, DPI, {}, 0, frames, origin);
    // Band spans page y 20..120; heading top at 80 → 40px below it.
    expect(h).toBe(40);
  });

  it('minHeight raises the reserved height and applies even to an empty slot', () => {
    const lvl = level([box('band', { to: 'container', edge: 'top-left' }, { width: 'fill', height: pt(30) })], pt(120));
    expect(measureHeadingAdvancedDesignHeight(lvl, heading, 320, DPI, {}, 0)).toBe(120);
    const empty = level([], pt(90));
    expect(measureHeadingAdvancedDesignHeight(empty, heading, 320, DPI, {}, 0)).toBe(90);
    // Larger design content wins over a smaller minHeight.
    const tall = level([box('band', { to: 'container', edge: 'top-left' }, { width: 'fill', height: pt(200) })], pt(120));
    expect(measureHeadingAdvancedDesignHeight(tall, heading, 320, DPI, {}, 0)).toBe(200);
  });
});
