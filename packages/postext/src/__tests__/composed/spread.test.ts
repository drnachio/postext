import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../index.js';
import { keepOffGutter, spreadSheet, splitSpreadDecoration } from '../../composed/spread.js';
import { composedPaintOrder } from '../../composed/paint.js';
import { flowRectToPage } from '../../vdt.js';
import type { PageTemplate } from '../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../index.js';
import { timelineFixture } from './fixtures/timeline.js';

// #861: a spread template laid as one sheet of two facing pages, cut at
// the spine.

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
const DPI = 300;
const px = (v: number): number => (v / 25.4) * DPI;
const W = px(200);

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};

const build = (md: string, templates: PageTemplate[], extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: templates }, createMeasurementCache());
const spreadPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed?.spread);
const frameOn = (page: VDTPage, name: string): VDTFrame | undefined => page.composed!.frames.find((f) => f.name === name);
const blocksOf = (page: VDTPage, f: VDTFrame): VDTBlock[] => f.facingBlocks ?? f.blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
const textOf = (blocks: readonly VDTBlock[]): string => blocks.flatMap((b) => b.lines.map((l) => l.text)).join(' ');

/** A spread of a band across the spine and a card on each page. */
const TEMPLATE: PageTemplate = {
  id: 'tl',
  spread: true,
  gutter: mm(10),
  grid: { columns: 4, rows: 4, columnGap: mm(12) },
  frames: [
    { name: 'band', crossGutter: true, grid: { col: 1, row: 1, cols: 4 } },
    { name: 'left', grid: { col: 1, row: 2 } },
    { name: 'right', grid: { col: 4, row: 2 } },
  ],
};
const MD = [
  '::::page{template="tl" spread}',
  ':::frame{slot="band"}',
  'Band across the spine',
  ':::',
  '',
  ':::frame{slot="left"}',
  'Left card',
  ':::',
  '',
  ':::frame{slot="right"}',
  'Right card',
  ':::',
  '::::',
  '',
  'After the spread.',
].join('\n');

describe('the sheet of two pages (#861)', () => {
  const trim = { x: 0, y: 0, width: 1000, height: 1400 };
  const bleed = { x: -30, y: -30, width: 1060, height: 1460 };
  it('spans both content areas, and the trim and bleed from outer edge to outer edge', () => {
    const s = spreadSheet('content', { x: 150, y: 100, width: 750, height: 1200 }, { x: 100, y: 100, width: 750, height: 1200 }, trim, bleed);
    expect(s.spine).toBe(1000);
    expect(s.shift).toBe(1000);
    expect(s.areas.area).toEqual({ x: 150, y: 100, width: 1700, height: 1200 });
    expect(s.areas.page).toEqual({ x: 0, y: 0, width: 2000, height: 1400 });
    // No bleed at the spine.
    expect(s.areas.bleed).toEqual({ x: -30, y: -30, width: 2060, height: 1460 });
    expect(s.shows).toEqual([bleed, { ...bleed, x: 970 }]);
    expect(spreadSheet('trim', trim, trim, trim, bleed).areas.area).toEqual(s.areas.page);
    expect(spreadSheet('bleed', trim, trim, trim, bleed).areas.area).toEqual(s.areas.bleed);
  });

  it('keeps a frame off the spine band, on the side of its centre, unless it crosses the gutter', () => {
    const f = { crossGutter: false };
    // Across the spine, centred left of it: its right edge moves to the band.
    expect(keepOffGutter(f, { x: 600, y: 0, width: 600, height: 10 }, 1000, 100)).toEqual({ x: 600, y: 0, width: 350, height: 10 });
    // Centred right of it: its left edge moves.
    expect(keepOffGutter(f, { x: 900, y: 0, width: 400, height: 10 }, 1000, 100)).toEqual({ x: 1050, y: 0, width: 250, height: 10 });
    // Starting inside the band: the frame moves out whole.
    expect(keepOffGutter(f, { x: 1010, y: 0, width: 100, height: 10 }, 1000, 100)).toEqual({ x: 1050, y: 0, width: 100, height: 10 });
    expect(keepOffGutter(f, { x: 940, y: 0, width: 40, height: 10 }, 1000, 100)).toEqual({ x: 910, y: 0, width: 40, height: 10 });
    // Clear of the band, or crossing the gutter: as placed.
    expect(keepOffGutter(f, { x: 100, y: 0, width: 800, height: 10 }, 1000, 100)).toEqual({ x: 100, y: 0, width: 800, height: 10 });
    expect(keepOffGutter({ crossGutter: true }, { x: 600, y: 0, width: 800, height: 10 }, 1000, 100)).toEqual({ x: 600, y: 0, width: 800, height: 10 });
    // A gutter of 0 still keeps a frame off the spine itself.
    expect(keepOffGutter(f, { x: 600, y: 0, width: 600, height: 10 }, 1000, 0).width).toBe(400);
  });

  it('cuts the decoration for each page, moved onto its sheet', () => {
    const slot = {
      bbox: { x: 0, y: 0, width: 2000, height: 100 },
      blocks: [
        { kind: 'rule' as const, bbox: { x: 100, y: 10, width: 1800, height: 2 }, color: '#000', thicknessPx: 2, direction: 'horizontal' as const },
        { kind: 'rule' as const, bbox: { x: 100, y: 20, width: 100, height: 2 }, color: '#000', thicknessPx: 2, direction: 'horizontal' as const },
        { kind: 'rule' as const, bbox: { x: 1500, y: 30, width: 100, height: 2 }, color: '#000', thicknessPx: 2, direction: 'horizontal' as const },
      ],
    };
    const halves = splitSpreadDecoration(slot, 1000, { left: { x: -30, y: -30, width: 1060, height: 1460 }, right: { x: 970, y: -30, width: 1060, height: 1460 } });
    expect(halves.left.blocks.map((b) => b.bbox.x)).toEqual([100, 100]);
    expect(halves.right.blocks.map((b) => b.bbox.x)).toEqual([-900, 500]);
    // The slot itself is not moved.
    expect(slot.blocks[0]!.bbox.x).toBe(100);
  });
});

describe('a spread template in a left-to-right book (#861)', () => {
  it('opens on a verso, with a parity blank before it at the start of the book', () => {
    const doc = build(MD, [TEMPLATE]);
    expect(doc.pages[0]!.blankForParity).toBe(true);
    const [verso, recto] = spreadPages(doc);
    expect([verso!.index, recto!.index]).toEqual([1, 2]);
    expect(verso!.composed!.spread).toBe('left');
    expect(recto!.composed!.spread).toBe('right');
    expect(verso!.composed!.facingPage).toBe(2);
    expect(recto!.composed!.facingPage).toBe(1);
    expect(verso!.role).toBe('composed');
    expect(recto!.role).toBe('composed');
    // What follows the spread starts on the next page.
    const after = doc.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.lines.some((l) => l.text.includes('After')))))!;
    expect(after.index).toBe(3);
  });

  it('needs no blank when the spread already falls on a verso', () => {
    const doc = build(`Before.\n\n${MD}`, [TEMPLATE]);
    expect(doc.pages.some((p) => p.blankForParity)).toBe(false);
    expect(spreadPages(doc).map((p) => p.index)).toEqual([1, 2]);
  });

  it('adds a parity blank when the spread would open on a recto', () => {
    const doc = build(`Before.\n\n:::pagebreak\n\nAnd more.\n\n${MD}`, [TEMPLATE]);
    expect(doc.pages[2]!.blankForParity).toBe(true);
    expect(spreadPages(doc).map((p) => [p.index, p.composed!.spread])).toEqual([[3, 'left'], [4, 'right']]);
  });

  it('puts each frame on the page that holds it, moved onto its sheet', () => {
    const doc = build(MD, [TEMPLATE]);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    expect(frameOn(verso, 'left')).toBeDefined();
    expect(frameOn(verso, 'right')).toBeUndefined();
    const right = frameOn(recto, 'right')!;
    expect(right.rect.x + right.rect.width).toBeLessThanOrEqual(W);
    expect(right.rect.x).toBeGreaterThan(0);
    for (const b of blocksOf(recto, right)) {
      expect(b.pageIndex).toBe(recto.index);
      expect(b.bbox.x).toBeGreaterThanOrEqual(right.rect.x - 0.5);
    }
    expect(textOf(blocksOf(recto, right))).toContain('Right card');
    // Ids are the template's, the same on either page.
    expect(right.id).toBe('cp0:right');
  });

  it('reads a frame crossing the spine on the page of its centre and paints its half on the other', () => {
    const doc = build(MD, [TEMPLATE]);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const own = frameOn(verso, 'band')!;
    const half = frameOn(recto, 'band')!;
    expect(own.blockIds.length).toBeGreaterThan(0);
    expect(own.facingBlocks).toBeUndefined();
    expect(half.blockIds).toEqual([]);
    expect(half.facingBlocks!.length).toBe(own.blockIds.length);
    expect(half.id).toBe(own.id);
    // The half is the same frame moved one page to the left.
    expect(half.rect.x).toBeCloseTo(own.rect.x - W, 6);
    const ownBlocks = blocksOf(verso, own);
    half.facingBlocks!.forEach((b, i) => {
      expect(b.id).toBe(`${ownBlocks[i]!.id}-facing`);
      expect(b.pageIndex).toBe(recto.index);
      expect(b.bbox.x).toBeCloseTo(ownBlocks[i]!.bbox.x - W, 6);
    });
    // The text is in the document once: the copy is in no floats and no
    // document blocks.
    expect(doc.blocks.filter((b) => b.lines.some((l) => l.text.includes('Band across'))).length).toBe(1);
    expect(recto.floats!.some((b) => b.id.endsWith('-facing'))).toBe(false);
    // Each page clips what it shows to its own sheet.
    expect(verso.composed!.sheetClip).toEqual({ x: 0, y: 0, width: W, height: px(260) });
    expect(recto.composed!.sheetClip).toEqual({ x: 0, y: 0, width: W, height: px(260) });
  });

  it('keeps frames off the gutter band and measures them at the narrower width', () => {
    const wide: PageTemplate = {
      id: 'tl', spread: true, gutter: mm(20),
      frames: [{ name: 'text', flow: true }],
    };
    const md = `::::page{template="tl" spread}\n${'Some words of running text. '.repeat(40)}\n::::\n`;
    const doc = build(md, [wide]);
    const [verso] = spreadPages(doc) as [VDTPage];
    const f = frameOn(verso, 'text')!;
    // The area runs from the left page's outer margin to the right page's;
    // centred on the spine, the frame stays on the first page, its edge at
    // the band.
    expect(f.rect.x).toBeCloseTo(px(20), 3);
    expect(f.rect.x + f.rect.width).toBeCloseTo(W - px(10), 3);
    const ev = verso.composed!.log.find((e) => e.frame === 'text')!;
    expect(ev).toMatchObject({ kind: 'resized', cause: 'gutter' });
    expect(ev.toMm).toBeCloseTo(170, 0);
    // The box holds its content at that width.
    expect(f.overflowPx).toBe(0);
    const lines = blocksOf(verso, f).flatMap((b) => b.lines);
    expect(Math.max(...lines.map((l) => l.bbox.x + l.bbox.width))).toBeLessThanOrEqual(f.rect.x + f.rect.width + 0.5);
  });

  it('bleeds through the outer edges only, the bleed box clipping each page', () => {
    const t: PageTemplate = {
      id: 'tl', spread: true,
      frames: [{ name: 'ground', crossGutter: true, layer: -1, width: 'fill', height: 'fill', placement: { anchor: { to: 'bleed', edge: 'top-left' } } }],
    };
    const md = '::::page{template="tl" spread}\n:::frame{slot="ground"}\nGround\n:::\n::::\n';
    const doc = build(md, [t], { page: { ...(PAGE.page as object), cutLines: { enabled: true, bleed: mm(3), markLength: mm(0), markOffset: mm(0) } } as never });
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const b = px(3);
    const sheet = verso.width;
    const trimX = (sheet - W) / 2;
    const own = frameOn(verso, 'ground')!;
    expect(own.rect.x).toBeCloseTo(trimX - b, 3);
    expect(own.rect.width).toBeCloseTo(2 * W + 2 * b, 3);
    expect(frameOn(recto, 'ground')!.rect.x).toBeCloseTo(trimX - b - W, 3);
    const clip = { x: trimX - b, y: trimX - b, width: W + 2 * b, height: px(260) + 2 * b };
    for (const p of [verso, recto]) {
      const c = p.composed!.sheetClip!;
      expect(c.x).toBeCloseTo(clip.x, 3);
      expect(c.width).toBeCloseTo(clip.width, 3);
      expect(c.height).toBeCloseTo(clip.height, 3);
    }
  });

  it('lays the decoration once over the sheet and cuts it for each page', () => {
    const t: PageTemplate = {
      ...TEMPLATE,
      decoration: {
        elements: [
          { kind: 'box', id: 'card', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(10), y: mm(10) }, size: { width: mm(380), height: mm(100) } }, style: { backgroundColor: { hex: '#ffffff' } } },
          { kind: 'box', id: 'stamp', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(10), y: mm(200) }, size: { width: mm(20), height: mm(20) } }, style: { backgroundColor: { hex: '#ff0000' } } },
          { kind: 'rule', id: 'under', placement: { anchor: { to: '#right', edge: 'below' }, size: { width: mm(30), height: mm(1) } } },
        ],
      } as never,
    };
    const doc = build(MD, [t]);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const boxes = (p: VDTPage) => p.composed!.decoration!.blocks.filter((b) => b.kind === 'box').map((b) => Math.round(b.bbox.x));
    // The card crosses the spine: on both pages; the stamp only on the left.
    expect(boxes(verso)).toEqual([Math.round(px(10)), Math.round(px(10))]);
    expect(boxes(recto)).toEqual([Math.round(px(10) - W)]);
    // An element anchored to a frame of the right page follows it there.
    const rule = recto.composed!.decoration!.blocks.find((b) => b.kind === 'rule')!;
    const right = frameOn(recto, 'right')!;
    expect(rule.bbox.x).toBeCloseTo(right.rect.x, 3);
    expect(verso.composed!.decoration!.blocks.some((b) => b.kind === 'rule')).toBe(false);
  });
});

describe('groups on a spread (#861, #856)', () => {
  const words = (n: number, w: string): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');
  const md = (a: string, c = a) => `::::page{template="g" spread}\n:::frame{slot="a"}\n${a}\n:::\n\n:::frame{slot="b"}\nB.\n:::\n\n:::frame{slot="c"}\n${c}\n:::\n\n:::frame{slot="d"}\nD.\n:::\n::::\n`;
  const t: PageTemplate = {
    id: 'g', spread: true, gutter: mm(20),
    // a and b take the sheet's width: the band keeps them on the left page.
    frames: [{ name: 'a', minHeight: mm(20) }, { name: 'b', minHeight: mm(20) }, { name: 'c', minHeight: mm(20) }, { name: 'd', minHeight: mm(20) }],
    groups: [
      { name: 'left', frames: ['a', 'b'], gap: mm(5) },
      { name: 'right', frames: ['c', 'd'], gap: mm(5), placement: { anchor: { to: 'container', edge: 'top-right' }, size: { width: mm(120), height: mm(200) } } },
    ],
  };

  it('stacks its frames off the spine band, measured at the width the band leaves them', () => {
    const doc = build(md(words(160, 'grow')), [t]);
    const [verso] = spreadPages(doc) as [VDTPage];
    const a = frameOn(verso, 'a')!;
    const b = frameOn(verso, 'b')!;
    expect(a.rect.x + a.rect.width).toBeCloseTo(W - px(10), 3);
    expect(b.rect.x + b.rect.width).toBeCloseTo(W - px(10), 3);
    // The stack lays b under a, a grown for its text at the narrower width.
    expect(b.rect.y - (a.rect.y + a.rect.height)).toBeCloseTo(px(5), 0);
    expect(a.overflowPx).toBe(0);
    expect(a.rect.height).toBeGreaterThan(px(20) + 1);
    // The band's cut is the template's: the log has it once, from the
    // gutter, beside what the group changed.
    const log = verso.composed!.log.map((e) => `${e.frame} ${e.kind}${e.cause ? ` ${e.cause}` : ''}`);
    expect(log).toContain('a resized gutter');
    expect(log).toContain('a grew');
    expect(log).toContain('b moved a');
    // The declared boxes are on the left page too.
    expect(b.declaredRect!.x + b.declaredRect!.width).toBeCloseTo(W - px(10), 3);
  });

  it('negotiates a group with its own box on the right page and logs it there', () => {
    const doc = build(md('A.', words(300, 'grow')), [t]);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const c = frameOn(recto, 'c')!;
    const d = frameOn(recto, 'd')!;
    expect(frameOn(verso, 'c')).toBeUndefined();
    expect(c.rect.x + c.rect.width).toBeCloseTo(W - px(20), 3);
    expect(d.rect.y - (c.rect.y + c.rect.height)).toBeCloseTo(px(5), 0);
    // The declared box moved with the frame onto the right page.
    expect(d.declaredRect!.x).toBeCloseTo(d.rect.x, 3);
    const log = recto.composed!.log.map((e) => `${e.frame} ${e.kind}${e.cause ? ` ${e.cause}` : ''}`);
    expect(log).toEqual(['c grew', 'd moved c']);
    expect(verso.composed!.log.some((e) => e.frame === 'c' || e.frame === 'd')).toBe(false);
  });
});

describe('a spread template in a right-bound book (#861)', () => {
  it('right to left: opens on the right page, the verso, which holds the start of the sheet', () => {
    const doc = build(MD, [TEMPLATE], { direction: 'rtl' } as PostextConfig);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    expect(doc.pages[0]!.blankForParity).toBe(true);
    expect([verso.index, recto.index]).toEqual([1, 2]);
    expect(verso.composed!.spread).toBe('right');
    expect(recto.composed!.spread).toBe('left');
    // Frames are in the mirrored flow: the first grid column is the
    // verso's, the last the recto's, and the band is read on the verso.
    expect(frameOn(verso, 'left')).toBeDefined();
    expect(frameOn(recto, 'right')).toBeDefined();
    expect(frameOn(verso, 'band')!.blockIds.length).toBeGreaterThan(0);
    expect(frameOn(recto, 'band')!.facingBlocks!.length).toBeGreaterThan(0);
  });

  it('left to right, bound on the right: the verso is the right page, the sheet starts on the left one', () => {
    const doc = build(MD, [TEMPLATE], { page: { ...(PAGE.page as object), binding: 'right' } } as never);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    expect(verso.composed!.spread).toBe('right');
    expect(recto.composed!.spread).toBe('left');
    // The flow is not mirrored: the sheet's first column is on the left
    // page, the recto.
    expect(frameOn(recto, 'left')).toBeDefined();
    expect(frameOn(verso, 'right')).toBeDefined();
  });
});

describe('decoration anchored to a frame on a right-to-left page (#861)', () => {
  it('reads the frame where the sheet shows it', () => {
    const t: PageTemplate = {
      id: 'one',
      frames: [{ name: 'box', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } }],
      decoration: { elements: [{ kind: 'rule', id: 'under', placement: { anchor: { to: '#box', edge: 'below' }, size: { width: mm(40), height: mm(1) } } }] } as never,
    };
    const doc = build('::::page{template="one"}\n:::frame{slot="box"}\nText\n:::\n::::\n', [t], { direction: 'rtl' } as PostextConfig);
    const page = doc.pages.find((p) => p.composed)!;
    const box = flowRectToPage(page, frameOn(page, 'box')!.rect);
    const rule = page.composed!.decoration!.blocks.find((b) => b.kind === 'rule')!;
    // The frame stands at the flow's start, the sheet's right; the rule under it.
    expect(box.x).toBeGreaterThan(page.width / 2);
    expect(rule.bbox.x).toBeCloseTo(box.x, 3);
  });
});

describe('spreadMismatch (#861)', () => {
  const single: PageTemplate = { id: 'one', frames: [{ name: 'text', flow: true }] };
  it('warns when the fence asks for a spread of a single-page template, and lays one page', () => {
    const doc = build('::::page{template="one" spread}\nText.\n::::\n', [single]);
    const w = (doc.contentWarnings ?? []).filter((x) => x.kind === 'spreadMismatch');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ template: 'one', fence: true, templateSpread: false, fenceIndex: 0 });
    expect(formatWarning(w[0]!)).toContain('single page');
    expect(spreadPages(doc)).toHaveLength(0);
    expect(doc.pages.filter((p) => p.composed)).toHaveLength(1);
  });

  it('warns when a spread template is used without the flag, and lays the spread', () => {
    const md = MD.replace(' spread}', '}');
    const doc = build(md, [TEMPLATE]);
    const w = (doc.contentWarnings ?? []).filter((x) => x.kind === 'spreadMismatch');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ template: 'tl', fence: false, templateSpread: true });
    expect(formatWarning(w[0]!)).toContain('spread');
    expect(spreadPages(doc)).toHaveLength(2);
  });

  it('reads spread through extends, and says nothing when fence and template agree', () => {
    const child: PageTemplate = { id: 'child', extends: 'tl' };
    const doc = build(MD.replace('template="tl"', 'template="child"'), [TEMPLATE, child]);
    expect((doc.contentWarnings ?? []).some((x) => x.kind === 'spreadMismatch')).toBe(false);
    expect(spreadPages(doc)).toHaveLength(2);
  });
});

describe('comic spreads (#567) next to spread templates', () => {
  it('are laid as before', () => {
    const md = ':::page{spread split="* | *"}\n:::';
    const plain = buildDocument({ markdown: md }, PAGE, createMeasurementCache());
    const withTemplates = buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [TEMPLATE] }, createMeasurementCache());
    const comics = (d: VDTDocument) => d.pages.map((p) => p.comic ? { spread: p.comic.spread, frame: p.comic.frame, panels: p.comic.panels.map((q) => q.bbox) } : null);
    expect(comics(withTemplates)).toEqual(comics(plain));
    expect(comics(plain).filter(Boolean).map((c) => c!.spread)).toEqual(['left', 'right']);
    expect(withTemplates.pages.some((p) => p.composed)).toBe(false);
  });
});

describe('painting a spread (#861)', () => {
  it('lists the facing half of a crossing frame as painted only', () => {
    const doc = build(MD, [TEMPLATE]);
    const [, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const items = composedPaintOrder(recto).filter((i) => i.kind === 'frame');
    const band = items.find((i) => i.kind === 'frame' && i.frame.name === 'band')!;
    expect(band.kind === 'frame' && band.facing).toBe(true);
    expect(band.kind === 'frame' && band.blocks.length).toBeGreaterThan(0);
  });

  it('clips the canvas to the page share of the sheet and paints the half', () => {
    const doc = build(MD, [TEMPLATE]);
    const [, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const ops: { op: string; args: unknown[] }[] = [];
    const recorded = new Set(['save', 'restore', 'rect', 'clip', 'fillText']);
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
        if (typeof key === 'string' && recorded.has(key)) return (...args: unknown[]) => { ops.push({ op: key, args }); };
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    renderPageToCanvas(recto, doc, canvas);
    const c = recto.composed!.sheetClip!;
    const clip = ops.findIndex((o) => o.op === 'rect' && (o.args as number[]).join() === [c.x, c.y, c.width, c.height].join());
    expect(clip).toBeGreaterThanOrEqual(0);
    expect(ops[clip + 1]?.op).toBe('clip');
    const band = ops.findIndex((o) => o.op === 'fillText' && String(o.args[0]).includes('Band'));
    expect(band).toBeGreaterThan(clip);
    expect(ops.filter((o) => o.op === 'save').length).toBe(ops.filter((o) => o.op === 'restore').length);
  });

  it('hides the facing half from assistive technology in the HTML, and keeps it out of the patchable blocks', () => {
    const doc = build(MD, [TEMPLATE]);
    const out = renderToHtmlIndexed(doc);
    const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
    const html = out.pages[recto.index]!;
    expect(html.innerHtml).toMatch(/<div class="pt-frame" data-frame-id="cp0:band"[^>]*data-facing="true" aria-hidden="true"/);
    expect(html.innerHtml).toContain('class="pt-sheet-clip"');
    expect(html.blocks.some((b) => b.id.endsWith('-facing'))).toBe(false);
    expect(html.decorationHtml).toContain('-facing');
    const owner = out.pages[verso.index]!.innerHtml;
    expect(owner).not.toContain('data-facing');
    // Reading order on the right page: its own frames in Markdown order,
    // the facing half (hidden) where its content falls; the band is read
    // on the left page, before the left card.
    const at = (h: string, id: string) => h.indexOf(`data-frame-id="${id}"`);
    expect(at(owner, 'cp0:band')).toBeLessThan(at(owner, 'cp0:left'));
    expect(at(html.innerHtml, 'cp0:band')).toBeLessThan(at(html.innerHtml, 'cp0:right'));
    expect(html.innerHtml).toMatch(/data-frame-id="cp0:band"[^>]*style="[^"]*z-index:\d+/);
  });
});

describe('the timeline stand-in (#861)', () => {
  for (const locale of ['es', 'en'] as const) {
    it(`sets the ${locale} timeline over two facing pages from one spread template, every word in the Markdown`, () => {
      const { markdown, config, resources } = timelineFixture(locale);
      const doc = buildDocument({ markdown, resources }, config, createMeasurementCache());
      const [verso, recto] = spreadPages(doc) as [VDTPage, VDTPage];
      expect(doc.pages).toHaveLength(3);
      expect(doc.pages[0]!.blankForParity).toBe(true);
      expect([verso.composed!.spread, recto.composed!.spread]).toEqual(['left', 'right']);
      const names = (p: VDTPage) => p.composed!.frames.filter((f) => !f.facingBlocks).map((f) => f.name);
      expect(names(verso)).toEqual(['titulo', 'texto', 'banda-1', 'era-1', 'era-2', 'era-3', 'tira', 'nota-1', 'nota-2', 'nota-3']);
      expect(names(recto)).toEqual(['recuadro', 'banda-2', 'era-4', 'era-5', 'era-6', 'nota-4', 'nota-5', 'nota-6']);
      // The second band and the strip cross the spine: the band is read on
      // the right page (its centre is there), the strip on the left, and
      // each page paints the other's half.
      expect(verso.composed!.frames.filter((f) => f.facingBlocks).map((f) => f.name)).toEqual(['banda-2']);
      expect(recto.composed!.frames.filter((f) => f.facingBlocks).map((f) => f.name)).toEqual(['tira']);
      // Nothing overflows, the cards stay clear of the gutter.
      expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow' || w.kind === 'spreadMismatch')).toEqual([]);
      expect([...verso.composed!.log, ...recto.composed!.log].filter((e) => e.cause === 'gutter')).toEqual([]);
      // Six tabbed cards, each with its era's words from the Markdown.
      for (const [page, ks] of [[verso, [1, 2, 3]], [recto, [4, 5, 6]]] as const) {
        for (const k of ks) {
          const f = frameOn(page, `era-${k}`)!;
          expect(blocksOf(page, f)[0]!.designOverlay!.blocks.some((b) => b.kind === 'text')).toBe(true);
        }
      }
      // The configuration holds no sentence of the spread.
      const text = JSON.stringify(config);
      for (const p of [verso, recto]) for (const b of p.floats!) for (const l of b.lines) if (l.text.length > 20) expect(text).not.toContain(l.text);
      // The decoration: the ground and the card across the spine on both
      // pages, the running head on the right one.
      expect(verso.composed!.decoration!.blocks.filter((b) => b.kind === 'box')).toHaveLength(2);
      expect(recto.composed!.decoration!.blocks.filter((b) => b.kind === 'box')).toHaveLength(2);
      expect(recto.composed!.decoration!.blocks.some((b) => b.kind === 'text')).toBe(true);
      expect(verso.composed!.decoration!.blocks.some((b) => b.kind === 'text')).toBe(false);
    });
  }
});

describe('spreads on vertical pages (#926)', () => {
  const H = px(260);
  /** Four rows down the flow, which on a vertical sheet runs from its
   *  right edge to its left: rows 1–2 on the right page, 3–4 on the left;
   *  a band across the spine. */
  const VT: PageTemplate = {
    id: 'vt',
    spread: true,
    gutter: mm(10),
    area: 'content',
    grid: { columns: 1, rows: 4, rowGap: mm(10) },
    frames: [
      { name: 'first', grid: { col: 1, row: 1 } },
      { name: 'band', crossGutter: true, grid: { col: 1, row: 2, rows: 2 } },
      { name: 'second', grid: { col: 1, row: 4 } },
    ],
    decoration: { elements: [{ kind: 'box', id: 'ground', placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(30) } }, style: { backgroundColor: { hex: '#f6efe0', model: 'hex' } } }] },
  };
  const md = [
    '本文の前。', '',
    '::::page{template="vt" spread}',
    ':::frame{slot="first"}', '右のページ。', ':::', '',
    ':::frame{slot="band"}', 'のどをまたぐ帯。', ':::', '',
    ':::frame{slot="second"}', '左のページ。', ':::',
    '::::', '', '後の本文。',
  ].join('\n');
  const vertical: PostextConfig = { locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } as never, page: { ...PAGE.page, binding: 'right' } as never };

  it('lays the sheet along the flow: the right page first, each frame on its page, the band read once', () => {
    const doc = build(md, [VT], vertical);
    const pages = spreadPages(doc);
    expect(pages).toHaveLength(2);
    const right = pages.find((p) => p.composed!.spread === 'right')!;
    const left = pages.find((p) => p.composed!.spread === 'left')!;
    // A right-bound book: the verso, first in reading order, is the right page.
    expect(right.index).toBeLessThan(left.index);
    expect(frameOn(right, 'first')!.blockIds.length).toBeGreaterThan(0);
    expect(frameOn(left, 'second')!.blockIds.length).toBeGreaterThan(0);
    expect(frameOn(right, 'second')).toBeUndefined();
    expect(frameOn(left, 'first')).toBeUndefined();
    // Every frame but the band stands on its page's own sheet.
    for (const page of pages) {
      for (const f of page.composed!.frames.filter((x) => x.name !== 'band')) {
        const r = flowRectToPage(page, f.rect);
        expect(r.x).toBeGreaterThanOrEqual(-0.5);
        expect(r.x + r.width).toBeLessThanOrEqual(W + 0.5);
        expect(r.y).toBeGreaterThanOrEqual(-0.5);
        expect(r.y + r.height).toBeLessThanOrEqual(H + 0.5);
      }
    }
    // The band crosses the spine: read on one page, painted on both.
    const owners = pages.filter((p) => frameOn(p, 'band')!.blockIds.length > 0);
    expect(owners).toHaveLength(1);
    const facing = pages.find((p) => p !== owners[0])!;
    expect(frameOn(facing, 'band')!.facingBlocks!.length).toBeGreaterThan(0);
    expect(textOf(blocksOf(owners[0]!, frameOn(owners[0]!, 'band')!))).toContain('帯');
    // The right page's half of the band touches its left edge (the spine),
    // the left page's its right edge.
    const halfOn = (p: VDTPage) => flowRectToPage(p, frameOn(p, 'band')!.rect);
    expect(halfOn(right).x).toBeLessThanOrEqual(0.5);
    expect(halfOn(left).x + halfOn(left).width).toBeGreaterThanOrEqual(W - 0.5);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow' || w.kind === 'spreadMismatch')).toEqual([]);
  });

  it('cuts the decoration laid over the physical sheet, and clips each page to its own sheet', () => {
    const doc = build(md, [VT], vertical);
    for (const page of spreadPages(doc)) {
      const ground = page.composed!.decoration!.blocks.find((b) => b.elementId === 'ground')!;
      // The ground runs across both pages: each page holds its half, on
      // its own sheet.
      expect(ground.bbox.x).toBeLessThanOrEqual(0.5);
      expect(ground.bbox.x + ground.bbox.width).toBeGreaterThanOrEqual(W - 0.5);
      // The flow clip, mapped to the sheet, is the page's own sheet.
      const clip = flowRectToPage(page, page.composed!.sheetClip!);
      expect(clip.x).toBeCloseTo(0, 3);
      expect(clip.width).toBeCloseTo(W, 3);
      expect(clip.height).toBeCloseTo(H, 3);
    }
    const out = renderToHtmlIndexed(doc);
    const html = spreadPages(doc).map((p) => out.pages[p.index]!.innerHtml + out.pages[p.index]!.decorationHtml).join('');
    // The decoration's clip on the sheet: the page's physical box.
    expect(html).toContain(`polygon(0px 0px,${W.toFixed(4)}px 0px,${W.toFixed(4)}px ${H.toFixed(4)}px,0px ${H.toFixed(4)}px)`);
  });
});
