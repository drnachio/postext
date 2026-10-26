import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { composedOrder, layoutGroup, shareOut, type GroupItem, type GroupLayoutInput } from '../../../composed/groups.js';
import { composedReflowLog, describeReflowEvent, reflowEvents } from '../../../composed/reflowLog.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

// Deterministic text measurement stub (no DOM in the node test env): seven
// px per character, whatever the face.
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
const MM = DPI / 25.4;

const item = (name: string, want: number, extra: Partial<GroupItem> = {}): GroupItem => ({
  name,
  own: { x: 0, y: 0, width: 100, height: want },
  want,
  min: 0,
  max: Infinity,
  minWidth: 0,
  maxWidth: Infinity,
  grow: 0,
  shrink: 0,
  priority: 0,
  pin: false,
  fixedHeight: false,
  ...extra,
});
const stack = (items: GroupItem[], extra: Partial<GroupLayoutInput> = {}) =>
  layoutGroup({ kind: 'stack', box: { x: 0, y: 100, width: 100, height: 0 }, elastic: true, limit: { x: 0, y: 0, width: 1000, height: 2000 }, gap: 10, align: 'start', items, mmPx: MM, negotiate: true, ...extra });

describe('stack groups (#856)', () => {
  it('lays its frames at their natural heights, one under another, with the gap', () => {
    const r = stack([item('a', 50), item('b', 30, { min: 40 }), item('c', 20, { max: 15 })]);
    expect(r.get('a')).toEqual({ x: 0, y: 100, width: 100, height: 50 });
    // min/max clamp the content's height.
    expect(r.get('b')).toEqual({ x: 0, y: 160, width: 100, height: 40 });
    expect(r.get('c')).toEqual({ x: 0, y: 210, width: 100, height: 15 });
  });

  it('keeps each frame’s own x and width', () => {
    const r = stack([item('a', 50, { own: { x: 30, y: 0, width: 60, height: 50 } }), item('b', 20)]);
    expect(r.get('a')).toMatchObject({ x: 30, width: 60 });
    expect(r.get('b')).toMatchObject({ x: 0, width: 100 });
  });

  it('too tall: frames that shrink give space back, lowest priority first, down to their minimum', () => {
    const box = { x: 0, y: 0, width: 100, height: 200 };
    const items = [
      item('a', 100, { shrink: 1, priority: 2, min: 50 }),
      item('b', 100, { shrink: 1, priority: 1, min: 80 }),
      item('c', 40),
    ];
    // 240 + 20 of gaps in 200: 60 to give back. b (priority 1) gives 20
    // (down to 80), then a (priority 2) the other 40.
    const r = stack(items, { box, elastic: false });
    expect(r.get('b')!.height).toBe(80);
    expect(r.get('a')!.height).toBe(60);
    expect(r.get('c')!.height).toBe(40);
    expect(r.get('c')!.y + r.get('c')!.height).toBe(200);
  });

  it('frames of one priority give back in proportion to `shrink`', () => {
    const box = { x: 0, y: 0, width: 100, height: 140 };
    const r = stack([item('a', 100, { shrink: 1 }), item('b', 100, { shrink: 3 })], { box, elastic: false, gap: 0 });
    expect(r.get('a')!.height).toBeCloseTo(85, 6);
    expect(r.get('b')!.height).toBeCloseTo(55, 6);
  });

  it('when nothing yields, no frame runs past the group’s foot (its content overflows it)', () => {
    const r = stack([item('a', 1500), item('b', 600)], { limit: { x: 0, y: 0, width: 1000, height: 2000 } });
    expect(r.get('b')!.y + r.get('b')!.height).toBe(2000);
  });

  it('spare space goes to the frames that grow, in proportion, up to their maximum', () => {
    const box = { x: 0, y: 0, width: 100, height: 300 };
    const r = stack([item('a', 50, { grow: 1 }), item('b', 50, { grow: 3, max: 100 }), item('c', 50)], { box, elastic: false, gap: 0 });
    // 150 spare: b takes 3/4 but stops at 100 (50 more); a takes the rest.
    expect(r.get('b')!.height).toBe(100);
    expect(r.get('a')!.height).toBe(150);
    expect(r.get('c')!.y + r.get('c')!.height).toBe(300);
  });

  it('with no frame that grows, spare space follows `align`', () => {
    const box = { x: 0, y: 0, width: 100, height: 200 };
    const items = [item('a', 50), item('b', 50)];
    expect(stack(items, { box, elastic: false, gap: 0, align: 'end' }).get('a')!.y).toBe(100);
    expect(stack(items, { box, elastic: false, gap: 0, align: 'center' }).get('a')!.y).toBe(50);
    const between = stack(items, { box, elastic: false, gap: 0, align: 'space-between' });
    expect(between.get('a')!.y).toBe(0);
    expect(between.get('b')!.y).toBe(150);
    // An elastic group has no spare space.
    expect(stack(items, { gap: 0, align: 'end' }).get('a')!.y).toBe(100);
  });

  it('a pinned frame keeps its box and the others flow round its band', () => {
    const pinned = item('photo', 60, { pin: true, own: { x: 0, y: 160, width: 100, height: 60 } });
    const r = stack([item('a', 50), pinned, item('b', 30)]);
    expect(r.get('photo')).toEqual({ x: 0, y: 160, width: 100, height: 60 });
    // b would start at 160: it goes past the photo and its gap.
    expect(r.get('b')!.y).toBe(230);
    // A pinned frame outside the group is an obstacle too, where it
    // overlaps the frame across, its gap kept.
    const outside = stack([item('a', 50), item('b', 30)], { obstacles: [{ x: 50, y: 165, width: 40, height: 20 }] });
    expect(outside.get('a')!.y).toBe(100);
    expect(outside.get('b')!.y).toBe(195);
    const beside = stack([item('a', 50), item('b', 30, { own: { x: 0, y: 0, width: 40, height: 30 } })], { obstacles: [{ x: 50, y: 165, width: 40, height: 20 }] });
    expect(beside.get('b')!.y).toBe(160);
  });
});

describe('row groups (#856)', () => {
  /** Content of `area` square px: its height at a width. */
  const text = (area: number) => (w: number): number => Math.ceil(area / w);
  const row = (items: GroupItem[], extra: Partial<GroupLayoutInput> = {}) =>
    layoutGroup({ kind: 'row', box: { x: 0, y: 0, width: 1000, height: 400 }, elastic: false, limit: { x: 0, y: 0, width: 1000, height: 2000 }, gap: 20, align: 'start', items, mmPx: MM, negotiate: true, ...extra });
  const w = (width: number, extra: Partial<GroupItem> = {}): Partial<GroupItem> => ({ own: { x: 0, y: 0, width, height: 0 }, ...extra });

  it('lays its frames start to end with the gap, as tall as the row', () => {
    const r = row([item('a', 0, w(300)), item('b', 0, w(200))]);
    expect(r.get('a')).toEqual({ x: 0, y: 0, width: 300, height: 400 });
    expect(r.get('b')).toEqual({ x: 320, y: 0, width: 200, height: 400 });
  });

  it('a frame whose content runs past the row takes width from a sibling that shrinks, in whole millimetres, found by bisection', () => {
    const calls: number[] = [];
    const need = (width: number): number => {
      calls.push(width);
      return text(400 * 400)(width);
    };
    // 160 000 px² in a row 400 tall needs 400 px; it is 300 wide.
    const r = row([item('a', 0, w(300, { need })), item('b', 0, w(680, { shrink: 1, need: text(100 * 400) }))], { box: { x: 0, y: 0, width: 1000, height: 400 } });
    const a = r.get('a')!;
    const b = r.get('b')!;
    expect(a.width).toBeGreaterThanOrEqual(400);
    expect(text(160000)(a.width)).toBeLessThanOrEqual(400);
    // Whole millimetres taken: the fewest that make it fit.
    const took = (a.width - 300) / MM;
    expect(Math.abs(took - Math.round(took))).toBeLessThan(1e-9);
    expect(text(160000)(a.width - MM)).toBeGreaterThan(400);
    expect(b.width).toBeCloseTo(680 - (a.width - 300), 6);
    expect(b.x).toBeCloseTo(a.width + 20, 6);
    // Bisection: a handful of measures, not one per millimetre.
    expect(calls.length).toBeLessThan(20);
  });

  it('takes spare width first, then from the lowest priority, never past a sibling’s own fit', () => {
    const big = 400 * 600;
    // a needs 600 px at 400 tall; 100 spare; c (priority 0) can give
    // down to the width its own text needs; b (priority 1) gives the rest.
    const r = row([
      item('a', 0, w(300, { need: text(big) })),
      item('b', 0, w(250, { shrink: 1, priority: 1, need: text(400 * 50) })),
      item('c', 0, w(260, { shrink: 1, priority: 0, need: text(400 * 200) })),
    ]);
    expect(r.get('a')!.width).toBeGreaterThanOrEqual(600);
    expect(text(400 * 200)(r.get('c')!.width)).toBeLessThanOrEqual(400);
    expect(r.get('c')!.width).toBeLessThan(260);
    expect(r.get('b')!.width).toBeLessThan(250);
    const total = r.get('a')!.width + r.get('b')!.width + r.get('c')!.width + 40;
    expect(total).toBeLessThanOrEqual(1000 + 1e-6);
  });

  it('takes nothing when even all the room would not make it fit', () => {
    const r = row([item('a', 0, w(300, { need: text(1e9) })), item('b', 0, w(300, { shrink: 1, need: text(10) }))]);
    expect(r.get('a')!.width).toBe(300);
    expect(r.get('b')!.width).toBe(300);
  });

  it('spare width goes to the frames that grow; an elastic row grows as tall as its tallest frame needs', () => {
    const r = row([item('a', 0, w(300, { grow: 1 })), item('b', 0, w(300, { grow: 1, maxWidth: 350 }))]);
    expect(r.get('b')!.width).toBe(350);
    expect(r.get('a')!.width).toBe(1000 - 20 - 350);
    const elastic = row([item('a', 100, w(300, { min: 100, need: text(300 * 250) })), item('b', 80, w(300))], { elastic: true, box: { x: 10, y: 20, width: 0, height: 0 } });
    expect(elastic.get('a')).toMatchObject({ x: 10, y: 20, height: 250 });
    expect(elastic.get('b')).toMatchObject({ x: 330, height: 250 });
  });

  it('an elastic row of auto cards negotiates widths at their minHeight before it grows (#927)', () => {
    // a's text needs 250 at its 300 width, more than the 200 the cards
    // write; b's needs 120 and gives width. Before #927 the row took a's
    // content height (250) and nobody shared.
    const r = row([
      item('a', 250, w(300, { min: 200, need: text(300 * 250) })),
      item('b', 120, w(300, { min: 200, shrink: 1, need: text(300 * 120) })),
    ], { elastic: true, box: { x: 0, y: 0, width: 0, height: 0 } });
    expect(r.get('a')!.width).toBeGreaterThan(300);
    expect(text(300 * 250)(r.get('a')!.width)).toBeLessThanOrEqual(200 + 1e-6);
    expect(r.get('b')!.width).toBeLessThan(300);
    expect(r.get('a')!.height).toBe(200);
    expect(r.get('b')!.height).toBe(200);
    // When widths cannot help, the row still grows to the tallest content.
    const grows = row([item('a', 300, w(300, { min: 200, need: text(300 * 300) })), item('b', 120, w(300, { min: 200, need: text(300 * 120) }))], { elastic: true, box: { x: 0, y: 0, width: 0, height: 0 } });
    expect(grows.get('a')).toMatchObject({ width: 300, height: 300 });
    // Cards that write no height keep the old rule: the tallest content.
    const bare = row([item('a', 300, w(300, { need: text(300 * 300) })), item('b', 120, w(300, { shrink: 1, need: text(300 * 120) }))], { elastic: true, box: { x: 0, y: 0, width: 0, height: 0 } });
    expect(bare.get('a')).toMatchObject({ width: 300, height: 300 });
  });

  it('a pinned frame keeps its place; the others go past it', () => {
    const r = row([item('a', 0, w(300)), item('pin', 0, { pin: true, own: { x: 330, y: 0, width: 100, height: 400 } }), item('b', 0, w(200))]);
    expect(r.get('pin')).toEqual({ x: 330, y: 0, width: 100, height: 400 });
    expect(r.get('a')!.x).toBe(0);
    expect(r.get('b')!.x).toBe(450);
  });
});

describe('sharing space (#856)', () => {
  it('shares in proportion, none past its room, the rest to the others', () => {
    expect(shareOut(90, [{ weight: 1, room: 10 }, { weight: 1, room: 100 }, { weight: 0, room: 100 }])).toEqual([10, 80, 0]);
  });
});

describe('the order of a composed page with groups (#856)', () => {
  it('lays a group as one step, after what its frames anchor to, before what anchors to it or its frames', () => {
    const template = resolvePageTemplate({ pageTemplates: [{
      id: 't',
      frames: [
        { name: 'photo', placement: { anchor: { to: '#b', edge: 'top-right' } } },
        { name: 'a', placement: { anchor: { to: '#title', edge: 'below' } } },
        { name: 'b' },
        { name: 'title' },
        { name: 'foot', placement: { anchor: { to: '#boxes', edge: 'below' } } },
      ],
      groups: [{ name: 'boxes', frames: ['a', 'b'] }],
    }] }, 't')!;
    const steps = composedOrder(template).map((s) => (s.kind === 'frame' ? s.frame.name : `[${s.frames.map((f) => f.name).join(',')}]`));
    expect(steps).toEqual(['title', '[a,b]', 'photo', 'foot']);
  });
});

describe('the reflow log (#856)', () => {
  it('reports what grew and what moved, with the frame that set it off', () => {
    const r = (y: number, h: number) => ({ x: 0, y: y * MM, width: 100 * MM, height: h * MM });
    const events = reflowEvents([
      { name: 'dinero', declared: r(80, 36), final: r(80, 44), deps: [] },
      { name: 'fotos', declared: r(82, 30), final: r(82, 30), deps: ['dinero'] },
      { name: 'gasto', declared: r(128, 62), final: r(136, 62), deps: ['dinero'] },
      { name: 'gasto-fotos', declared: r(137, 40), final: r(145, 40), deps: ['gasto'] },
    ], MM);
    expect(events).toEqual([
      { frame: 'dinero', kind: 'grew', fromMm: 36, toMm: 44 },
      { frame: 'gasto', kind: 'moved', fromMm: 128, toMm: 136, cause: 'dinero' },
      { frame: 'gasto-fotos', kind: 'moved', fromMm: 137, toMm: 145, cause: 'dinero' },
    ]);
    expect(events.map(describeReflowEvent).join('; ')).toBe('dinero grew 8 mm; gasto moved down 8 mm; gasto-fotos moved down 8 mm');
  });

  it('in a row, the cards that give width name the card that grew, not each other (#877)', () => {
    const r = (x: number, w: number) => ({ x: x * MM, y: 0, width: w * MM, height: 100 * MM });
    // c3 took 12 mm: c1 gave 9 and c2 gave 3, and each card depends on the others of its row.
    const events = reflowEvents([
      { name: 'c1', declared: r(0, 56), final: r(0, 47), deps: ['c2', 'c3'] },
      { name: 'c2', declared: r(61, 56), final: r(52, 53), deps: ['c1', 'c3'] },
      { name: 'c3', declared: r(122, 56), final: r(110, 68), deps: ['c1', 'c2'] },
    ], MM);
    expect(events.map(describeReflowEvent)).toEqual([
      'c1 narrowed 9 mm for c3', 'c2 narrowed 3 mm for c3', 'c2 moved left 9 mm',
      'c3 grew 12 mm wider', 'c3 moved left 12 mm',
    ]);
    expect(events.filter((e) => e.kind === 'resized').every((e) => e.cause === 'c3')).toBe(true);
  });

  it('words every kind', () => {
    expect(describeReflowEvent({ frame: 'a', kind: 'resized', fromMm: 60, toMm: 52, cause: 'b' })).toBe('a gave up 8 mm for b');
    expect(describeReflowEvent({ frame: 'a', kind: 'resized', fromMm: 60, toMm: 52, axis: 'x', cause: 'b' })).toBe('a narrowed 8 mm for b');
    expect(describeReflowEvent({ frame: 'a', kind: 'grew', fromMm: 60, toMm: 64.5, axis: 'x' })).toBe('a grew 4.5 mm wider');
    expect(describeReflowEvent({ frame: 'a', kind: 'moved', fromMm: 60, toMm: 52 })).toBe('a moved up 8 mm');
    expect(describeReflowEvent({ frame: 'a', kind: 'moved', fromMm: 60, toMm: 64, axis: 'x' })).toBe('a moved right 4 mm');
    expect(describeReflowEvent({ frame: 'a', kind: 'overflow', toMm: 3.2 })).toBe('a overflows by 3.2 mm');
  });
});

// ---------------------------------------------------------------------------
// Laid out
// ---------------------------------------------------------------------------

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const build = (md: string, templates: PageTemplate[], extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: templates }, createMeasurementCache());
const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const paras = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w} ${i} `.repeat(30).trim()).join('\n\n');
const toMm = (v: number): number => v / MM;

/** The stand-in's Markdown with `extra` more paragraphs in its first box. */
const lengthened = (markdown: string, extra: string): string => markdown.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${extra}\n\n`);

describe('the page-8 stand-in reflows (#856)', () => {
  for (const locale of ['es', 'en'] as const) {
    it(`${locale}: a longer first box moves the boxes below down the page, and the log says so`, () => {
      const { markdown, config, resources } = page8Fixture(locale);
      const before = buildDocument({ markdown, resources }, config, createMeasurementCache());
      const page0 = before.pages[0]!;
      // The template's own drawing holds the page's text: nothing to report
      // but what the overlap checks find (#1053): the stand-in's photos hang
      // a millimetre or two past the foot of their boxes.
      const reflowOnly = (events: readonly { kind: string }[]) => events.filter((e) => e.kind !== 'covered' && e.kind !== 'outside');
      expect(reflowOnly(page0.composed!.log)).toEqual([]);
      expect(composedReflowLog(before).flatMap((e) => reflowOnly(e.events))).toEqual([]);
      const longer = lengthened(markdown, paras(3, locale === 'es' ? 'Más dinero' : 'More money'));
      const after = buildDocument({ markdown: longer, resources }, config, createMeasurementCache());
      const page1 = after.pages[0]!;
      expect(after.pages).toHaveLength(1);
      const grew = toMm(frameOf(page1, 'dinero').rect.height - frameOf(page0, 'dinero').rect.height);
      expect(grew).toBeGreaterThan(5);
      for (const name of ['gasto', 'gasto-fotos', 'ahorro', 'ahorro-fotos']) {
        expect(toMm(frameOf(page1, name).rect.y - frameOf(page0, name).rect.y)).toBeCloseTo(grew, 1);
      }
      // The box's own pictures and the boxes above stay.
      for (const name of ['titulo', 'texto', 'dinero', 'dinero-fotos']) expect(frameOf(page1, name).rect.y).toBe(frameOf(page0, name).rect.y);
      const log = page1.composed!.log;
      expect(log[0]).toMatchObject({ frame: 'dinero', kind: 'grew', fromMm: 36 });
      expect(log.filter((e) => e.kind === 'moved').map((e) => [e.frame, e.cause])).toEqual([
        ['gasto', 'dinero'], ['gasto-fotos', 'dinero'], ['ahorro', 'dinero'], ['ahorro-fotos', 'dinero'],
      ]);
      const [entry] = composedReflowLog(after);
      const by = Math.round(grew * 10) / 10;
      expect(entry!.lines.slice(0, 2)).toEqual([`dinero grew ${by} mm`, `gasto moved down ${by} mm`]);
      expect(entry!.template).toBe('tema-cajas');
      // The declared boxes are the template's, whatever the text.
      expect(frameOf(page1, 'gasto').declaredRect).toEqual(frameOf(page0, 'gasto').rect);
      expect((after.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow')).toEqual([]);
    });
  }

  it('is deterministic: the same input gives the same VDT', () => {
    const { markdown, config, resources } = page8Fixture('es');
    const md = lengthened(markdown, paras(2, 'Otra vez'));
    const a = buildDocument({ markdown: md, resources }, config, createMeasurementCache());
    const b = buildDocument({ markdown: md, resources }, config, createMeasurementCache());
    expect(JSON.stringify(b.pages)).toBe(JSON.stringify(a.pages));
  });
});

describe('groups, pins and decoration laid out (#856)', () => {
  const STACK: PageTemplate = {
    id: 's',
    decoration: {
      elements: [
        { kind: 'rule', id: 'under-a', direction: 'horizontal', color: { hex: '#000000' }, thickness: mm(0.5), placement: { anchor: { to: '#a', edge: 'below' }, size: { width: mm(50) } } },
        { kind: 'rule', id: 'art', pin: true, direction: 'horizontal', color: { hex: '#000000' }, thickness: mm(0.5), placement: { anchor: { to: '#b', edge: 'below' }, size: { width: mm(50) } } },
      ],
    } as never,
    frames: [
      { name: 'a', minHeight: mm(20) },
      { name: 'b', minHeight: mm(20) },
      { name: 'mark', pin: true, width: mm(20), height: mm(10), placement: { anchor: { to: '#b', edge: 'top-right' } } },
      { name: 'loose', width: mm(20), height: mm(10), placement: { anchor: { to: '#b', edge: 'top-right' } } },
    ],
    groups: [{ name: 'g', frames: ['a', 'b'], gap: mm(5) }],
  };
  const page = (a: string) => `::::page{template="s"}\n:::frame{slot="a"}\n${a}\n:::\n\n:::frame{slot="b"}\nB.\n:::\n::::`;

  it('decoration anchored to a frame moves with it; a pinned element and a pinned frame stay', () => {
    const short = composedPages(build(page('A.'), [STACK]))[0]!;
    const long = composedPages(build(page(paras(6, 'grow')), [STACK]))[0]!;
    const moved = long.composed!.frames.find((f) => f.name === 'b')!.rect.y - short.composed!.frames.find((f) => f.name === 'b')!.rect.y;
    expect(toMm(moved)).toBeGreaterThan(5);
    // Decoration blocks come in element order: the rule under `a`, then the pinned one.
    const rule = (p: VDTPage, k: number) => p.composed!.decoration!.blocks.filter((b) => b.kind === 'rule')[k]!.bbox;
    expect(rule(long, 1).y - rule(short, 1).y).toBeCloseTo(0, 6);
    expect(rule(long, 0).y - rule(short, 0).y).toBeGreaterThan(MM * 5);
    // A pinned frame stays where the template puts it; one not pinned moves with its anchor.
    expect(frameOf(long, 'mark').rect).toEqual(frameOf(short, 'mark').rect);
    expect(frameOf(long, 'loose').rect.y - frameOf(short, 'loose').rect.y).toBeCloseTo(moved, 3);
    expect(long.composed!.log.map((e) => `${e.frame} ${e.kind}`)).toEqual(['a grew', 'b moved', 'loose moved']);
  });

  it('a change on one composed page moves nothing on another', () => {
    const two = (a: string) => `${page(a)}\n\n${page('A.')}`;
    const before = composedPages(build(two('A.'), [STACK]));
    const after = composedPages(build(two(paras(6, 'grow')), [STACK]));
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(2);
    expect(after[1]!.index).toBe(before[1]!.index);
    // Its frames stand where they stood (their source offsets follow the
    // longer text above them in the file).
    const boxes = (p: VDTPage) => p.composed!.frames.map((f) => ({ name: f.name, rect: f.rect, declaredRect: f.declaredRect, overflowPx: f.overflowPx }));
    expect(boxes(after[1]!)).toEqual(boxes(before[1]!));
    expect(after[1]!.composed!.log).toEqual([]);
    expect(after[0]!.composed!.log.length).toBeGreaterThan(0);
  });

  it('a stack with its own box gives spare space to the frame that grows', () => {
    const t: PageTemplate = {
      id: 's',
      frames: [{ name: 'a' }, { name: 'b', grow: 1 }],
      groups: [{ name: 'g', frames: ['a', 'b'], gap: mm(5), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: mm(150) } } }],
    };
    const p = composedPages(build(page('A.'), [t]))[0]!;
    const a = frameOf(p, 'a').rect;
    const b = frameOf(p, 'b').rect;
    expect(toMm(b.y + b.height - a.y)).toBeCloseTo(150, 3);
    expect(toMm(b.y - (a.y + a.height))).toBeCloseTo(5, 3);
    expect(p.composed!.log.some((e) => e.frame === 'b' && e.kind === 'grew')).toBe(false);
  });

  it('a row gives the frame whose text runs past the row the width it needs from a sibling that shrinks', () => {
    const t: PageTemplate = {
      id: 'r',
      frames: [{ name: 'a', width: mm(60) }, { name: 'b', width: mm(90), shrink: 1 }],
      groups: [{ name: 'g', kind: 'row', frames: ['a', 'b'], gap: mm(5), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(155), height: mm(40) } } }],
    };
    const md = `::::page{template="r"}\n:::frame{slot="a"}\n${paras(4, 'wide')}\n:::\n\n:::frame{slot="b"}\nB.\n:::\n::::`;
    const p = composedPages(build(md, [t]))[0]!;
    const a = frameOf(p, 'a');
    const b = frameOf(p, 'b');
    expect(toMm(a.rect.width)).toBeGreaterThan(60);
    const exact = toMm(a.rect.width) - 60;
    expect(Math.abs(exact - Math.round(exact))).toBeLessThan(1e-6);
    const took = Math.round(exact);
    expect(toMm(b.rect.width)).toBeCloseTo(90 - took, 6);
    expect(a.overflowPx).toBe(0);
    expect(p.composed!.log.map(describeReflowEvent)).toEqual([`a grew ${took} mm wider`, `b narrowed ${took} mm for a`, `b moved right ${took} mm`]);
  });
});
