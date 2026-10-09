import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults/layout';
import { computeFloatPlan, resolveResourcePlacement } from '../../pipeline/floatPlacement';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { parseMarkdown } from '../../parse';
import type { PostextConfig, Resource, ResourceType, VDTBlock, VDTDocument } from '../../index';

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

const px = (value: number) => ({ value, unit: 'px' as const });

/** A 600 × 400 px page, no margins, one column, a 24 px grid. */
const PAGE: PostextConfig = {
  page: { dpi: 144, width: px(600), height: px(400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};
const GRID = 24;
const withLayout = (layout: PostextConfig['layout'], base: PostextConfig = PAGE): PostextConfig => ({ ...base, layout: { ...base.layout, ...layout } });

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const picture = (id: string, w: number, h: number, placement?: Resource['placement'], more: Partial<Resource> = {}): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Plate ${id}.`, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: w, height: h },
  ...(placement ? { placement } : {}),
  ...more,
});

const floatsOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b, id: b.resourceBlock!.resource.id })));
const floatOf = (doc: VDTDocument, id: string) => floatsOf(doc).find((f) => f.id === id)!;
const bottom = (b: VDTBlock) => b.bbox.y + b.bbox.height;
/** Every block of a page's columns and floats, as JSON: a fingerprint. */
const fingerprint = (doc: VDTDocument): string => JSON.stringify(doc.pages.map((p) => ({
  floats: (p.floats ?? []).map((b) => [b.id, b.bbox, b.resourceBlock?.bodyRect, b.resourceBlock?.shrinkScale]),
  columns: p.columns.map((c) => [c.bbox, c.blocks.map((b) => [b.id, b.bbox, b.lines.map((l) => [l.text, l.bbox.y])])]),
})));

/** Two paragraphs, then a citation of `w`, then text enough for two pages. */
const citedLate = (id: string) => `${para(1)}\n\n${para(2)} :ref{id="${id}"}\n\n${filler(14, 3)}`;
/** At the 600 px measure a 3000 × 1500 picture stands 300 px tall, with its
 *  caption 336 px: a page holds it, the room under two paragraphs does not. */
const WIDE = [3000, 1500] as const;
/** A 3000 × 2000 picture stands 400 px tall at the measure (436 with its
 *  caption): taller than the page. */
const TALL = [3000, 2000] as const;

describe('placement.shrink (#626)', () => {
  it("'never' moves a float on to the next page, as before", () => {
    const doc = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE, { shrink: 'never' })] }, PAGE);
    const f = floatOf(doc, 'w');
    expect(f.page).toBe(1);
    expect(f.block.resourceBlock!.shrinkScale).toBeUndefined();
    expect(f.block.resourceBlock!.bodyRect.width).toBeCloseTo(600, 3);
    expect(doc.contentWarnings?.some((w) => w.kind === 'floatShrunk')).toBeFalsy();
  });

  it("'page' leaves a float that fits a fresh page at its size", () => {
    const doc = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE, { shrink: 'page' })] }, PAGE);
    const f = floatOf(doc, 'w');
    expect(f.page).toBe(1);
    expect(f.block.resourceBlock!.shrinkScale).toBeUndefined();
  });

  it("'slot' scales a float to the room left on its page, caption included, the band on the grid", () => {
    const doc = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE, { shrink: 'slot', minScale: 0.5 })] }, PAGE);
    const f = floatOf(doc, 'w');
    expect(f.page).toBe(0);
    const rb = f.block.resourceBlock!;
    expect(rb.shrinkScale).toBeGreaterThan(0.5);
    expect(rb.shrinkScale).toBeLessThan(1);
    // Aspect kept.
    expect(rb.bodyRect.height / rb.bodyRect.width).toBeCloseTo(0.5, 3);
    // The whole float stays on the page; its caption's last baseline is on
    // the grid (a bottom band), so the text above keeps its lines.
    expect(bottom(f.block)).toBeLessThanOrEqual(400 + 0.01);
    const last = rb.captionLines[rb.captionLines.length - 1]!;
    expect(((last.baseline + 0.2 * GRID) / GRID) % 1).toBeCloseTo(0, 3);
    const col = doc.pages[0]!.columns[0]!;
    expect(bottom(col.blocks[col.blocks.length - 1]!)).toBeLessThanOrEqual(f.block.bbox.y + 0.01);
    const warning = doc.contentWarnings?.find((w) => w.kind === 'floatShrunk');
    expect(warning).toMatchObject({ kind: 'floatShrunk', resourceId: 'w', pageIndex: 0 });
    expect(warning && 'overflowPx' in warning ? warning.overflowPx : undefined).toBeUndefined();
  });

  it("'slot' moves on when the room left needs less than minScale", () => {
    const loose = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE, { shrink: 'slot', minScale: 0.5 })] }, PAGE);
    const scale = floatOf(loose, 'w').block.resourceBlock!.shrinkScale!;
    const strict = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE, { shrink: 'slot', minScale: scale + 0.05 })] }, PAGE);
    const f = floatOf(strict, 'w');
    expect(f.page).toBe(1);
    expect(f.block.resourceBlock!.shrinkScale).toBeUndefined();
  });

  it("'page' scales a float taller than a fresh page's band to that band", () => {
    const never = buildDocument({ markdown: citedLate('t'), resources: [picture('t', ...TALL)] }, PAGE);
    // Today: placed whole, running past the page.
    expect(bottom(floatOf(never, 't').block)).toBeGreaterThan(400);
    const doc = buildDocument({ markdown: citedLate('t'), resources: [picture('t', ...TALL, { shrink: 'page' })] }, PAGE);
    const f = floatOf(doc, 't');
    expect(f.page).toBe(1);
    // A top band rounds up to the grid: 16 lines (384 px) hold the float
    // and its gap.
    expect(f.block.bbox.height).toBeCloseTo(16 * GRID - GRID, 3);
    expect(f.block.resourceBlock!.shrinkScale).toBeCloseTo(324 / 400, 3);
    // The text under it starts on the grid.
    const col = doc.pages[1]!.columns[0]!;
    expect(col.bbox.y).toBeCloseTo(16 * GRID, 3);
  });

  it("'page' sets a float at minScale and lets it run past the band when even that does not fit", () => {
    const doc = buildDocument({ markdown: citedLate('t'), resources: [picture('t', ...TALL, { shrink: 'page', minScale: 0.95 })] }, PAGE);
    const f = floatOf(doc, 't');
    expect(f.page).toBe(1);
    expect(f.block.resourceBlock!.shrinkScale).toBeCloseTo(0.95, 3);
    expect(bottom(f.block)).toBeGreaterThan(400);
    const warning = doc.contentWarnings?.find((w) => w.kind === 'floatShrunk');
    expect(warning).toMatchObject({ kind: 'floatShrunk', resourceId: 't', scale: 0.95, pageIndex: 1 });
    expect(warning && 'overflowPx' in warning ? warning.overflowPx : 0).toBeGreaterThan(0);
  });

  it('crops a picture within its safe area before it scales it', () => {
    // The safe area is the middle half of the picture's height: cropping
    // alone brings the body from 400 to 324 px, at full width.
    const cropped = picture('t', ...TALL, { shrink: 'page' }, { safeArea: { x: 0, y: 0.25, width: 1, height: 0.5 } });
    const doc = buildDocument({ markdown: citedLate('t'), resources: [cropped] }, PAGE);
    const rb = floatOf(doc, 't').block.resourceBlock!;
    expect(rb.shrinkScale).toBeUndefined();
    expect(rb.bodyRect.width).toBeCloseTo(600, 3);
    expect(rb.bodyRect.height).toBeCloseTo(324, 3);
    expect(rb.bodySource).toBeDefined();
    // A narrow safe area runs out first: then the picture scales.
    const tight = picture('t', ...TALL, { shrink: 'page' }, { safeArea: { x: 0, y: 0.1, width: 1, height: 0.85 } });
    const rb2 = floatOf(buildDocument({ markdown: citedLate('t'), resources: [tight] }, PAGE), 't').block.resourceBlock!;
    expect(rb2.bodyRect.height).toBeCloseTo(324, 3);
    // Cropped to the safe area's 340 px first, then scaled by 324 / 340.
    expect(rb2.shrinkScale).toBeCloseTo(324 / 340, 3);
  });

  it("captionMeasure 'body' sets the caption at the picture's width, aligned with it", () => {
    const caption = 'A long caption that runs across more than one line when it is set at the width of the shrunk picture rather than the page.';
    const at = (captionMeasure: 'slot' | 'body', align: 'left' | 'center') =>
      floatOf(buildDocument({ markdown: citedLate('t'), resources: [picture('t', ...TALL, { shrink: 'page', align, captionMeasure }, { caption })] }, PAGE), 't').block.resourceBlock!;
    const slot = at('slot', 'center');
    expect(Math.max(...slot.captionLines.map((l) => l.bbox.x + l.bbox.width))).toBeGreaterThan(slot.bodyRect.x + slot.bodyRect.width + 1);
    const body = at('body', 'center');
    expect(body.bodyRect.x).toBeGreaterThan(0);
    for (const l of body.captionLines) {
      expect(l.bbox.x).toBeGreaterThanOrEqual(body.bodyRect.x - 0.5);
      expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(body.bodyRect.x + body.bodyRect.width + 0.5);
    }
    // A taller caption leaves the picture less room.
    expect(body.bodyRect.width).toBeLessThan(slot.bodyRect.width);
    // Centred: the picture's centre is the slot's.
    expect(body.bodyRect.x + body.bodyRect.width / 2).toBeCloseTo(300, 1);
  });

  it('two consecutive builds are identical', () => {
    const resources = [picture('w', ...WIDE, { shrink: 'slot', minScale: 0.5 }), picture('t', ...TALL, { shrink: 'page' })];
    const md = `${para(1)}\n\n${para(2)} :ref{id="w"}\n\n${filler(6, 3)} :ref{id="t"}\n\n${filler(12, 10)}`;
    const config: PostextConfig = { ...PAGE, layout: { layoutType: 'double' }, headings: { levels: [{ level: 1 }] } };
    const a = buildDocument({ markdown: md, resources }, config);
    const b = buildDocument({ markdown: md, resources }, config);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe('placement.shrink on multi-column pages (#626)', () => {
  /** Three columns 180 px wide (30 px gutters) on a 600 × 400 page. */
  const THREE: PostextConfig = {
    ...PAGE,
    layout: { layoutType: 'multiple', columnCount: 3, gutterWidth: px(30) },
  };
  const tallFor = (w: number) => [3000, Math.round(3000 * (440 / w))] as const;

  it('a column float shrinks to its column', () => {
    const r = picture('c', ...tallFor(180), { shrink: 'page' });
    const f = floatOf(buildDocument({ markdown: citedLate('c'), resources: [r] }, THREE), 'c');
    expect(f.block.resourceBlock!.shrinkScale).toBeLessThan(1);
    expect(f.block.bbox.width).toBeCloseTo(180, 0);
    expect(bottom(f.block)).toBeLessThanOrEqual(400 + 0.01);
  });

  it('a float across two columns shrinks to them', () => {
    const r = picture('c', ...tallFor(390), { shrink: 'page', columns: 2 });
    const f = floatOf(buildDocument({ markdown: citedLate('c'), resources: [r] }, THREE), 'c');
    expect(f.block.resourceBlock!.shrinkScale).toBeLessThan(1);
    expect(f.block.bbox.width).toBeCloseTo(390, 0);
    expect(bottom(f.block)).toBeLessThanOrEqual(400 + 0.01);
  });

  it('a page-span float shrinks to the page', () => {
    const r = picture('c', ...tallFor(600), { shrink: 'page', span: 'page' });
    const f = floatOf(buildDocument({ markdown: citedLate('c'), resources: [r] }, THREE), 'c');
    expect(f.block.resourceBlock!.shrinkScale).toBeLessThan(1);
    expect(f.block.bbox.width).toBeCloseTo(600, 0);
    expect(bottom(f.block)).toBeLessThanOrEqual(400 + 0.01);
  });

  it("a page-span float takes the band left under the text with 'slot', and the next page without", () => {
    const md = `# Opening\n\n${para(1)} :ref{id="p"}\n\n${filler(20, 2)}`;
    const config: PostextConfig = { ...PAGE, layout: { layoutType: 'double' } };
    // 300 px of picture and 36 of caption: it fits a fresh page, not the
    // room under the head and the first paragraph.
    const at = (shrink: 'never' | 'page' | 'slot') =>
      floatOf(buildDocument({ markdown: md, resources: [picture('p', ...WIDE, { span: 'page', shrink, minScale: 0.5 })] }, config), 'p');
    expect(at('never').page).toBe(1);
    expect(at('never').block.resourceBlock!.shrinkScale).toBeUndefined();
    expect(at('page').page).toBe(1);
    expect(at('page').block.resourceBlock!.shrinkScale).toBeUndefined();
    const slot = at('slot');
    expect(slot.page).toBe(0);
    expect(slot.block.resourceBlock!.shrinkScale).toBeLessThan(1);
    expect(bottom(slot.block)).toBeLessThanOrEqual(400 + 0.01);
  });

  it("a side float shrinks to the side column's room below its citation with 'slot'", () => {
    const config: PostextConfig = { ...PAGE, layout: { layoutType: 'oneAndHalf', sideColumnRole: 'floats', sideColumnPercent: 40, gutterWidth: px(20) } };
    const md = `${filler(4)} :ref{id="s"}\n\n${filler(16, 5)}`;
    // As tall as the column at its width: it fits an empty side column, not
    // the room under the citing line.
    const at = (shrink: 'never' | 'slot') => {
      const doc = buildDocument({ markdown: md, resources: [picture('s', 3000, 4400, { span: 'side', shrink, minScale: 0.3 })] }, config);
      return { doc, f: floatOf(doc, 's') };
    };
    const never = at('never');
    expect(never.f.page).toBe(1);
    const slot = at('slot');
    expect(slot.f.page).toBe(0);
    expect(slot.f.block.resourceBlock!.shrinkScale).toBeLessThan(1);
    expect(bottom(slot.f.block)).toBeLessThanOrEqual(400 + 0.01);
  });

  it('a rotated float ignores shrink', () => {
    const r = picture('r', 3000, 2000, { rotate: 'ccw', shrink: 'slot', minScale: 0.2 });
    const plan = resolveResourcePlacement(r, undefined);
    expect(plan.shrink).toBe('never');
    const doc = buildDocument({ markdown: citedLate('r'), resources: [r] }, PAGE);
    expect(floatOf(doc, 'r').block.resourceBlock!.shrinkScale).toBeUndefined();
  });
});

describe('placement.shrink resolution (#626)', () => {
  const type: ResourceType = {
    id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never',
    counterFormat: 'decimal', captionPrefix: 'Figure', defaultPlacement: { shrink: 'page', minScale: 0.6 },
  };

  it('reads the resource, then its type, then layout.floatShrink', () => {
    const plain = picture('a', 10, 10);
    expect(resolveResourcePlacement(plain, undefined)).toMatchObject({ shrink: 'never', minScale: 0.7 });
    expect(resolveResourcePlacement(plain, undefined, false, { mode: 'slot', minScale: 0.4 })).toMatchObject({ shrink: 'slot', minScale: 0.4 });
    expect(resolveResourcePlacement(plain, type, false, { mode: 'slot', minScale: 0.4 })).toMatchObject({ shrink: 'page', minScale: 0.6 });
    expect(resolveResourcePlacement(picture('a', 10, 10, { shrink: 'never', minScale: 0.9 }), type)).toMatchObject({ shrink: 'never', minScale: 0.9 });
    // Out-of-range or misspelt values fall through.
    expect(resolveResourcePlacement(picture('a', 10, 10, { shrink: 'always' as never, minScale: 2 }), type)).toMatchObject({ shrink: 'page', minScale: 0.6 });
  });

  it('applies to pictures only, never inline embeds or tables', () => {
    const table: Resource = { id: 'tb', typeId: 'figure', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: { rows: [[{ content: 'x' }]] } } };
    expect(resolveResourcePlacement(table, type).shrink).toBe('never');
    expect(resolveResourcePlacement(picture('a', 10, 10, { position: 'here' }), type).shrink).toBe('never');
    const video: Resource = { id: 'v', typeId: 'figure', kind: 'video', createdAt: 0, updatedAt: 0, video: { source: 'file', url: 'x.mp4' } as never };
    expect(resolveResourcePlacement(video, type).shrink).toBe('page');
  });

  it('carries shrink into the float plan only when set', () => {
    const blocks = parseMarkdown('Text :ref{id="a"} and :ref{id="b"}.');
    const plan = computeFloatPlan(blocks, [picture('a', 10, 10), picture('b', 10, 10, { shrink: 'slot' })], [], undefined, false);
    expect(plan[0]).not.toHaveProperty('shrink');
    expect(plan[1]).toMatchObject({ shrink: 'slot', minScale: 0.7 });
    const byDefault = computeFloatPlan(blocks, [picture('a', 10, 10)], [], undefined, false, { mode: 'page', minScale: 0.5 });
    expect(byDefault[0]).toMatchObject({ shrink: 'page', minScale: 0.5 });
  });

  it('layout.floatShrink resolves and strips like the other layout keys', () => {
    expect(resolveLayoutConfig().floatShrink).toEqual({ mode: 'never', minScale: 0.7 });
    expect(resolveLayoutConfig({ floatShrink: { mode: 'page' } }).floatShrink).toEqual({ mode: 'page', minScale: 0.7 });
    expect(resolveLayoutConfig({ floatShrink: { mode: 'bogus' as never, minScale: 0 } }).floatShrink).toEqual({ mode: 'never', minScale: 0.7 });
    expect(stripLayoutDefaults({ floatShrink: { mode: 'never', minScale: 0.7 } })).toBeUndefined();
    expect(stripLayoutDefaults({ floatShrink: { mode: 'slot', minScale: 0.7 } })).toEqual({ floatShrink: { mode: 'slot' } });
  });

  it('layout.floatShrink applies to every picture float', () => {
    const doc = buildDocument({ markdown: citedLate('w'), resources: [picture('w', ...WIDE)] }, withLayout({ floatShrink: { mode: 'slot', minScale: 0.5 } }));
    expect(floatOf(doc, 'w').page).toBe(0);
    expect(floatOf(doc, 'w').block.resourceBlock!.shrinkScale).toBeLessThan(1);
  });
});

describe('layoutResourceBlock maxBodyHeight (#626)', () => {
  const resolved = resolveAllConfig(PAGE);
  const lay = (resource: Resource, more: Partial<Parameters<typeof layoutResourceBlock>[0]> = {}) => layoutResourceBlock({
    resource, resourceType: undefined, number: '1', resolved, columnWidth: 600,
    resourceNumbering: {}, resourceTypes: [], resources: [resource], ...more,
  });

  it('scales the body to the cap, never below minBodyScale, and records the scale', () => {
    const r = picture('t', ...TALL);
    expect(lay(r).block.shrinkScale).toBeUndefined();
    const capped = lay(r, { maxBodyHeight: 200 });
    expect(capped.block.bodyRect.height).toBeCloseTo(200, 3);
    expect(capped.block.bodyRect.width).toBeCloseTo(300, 3);
    expect(capped.block.shrinkScale).toBeCloseTo(0.5, 3);
    const floor = lay(r, { maxBodyHeight: 200, minBodyScale: 0.8 });
    expect(floor.block.bodyRect.height).toBeCloseTo(320, 3);
    expect(floor.block.shrinkScale).toBeCloseTo(0.8, 3);
    // A cap the body already fits leaves it alone.
    expect(lay(r, { maxBodyHeight: 500 }).block.shrinkScale).toBeUndefined();
  });

  it('keeps the balancing lever from growing a capped picture past its room', () => {
    const r = picture('t', ...TALL, undefined, { safeArea: { x: 0, y: 0.25, width: 1, height: 0.5 } });
    const capped = lay(r, { maxBodyHeight: 300, bodyHeightDelta: 80 });
    expect(capped.block.bodyRect.height).toBeCloseTo(300, 3);
    expect(capped.block.bodyFlex?.grow ?? 0).toBeCloseTo(0, 3);
  });
});
